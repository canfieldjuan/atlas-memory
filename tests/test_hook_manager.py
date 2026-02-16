"""
Unit tests for HookManager alert routing, cooldown, and context injection.

Pure-logic methods (_is_in_cooldown, _record_execution_time, _inject_alert_context)
are tested directly. on_alert routing uses mocked DB/runner.
"""

import copy
import time
from datetime import datetime
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from atlas_brain.alerts.events import VisionAlertEvent
from atlas_brain.alerts.rules import AlertRule
from atlas_brain.autonomous.hooks import HookManager
from atlas_brain.storage.models import ScheduledTask


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _manager() -> HookManager:
    return HookManager()


def _event(
    source: str = "cam_front",
    class_name: str = "person",
) -> VisionAlertEvent:
    return VisionAlertEvent(
        source_id=source,
        timestamp=datetime.utcnow(),
        class_name=class_name,
        detection_type="new_track",
        track_id=1,
        node_id="node1",
    )


def _rule(name: str = "person_rule") -> AlertRule:
    return AlertRule(
        name=name,
        event_types=["vision"],
        source_pattern="cam_front*",
    )


def _task(
    name: str = "test_hook",
    prompt: str = "Analyze this event",
) -> ScheduledTask:
    return ScheduledTask(
        id=uuid4(),
        name=name,
        task_type="hook",
        schedule_type="once",
        prompt=prompt,
        enabled=True,
        metadata={"trigger_rules": ["person_rule"]},
    )


# ---------------------------------------------------------------------------
# Cooldown logic (pure, no mocks)
# ---------------------------------------------------------------------------

class TestCooldown:
    """Verify _is_in_cooldown and _record_execution_time behavior."""

    def test_not_in_cooldown_initially(self):
        m = _manager()
        assert not m._is_in_cooldown("task_a", "rule_a", 60)

    def test_in_cooldown_after_recording(self):
        m = _manager()
        m._record_execution_time("task_a", "rule_a")
        assert m._is_in_cooldown("task_a", "rule_a", 60)

    def test_not_in_cooldown_after_window(self):
        m = _manager()
        # Record with a past time
        m._last_execution[("task_a", "rule_a")] = time.monotonic() - 100
        assert not m._is_in_cooldown("task_a", "rule_a", 60)

    def test_cooldown_zero_always_false(self):
        m = _manager()
        m._record_execution_time("task_a", "rule_a")
        assert not m._is_in_cooldown("task_a", "rule_a", 0)

    def test_cooldown_negative_always_false(self):
        m = _manager()
        m._record_execution_time("task_a", "rule_a")
        assert not m._is_in_cooldown("task_a", "rule_a", -1)

    def test_cooldown_tracked_per_pair(self):
        m = _manager()
        m._record_execution_time("task_a", "rule_a")
        # Same task, different rule -> not in cooldown
        assert not m._is_in_cooldown("task_a", "rule_b", 60)
        # Different task, same rule -> not in cooldown
        assert not m._is_in_cooldown("task_b", "rule_a", 60)


# ---------------------------------------------------------------------------
# Context injection (pure, no mocks)
# ---------------------------------------------------------------------------

class TestContextInjection:
    """Verify _inject_alert_context produces correct modified tasks."""

    def test_alert_context_appended_to_prompt(self):
        m = _manager()
        task = _task(prompt="Base prompt")
        event = _event()
        rule = _rule()

        result = m._inject_alert_context(task, "Person detected", rule, event)
        assert "Base prompt" in result.prompt
        assert "[Alert Context]" in result.prompt
        assert "person_rule" in result.prompt
        assert "Person detected" in result.prompt

    def test_event_metadata_included_when_present(self):
        m = _manager()
        task = _task()
        event = _event()
        event.metadata = {"confidence": 0.95, "zone": "entrance"}
        rule = _rule()

        result = m._inject_alert_context(task, "msg", rule, event)
        assert "confidence" in result.prompt
        assert "entrance" in result.prompt

    def test_event_metadata_excluded_when_empty(self):
        m = _manager()
        task = _task()
        event = _event()
        event.metadata = {}
        rule = _rule()

        result = m._inject_alert_context(task, "msg", rule, event)
        assert "Event data:" not in result.prompt

    def test_original_task_not_mutated(self):
        m = _manager()
        task = _task(prompt="Original")
        event = _event()
        rule = _rule()

        result = m._inject_alert_context(task, "msg", rule, event)
        # Original should be unchanged
        assert task.prompt == "Original"
        # Result should be different
        assert result.prompt != "Original"
        assert result is not task

    def test_none_prompt_handled(self):
        m = _manager()
        task = _task(prompt="")
        task.prompt = None
        event = _event()
        rule = _rule()

        result = m._inject_alert_context(task, "msg", rule, event)
        assert "[Alert Context]" in result.prompt


# ---------------------------------------------------------------------------
# Hook count
# ---------------------------------------------------------------------------

class TestHookCount:
    """Verify hook_count property."""

    def test_empty_manager_count_zero(self):
        m = _manager()
        assert m.hook_count == 0

    def test_hook_count_reflects_mappings(self):
        m = _manager()
        m._rule_to_tasks = {
            "rule_a": ["task_1", "task_2"],
            "rule_b": ["task_3"],
        }
        assert m.hook_count == 3


# ---------------------------------------------------------------------------
# on_alert routing
# ---------------------------------------------------------------------------

class TestOnAlert:
    """Verify on_alert dispatching with mocked DB and runner."""

    @pytest.mark.asyncio
    async def test_skips_if_not_loaded(self):
        m = _manager()
        assert not m._loaded
        # Should return without error
        await m.on_alert("msg", _rule(), _event())

    @pytest.mark.asyncio
    async def test_skips_if_rule_not_registered(self):
        m = _manager()
        m._loaded = True
        m._rule_to_tasks = {}  # no mappings

        # Should return without error
        await m.on_alert("msg", _rule("unknown_rule"), _event())

    @pytest.mark.asyncio
    @patch("atlas_brain.autonomous.config.autonomous_config")
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_dispatches_when_rule_matches(self, mock_repo_fn, mock_runner_fn, mock_config):
        m = _manager()
        m._loaded = True
        m._rule_to_tasks = {"person_rule": ["test_hook"]}

        task = _task()
        mock_repo = AsyncMock()
        mock_repo.get_by_name.return_value = task
        mock_repo.record_execution.return_value = uuid4()
        mock_repo_fn.return_value = mock_repo

        mock_result = MagicMock()
        mock_result.success = True
        mock_result.response_text = "done"
        mock_result.error = None
        mock_runner = AsyncMock()
        mock_runner.run.return_value = mock_result
        mock_runner_fn.return_value = mock_runner

        mock_config.hook_cooldown_seconds = 0
        mock_config.task_timeout_seconds = 30

        await m.on_alert("Person detected", _rule(), _event())

        mock_repo.get_by_name.assert_awaited_once_with("test_hook")
        mock_runner.run.assert_awaited_once()
        mock_repo.complete_execution.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("atlas_brain.autonomous.config.autonomous_config")
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_respects_cooldown(self, mock_repo_fn, mock_runner_fn, mock_config):
        m = _manager()
        m._loaded = True
        m._rule_to_tasks = {"person_rule": ["test_hook"]}

        mock_config.hook_cooldown_seconds = 300
        mock_config.task_timeout_seconds = 30

        # Simulate recent execution
        m._record_execution_time("test_hook", "person_rule")

        await m.on_alert("msg", _rule(), _event())

        # Runner should NOT have been called (cooldown active)
        mock_runner_fn.return_value.run.assert_not_called()
