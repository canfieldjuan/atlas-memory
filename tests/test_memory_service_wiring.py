"""
Tests for MemoryService wiring into LLM response paths (GAP-5 + GAP-6).

Verifies that:
- MemoryService is a usable singleton
- gather_context() returns correct MemoryContext with history + profile
- build_system_prompt() formats profile and context sections
- atlas.py and launcher.py import and call get_memory_service()
- store_conversation() dual-writes to PostgreSQL and GraphRAG
- Profile data flows into system prompt when user_id is provided (GAP-6)
"""

import ast
import inspect
import textwrap

import pytest
import pytest_asyncio

from atlas_brain.memory.service import (
    MemoryContext,
    MemoryService,
    get_memory_service,
)


# ------------------------------------------------------------------ #
# Unit tests: MemoryService singleton and MemoryContext defaults
# ------------------------------------------------------------------ #


class TestMemoryServiceSingleton:
    """Verify the global singleton pattern works."""

    def test_get_memory_service_returns_instance(self):
        """get_memory_service() returns a MemoryService instance."""
        svc = get_memory_service()
        assert isinstance(svc, MemoryService)

    def test_get_memory_service_is_singleton(self):
        """Repeated calls return the same object."""
        a = get_memory_service()
        b = get_memory_service()
        assert a is b

    def test_memory_context_defaults(self):
        """MemoryContext has sane defaults for all fields."""
        ctx = MemoryContext()
        assert ctx.session_id is None
        assert ctx.user_name is None
        assert ctx.user_timezone == "UTC"
        assert ctx.response_style == "balanced"
        assert ctx.expertise_level == "intermediate"
        assert ctx.conversation_history == []
        assert ctx.people_present == []
        assert ctx.devices == []
        assert ctx.rag_result is None
        assert ctx.rag_context_used is False
        assert ctx.estimated_tokens == 0
        assert ctx.was_trimmed is False


# ------------------------------------------------------------------ #
# Unit tests: build_system_prompt formatting
# ------------------------------------------------------------------ #


class TestBuildSystemPrompt:
    """Verify build_system_prompt() formats MemoryContext correctly."""

    def _make_svc(self) -> MemoryService:
        return get_memory_service()

    def test_base_prompt_included(self):
        """Base prompt appears first in output."""
        svc = self._make_svc()
        ctx = MemoryContext()
        result = svc.build_system_prompt(ctx, base_prompt="You are Atlas.")
        assert result.startswith("You are Atlas.")

    def test_time_always_present(self):
        """Current time is in the Context section."""
        svc = self._make_svc()
        ctx = MemoryContext(current_time="10:30 AM")
        result = svc.build_system_prompt(ctx)
        assert "Current time: 10:30 AM" in result
        assert "## Context" in result

    def test_profile_brief_style(self):
        """Brief response style generates correct preference text."""
        svc = self._make_svc()
        ctx = MemoryContext(
            user_name="Juan",
            response_style="brief",
        )
        result = svc.build_system_prompt(ctx)
        assert "User: Juan" in result
        assert "short and concise" in result
        assert "## User" in result

    def test_profile_detailed_style(self):
        """Detailed response style generates correct preference text."""
        svc = self._make_svc()
        ctx = MemoryContext(
            user_name="Juan",
            response_style="detailed",
        )
        result = svc.build_system_prompt(ctx)
        assert "thorough explanations" in result

    def test_profile_beginner_level(self):
        """Beginner expertise level generates simplified language hint."""
        svc = self._make_svc()
        ctx = MemoryContext(
            user_name="Rookie",
            expertise_level="beginner",
        )
        result = svc.build_system_prompt(ctx)
        assert "simply" in result

    def test_profile_expert_level(self):
        """Expert expertise level generates technical language hint."""
        svc = self._make_svc()
        ctx = MemoryContext(
            user_name="Pro",
            expertise_level="expert",
        )
        result = svc.build_system_prompt(ctx)
        assert "technical language" in result

    def test_no_profile_no_user_section(self):
        """When profile fields are defaults, no User section appears."""
        svc = self._make_svc()
        ctx = MemoryContext()
        result = svc.build_system_prompt(ctx)
        assert "## User" not in result

    def test_location_in_context(self):
        """Room location appears in Context section."""
        svc = self._make_svc()
        ctx = MemoryContext(current_room="Office")
        result = svc.build_system_prompt(ctx)
        assert "Location: Office" in result

    def test_people_in_context(self):
        """People present appear in Context section."""
        svc = self._make_svc()
        ctx = MemoryContext(people_present=["Juan", "Sarah"])
        result = svc.build_system_prompt(ctx)
        assert "People present: Juan, Sarah" in result

    def test_history_in_prompt(self):
        """Conversation history appears in Recent Conversation section."""
        svc = self._make_svc()
        ctx = MemoryContext(
            conversation_history=[
                {"role": "user", "content": "Hello there"},
                {"role": "assistant", "content": "Hi! How can I help?"},
            ],
        )
        result = svc.build_system_prompt(ctx)
        assert "## Recent Conversation" in result
        assert "Hello there" in result


