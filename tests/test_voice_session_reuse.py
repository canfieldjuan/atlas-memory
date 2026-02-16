"""
Tests for voice pipeline session creation via SessionRepository (GAP-9).

Verifies that:
- _ensure_session uses SessionRepository instead of raw SQL
- Daily session reuse: same node_id on same day reuses session
- New session created when no matching session exists
- terminal_id is properly set to node_id
- Conversation turns persist across pipeline restarts (same session)
"""

import inspect
from datetime import date
from uuid import UUID

import pytest
import pytest_asyncio

from atlas_brain.storage.repositories.session import get_session_repo


# ------------------------------------------------------------------ #
# Wiring verification: pipeline.py uses SessionRepository
# ------------------------------------------------------------------ #


class TestPipelineSessionWiring:
    """Verify _ensure_session uses SessionRepository, not raw SQL."""

    def test_no_raw_insert_sessions(self):
        """_ensure_session does not contain raw INSERT INTO sessions."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline._ensure_session)
        assert "INSERT INTO sessions" not in source

    def test_uses_session_repo(self):
        """_ensure_session imports and uses get_session_repo."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline._ensure_session)
        assert "get_session_repo" in source

    def test_uses_create_session(self):
        """_ensure_session calls repo.create_session for new sessions."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline._ensure_session)
        assert "repo.create_session" in source

    def test_uses_touch_session_for_reuse(self):
        """_ensure_session calls repo.touch_session when reusing."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline._ensure_session)
        assert "repo.touch_session" in source

    def test_queries_by_terminal_and_date(self):
        """_ensure_session looks up session by terminal_id + session_date."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline._ensure_session)
        assert "terminal_id" in source
        assert "session_date" in source


# ------------------------------------------------------------------ #
# Integration tests: session reuse and creation with real DB
# ------------------------------------------------------------------ #


@pytest.mark.integration
class TestVoiceSessionCreationIntegration:
    """Integration tests for daily session reuse logic."""

    @pytest.mark.asyncio
    async def test_new_session_created_with_terminal(self, db_pool):
        """Creating a session via repo sets terminal_id from node_id."""
        repo = get_session_repo()
        node_id = "voice-node-test-1"

        session = await repo.create_session(
            user_id=None,
            terminal_id=node_id,
            metadata={"source": "voice_pipeline", "node_id": node_id},
        )

        assert session.terminal_id == node_id
        assert session.is_active is True
        assert session.session_date == date.today()
        assert session.metadata.get("source") == "voice_pipeline"

        # Cleanup
        await repo.close_session(session.id)

    @pytest.mark.asyncio
    async def test_daily_reuse_by_terminal_id(self, db_pool):
        """Same terminal_id on same day finds existing active session."""
        node_id = "voice-node-test-reuse"
        today = date.today()

        # Create first session
        repo = get_session_repo()
        first = await repo.create_session(
            user_id=None,
            terminal_id=node_id,
            metadata={"source": "voice_pipeline", "node_id": node_id},
        )

        # Query for today's session by terminal_id (mirrors _ensure_session logic)
        pool = db_pool
        row = await pool.fetchrow(
            """SELECT id FROM sessions
               WHERE terminal_id = $1 AND session_date = $2 AND is_active = true
               LIMIT 1""",
            node_id,
            today,
        )

        assert row is not None
        assert row["id"] == first.id

        # Cleanup
        await repo.close_session(first.id)

    @pytest.mark.asyncio
    async def test_no_reuse_after_close(self, db_pool):
        """Closed session is not reused for same terminal_id."""
        node_id = "voice-node-test-closed"
        today = date.today()

        repo = get_session_repo()
        first = await repo.create_session(
            user_id=None,
            terminal_id=node_id,
        )
        await repo.close_session(first.id)

        # Query should find nothing (session is closed)
        row = await db_pool.fetchrow(
            """SELECT id FROM sessions
               WHERE terminal_id = $1 AND session_date = $2 AND is_active = true
               LIMIT 1""",
            node_id,
            today,
        )
        assert row is None

    @pytest.mark.asyncio
    async def test_turns_survive_reuse(self, db_pool):
        """Conversation turns persist when session is reused."""
        from atlas_brain.storage.repositories.conversation import get_conversation_repo
        import atlas_brain.storage.repositories.conversation as conv_module
        conv_module._conversation_repo = None

        node_id = "voice-node-test-turns"
        today = date.today()

        repo = get_session_repo()
        conv_repo = get_conversation_repo()

        # Create session and add a turn
        session = await repo.create_session(
            user_id=None,
            terminal_id=node_id,
            metadata={"source": "voice_pipeline"},
        )
        await conv_repo.add_turn(
            session_id=session.id,
            role="user",
            content="What is the weather?",
            turn_type="conversation",
        )

        # Simulate pipeline restart: find existing session by terminal_id
        row = await db_pool.fetchrow(
            """SELECT id FROM sessions
               WHERE terminal_id = $1 AND session_date = $2 AND is_active = true
               LIMIT 1""",
            node_id,
            today,
        )
        assert row is not None
        reused_id = row["id"]
        assert reused_id == session.id

        # Add another turn on the reused session
        await conv_repo.add_turn(
            session_id=reused_id,
            role="assistant",
            content="It is sunny!",
            turn_type="conversation",
        )

        # Verify both turns are in the same session
        turns = await conv_repo.get_history(reused_id, limit=10)
        assert len(turns) == 2
        assert turns[0].content == "What is the weather?"
        assert turns[1].content == "It is sunny!"

        # Cleanup
        await repo.close_session(session.id)

    @pytest.mark.asyncio
    async def test_different_nodes_different_sessions(self, db_pool):
        """Different node_ids create separate sessions."""
        repo = get_session_repo()

        s1 = await repo.create_session(
            user_id=None,
            terminal_id="node-alpha",
        )
        s2 = await repo.create_session(
            user_id=None,
            terminal_id="node-beta",
        )

        assert s1.id != s2.id
        assert s1.terminal_id == "node-alpha"
        assert s2.terminal_id == "node-beta"

        # Cleanup
        await repo.close_session(s1.id)
        await repo.close_session(s2.id)
