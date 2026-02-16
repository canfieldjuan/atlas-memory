"""
Integration tests for session ID normalization (GAP-7).

Verifies that non-UUID session IDs (sha256 hex hashes, arbitrary
strings, telephony SIDs, None) are deterministically converted to
valid UUIDs and that matching sessions rows are created so FK
constraints on conversation_turns are satisfied.
"""

import json
from uuid import UUID

import pytest
import pytest_asyncio

from atlas_brain.utils.session_id import normalize_session_id, ensure_session_row


# ------------------------------------------------------------------ #
# Unit-level tests for normalize_session_id (no DB needed)
# ------------------------------------------------------------------ #

class TestNormalizeSessionId:
    """Pure-function tests for the normalizer."""

    def test_valid_uuid_passthrough(self):
        """A proper UUID string is returned unchanged (canonical form)."""
        raw = "a1b2c3d4-e5f6-4789-abcd-ef0123456789"
        result = normalize_session_id(raw)
        assert result == raw

    def test_valid_uuid_uppercase_lowered(self):
        """Upper-case UUID is lower-cased."""
        raw = "A1B2C3D4-E5F6-4789-ABCD-EF0123456789"
        result = normalize_session_id(raw)
        assert result == raw.lower()

    def test_sha256_hex_produces_valid_uuid(self):
        """A 16-char hex hash (like the old HA-compat code) becomes a UUID."""
        raw = "a3f8c2e91b04d7f6"
        result = normalize_session_id(raw)
        # Must be a valid UUID
        UUID(result)  # raises if invalid
        assert result != raw

    def test_sha256_hex_is_deterministic(self):
        """Same input always produces the same UUID."""
        raw = "a3f8c2e91b04d7f6"
        assert normalize_session_id(raw) == normalize_session_id(raw)

    def test_different_inputs_different_uuids(self):
        """Different non-UUID strings map to different UUIDs."""
        a = normalize_session_id("session-alpha")
        b = normalize_session_id("session-beta")
        assert a != b

    def test_none_produces_uuid4(self):
        """None input generates a random UUID (valid, unique each call)."""
        a = normalize_session_id(None)
        b = normalize_session_id(None)
        UUID(a)  # valid
        UUID(b)  # valid
        assert a != b  # random, not deterministic

    def test_empty_string_produces_uuid4(self):
        """Empty string treated like None -- random UUID."""
        result = normalize_session_id("")
        UUID(result)

    def test_twilio_sid_produces_valid_uuid(self):
        """Telephony call IDs (Twilio SIDs) are normalized."""
        raw = "CA1234567890abcdef1234567890abcdef"
        result = normalize_session_id(raw)
        UUID(result)
        assert result != raw

    def test_ha_default_seed(self):
        """The default 'ha-default' seed produces a stable UUID."""
        a = normalize_session_id("ha-default")
        b = normalize_session_id("ha-default")
        UUID(a)
        assert a == b


# ------------------------------------------------------------------ #
# Integration tests (require DB)
# ------------------------------------------------------------------ #

@pytest.mark.integration
class TestEnsureSessionRow:
    """Test that ensure_session_row creates sessions rows."""

    @pytest_asyncio.fixture(autouse=True)
    async def _cleanup(self, db_pool):
        """Remove test sessions after each test."""
        self._created_ids = []
        yield
        for sid in self._created_ids:
            await db_pool.execute(
                "DELETE FROM sessions WHERE id = $1", UUID(sid)
            )

    @pytest.mark.asyncio
    async def test_creates_session_row(self, db_pool):
        """A new session row is inserted for a normalized UUID."""
        sid = normalize_session_id("openai-compat-test-1")
        self._created_ids.append(sid)

        await ensure_session_row(sid)

        row = await db_pool.fetchrow(
            "SELECT id, is_active FROM sessions WHERE id = $1", UUID(sid)
        )
        assert row is not None
        assert row["is_active"] is True

    @pytest.mark.asyncio
    async def test_idempotent_no_duplicate(self, db_pool):
        """Calling ensure_session_row twice does not raise or duplicate."""
        sid = normalize_session_id("idempotent-test")
        self._created_ids.append(sid)

        await ensure_session_row(sid)
        await ensure_session_row(sid)

        rows = await db_pool.fetch(
            "SELECT id FROM sessions WHERE id = $1", UUID(sid)
        )
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_turn_insert_succeeds_after_ensure(self, db_pool):
        """After ensure_session_row, inserting a conversation_turn works (FK satisfied)."""
        sid = normalize_session_id("fk-test-ha-compat")
        self._created_ids.append(sid)

        await ensure_session_row(sid)

        # Insert a conversation turn -- should NOT raise FK violation
        await db_pool.execute(
            """INSERT INTO conversation_turns
               (session_id, role, content, turn_type)
               VALUES ($1, $2, $3, $4)""",
            UUID(sid),
            "user",
            "Hello from HA compat",
            "conversation",
        )

        row = await db_pool.fetchrow(
            "SELECT content FROM conversation_turns WHERE session_id = $1",
            UUID(sid),
        )
        assert row is not None
        assert row["content"] == "Hello from HA compat"

        # cleanup turn
        await db_pool.execute(
            "DELETE FROM conversation_turns WHERE session_id = $1", UUID(sid)
        )


@pytest.mark.integration
class TestNonUuidSessionPersistence:
    """End-to-end: non-UUID session IDs can persist and retrieve turns via memory layer."""

    @pytest_asyncio.fixture(autouse=True)
    async def _cleanup(self, db_pool):
        """Remove test data after each test."""
        self._session_ids = []
        yield
        for sid in self._session_ids:
            await db_pool.execute(
                "DELETE FROM conversation_turns WHERE session_id = $1", UUID(sid)
            )
            await db_pool.execute(
                "DELETE FROM sessions WHERE id = $1", UUID(sid)
            )

    @pytest.mark.asyncio
    async def test_memory_add_and_get_with_hex_session(self, db_pool):
        """AtlasAgentMemory.add_turn + get_history works with a sha256 hex session ID."""
        from atlas_brain.agents.memory import AtlasAgentMemory

        raw_hex = "deadbeef12345678"
        sid = normalize_session_id(raw_hex)
        self._session_ids.append(sid)
        await ensure_session_row(sid)

        memory = AtlasAgentMemory()

        # add_turn uses the normalized sid internally
        turn_id = await memory.add_turn(
            session_id=sid,
            role="user",
            content="Turn from hex session",
        )
        assert turn_id is not None

        # get_conversation_history should return the turn
        history = await memory.get_conversation_history(session_id=sid, limit=10)
        assert len(history) >= 1
        assert any(t["content"] == "Turn from hex session" for t in history)

    @pytest.mark.asyncio
    async def test_memory_with_arbitrary_string_session(self, db_pool):
        """AtlasAgentMemory works with a completely arbitrary string like a Twilio SID."""
        from atlas_brain.agents.memory import AtlasAgentMemory

        raw_sid = "CA_twilio_call_abc123"
        sid = normalize_session_id(raw_sid)
        self._session_ids.append(sid)
        await ensure_session_row(sid)

        memory = AtlasAgentMemory()

        turn_id = await memory.add_turn(
            session_id=sid,
            role="user",
            content="Hello from telephony",
        )
        assert turn_id is not None

        turn_id2 = await memory.add_turn(
            session_id=sid,
            role="assistant",
            content="How can I help?",
        )
        assert turn_id2 is not None

        history = await memory.get_conversation_history(session_id=sid, limit=10)
        assert len(history) == 2