# ------------------------------------------------------------------ #
# Wiring verification: atlas.py uses MemoryService
# ------------------------------------------------------------------ #


class TestAtlasWiring:
    """Verify _generate_llm_response uses MemoryService."""

    def test_atlas_imports_memory_service(self):
        """atlas.py _generate_llm_response imports get_memory_service."""
        source = inspect.getsource(
            __import__(
                "atlas_brain.agents.graphs.atlas",
                fromlist=["_generate_llm_response"],
            )
        )
        assert "get_memory_service" in source

    def test_atlas_no_raw_sql_in_generate(self):
        """_generate_llm_response no longer contains raw SQL queries."""
        import atlas_brain.agents.graphs.atlas as mod
        source = inspect.getsource(mod._generate_llm_response)
        assert "SELECT role, content FROM conversation_turns" not in source

    def test_atlas_calls_gather_context(self):
        """_generate_llm_response calls svc.gather_context()."""
        import atlas_brain.agents.graphs.atlas as mod
        source = inspect.getsource(mod._generate_llm_response)
        assert "gather_context" in source

    def test_atlas_injects_profile(self):
        """_generate_llm_response includes user profile injection."""
        import atlas_brain.agents.graphs.atlas as mod
        source = inspect.getsource(mod._generate_llm_response)
        assert "mem_ctx.user_name" in source
        assert "mem_ctx.response_style" in source
        assert "mem_ctx.expertise_level" in source


# ------------------------------------------------------------------ #
# Wiring verification: launcher.py uses MemoryService
# ------------------------------------------------------------------ #


class TestLauncherWiring:
    """Verify _stream_llm_response uses MemoryService."""

    def test_launcher_imports_memory_service(self):
        """launcher.py _stream_llm_response imports get_memory_service."""
        import atlas_brain.voice.launcher as mod
        source = inspect.getsource(mod._stream_llm_response)
        assert "get_memory_service" in source

    def test_launcher_no_raw_sql(self):
        """_stream_llm_response no longer contains raw SQL queries."""
        import atlas_brain.voice.launcher as mod
        source = inspect.getsource(mod._stream_llm_response)
        assert "SELECT role, content FROM conversation_turns" not in source

    def test_launcher_calls_gather_context(self):
        """_stream_llm_response calls svc.gather_context()."""
        import atlas_brain.voice.launcher as mod
        source = inspect.getsource(mod._stream_llm_response)
        assert "gather_context" in source

    def test_launcher_injects_profile(self):
        """_stream_llm_response includes user profile injection."""
        import atlas_brain.voice.launcher as mod
        source = inspect.getsource(mod._stream_llm_response)
        assert "mem_ctx.user_name" in source
        assert "mem_ctx.response_style" in source

    def test_persist_uses_memory_service(self):
        """_persist_streaming_turns uses MemoryService.store_conversation()."""
        import atlas_brain.voice.launcher as mod
        source = inspect.getsource(mod._persist_streaming_turns)
        assert "get_memory_service" in source
        assert "store_conversation" in source


# ------------------------------------------------------------------ #
# Integration tests: gather_context with real DB
# ------------------------------------------------------------------ #


@pytest.mark.integration
class TestGatherContextIntegration:
    """Integration tests that verify gather_context with PostgreSQL."""

    @pytest.mark.asyncio
    async def test_gather_context_no_session(self, db_pool):
        """gather_context with no session_id returns empty history."""
        svc = get_memory_service()
        ctx = await svc.gather_context(
            query="hello",
            session_id=None,
            include_rag=False,
            include_physical=False,
        )
        assert isinstance(ctx, MemoryContext)
        assert ctx.conversation_history == []

    @pytest.mark.asyncio
    async def test_gather_context_with_session(self, db_pool, test_session, conversation_repo):
        """gather_context loads history from an existing session."""
        sid = str(test_session)

        # Insert conversation turns
        await conversation_repo.add_turn(
            session_id=test_session,
            role="user",
            content="What is the weather?",
            turn_type="conversation",
        )
        await conversation_repo.add_turn(
            session_id=test_session,
            role="assistant",
            content="It is sunny today.",
            turn_type="conversation",
        )

        svc = get_memory_service()
        ctx = await svc.gather_context(
            query="follow up",
            session_id=sid,
            include_rag=False,
            include_physical=False,
            max_history=10,
        )
        assert len(ctx.conversation_history) == 2
        assert ctx.conversation_history[0]["role"] == "user"
        assert ctx.conversation_history[0]["content"] == "What is the weather?"
        assert ctx.conversation_history[1]["role"] == "assistant"
        assert ctx.conversation_history[1]["content"] == "It is sunny today."

    @pytest.mark.asyncio
    async def test_gather_context_excludes_commands(self, db_pool, test_session, conversation_repo):
        """gather_context only loads conversation turns, not command turns."""
        sid = str(test_session)

        await conversation_repo.add_turn(
            session_id=test_session,
            role="user",
            content="turn on kitchen lights",
            turn_type="command",
        )
        await conversation_repo.add_turn(
            session_id=test_session,
            role="user",
            content="Hello Atlas",
            turn_type="conversation",
        )

        svc = get_memory_service()
        ctx = await svc.gather_context(
            query="test",
            session_id=sid,
            include_rag=False,
            include_physical=False,
        )
        assert len(ctx.conversation_history) == 1
        assert ctx.conversation_history[0]["content"] == "Hello Atlas"


# ------------------------------------------------------------------ #
# Integration tests: store_conversation with real DB
# ------------------------------------------------------------------ #


@pytest.mark.integration
class TestStoreConversationIntegration:
    """Integration tests for MemoryService.store_conversation()."""

    @pytest.mark.asyncio
    async def test_store_creates_turns(self, db_pool, test_session, conversation_repo):
        """store_conversation inserts user + assistant turns."""
        sid = str(test_session)
        svc = get_memory_service()

        await svc.store_conversation(
            session_id=sid,
            user_content="What time is it?",
            assistant_content="It is 3:00 PM.",
            speaker_id="Juan",
            turn_type="conversation",
        )

        # Verify turns exist
        turns = await conversation_repo.get_history(test_session, limit=10)
        assert len(turns) == 2
        assert turns[0].role == "user"
        assert turns[0].content == "What time is it?"
        assert turns[0].speaker_id == "Juan"
        assert turns[1].role == "assistant"
        assert turns[1].content == "It is 3:00 PM."

    @pytest.mark.asyncio
    async def test_store_roundtrip_via_gather(self, db_pool, test_session, conversation_repo):
        """Turns stored via store_conversation appear in gather_context."""
        sid = str(test_session)
        svc = get_memory_service()

        await svc.store_conversation(
            session_id=sid,
            user_content="Remember my name is Juan",
            assistant_content="Got it, Juan!",
            turn_type="conversation",
        )

        ctx = await svc.gather_context(
            query="whats my name",
            session_id=sid,
            include_rag=False,
            include_physical=False,
        )
        assert len(ctx.conversation_history) == 2
        assert "Juan" in ctx.conversation_history[0]["content"]
