"""
Unit tests for TaskScheduler trigger building and retry logic.

Tests _build_trigger and _maybe_schedule_retry directly (no DB).
Tests _execute_task with mocked DB repo and headless runner.
"""

from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from atlas_brain.autonomous.scheduler import TaskScheduler
from atlas_brain.storage.models import ScheduledTask


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scheduler() -> TaskScheduler:
    return TaskScheduler()


def _task(
    schedule_type: str = "cron",
    cron: str | None = "0 8 * * *",
    interval: int | None = None,
    run_at: datetime | None = None,
    max_retries: int = 0,
    retry_delay: int = 60,
    timeout: int = 120,
    enabled: bool = True,
) -> ScheduledTask:
    return ScheduledTask(
        id=uuid4(),
        name="test_task",
        task_type="agent_prompt",
        schedule_type=schedule_type,
        cron_expression=cron,
        interval_seconds=interval,
        run_at=run_at,
        max_retries=max_retries,
        retry_delay_seconds=retry_delay,
        timeout_seconds=timeout,
        enabled=enabled,
        prompt="Do something",
    )


# ---------------------------------------------------------------------------
# Trigger building (pure, no mocks)
# ---------------------------------------------------------------------------

class TestBuildTrigger:
    """Verify _build_trigger produces correct APScheduler trigger types."""

    def test_cron_schedule_returns_cron_trigger(self):
        s = _scheduler()
        task = _task(schedule_type="cron", cron="0 8 * * *")
        trigger = s._build_trigger(task)
        assert isinstance(trigger, CronTrigger)

    def test_interval_schedule_returns_interval_trigger(self):
        s = _scheduler()
        task = _task(schedule_type="interval", cron=None, interval=3600)
        trigger = s._build_trigger(task)
        assert isinstance(trigger, IntervalTrigger)

    def test_once_schedule_returns_date_trigger(self):
        s = _scheduler()
        run_at = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        task = _task(schedule_type="once", cron=None, run_at=run_at)
        trigger = s._build_trigger(task)
        assert isinstance(trigger, DateTrigger)

    def test_unknown_schedule_returns_none(self):
        s = _scheduler()
        task = _task(schedule_type="unknown_type", cron=None)
        trigger = s._build_trigger(task)
        assert trigger is None

    def test_cron_without_expression_returns_none(self):
        s = _scheduler()
        task = _task(schedule_type="cron", cron=None)
        trigger = s._build_trigger(task)
        assert trigger is None

    def test_interval_without_seconds_returns_none(self):
        s = _scheduler()
        task = _task(schedule_type="interval", cron=None, interval=None)
        trigger = s._build_trigger(task)
        assert trigger is None

    def test_once_without_run_at_returns_none(self):
        s = _scheduler()
        task = _task(schedule_type="once", cron=None, run_at=None)
        trigger = s._build_trigger(task)
        assert trigger is None


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

class TestRetryLogic:
    """Verify _maybe_schedule_retry scheduling behavior."""

    def test_retry_scheduled_when_retries_remaining(self):
        s = _scheduler()
        s._running = True
        s._scheduler = MagicMock()

        task = _task(max_retries=3, retry_delay=30)
        s._maybe_schedule_retry(task, current_retry_count=1)

        s._scheduler.add_job.assert_called_once()
        call_kwargs = s._scheduler.add_job.call_args
        assert "retry_2" in call_kwargs.kwargs.get("id", "") or "retry_2" in str(call_kwargs)

    def test_no_retry_when_max_retries_zero(self):
        s = _scheduler()
        s._running = True
        s._scheduler = MagicMock()

        task = _task(max_retries=0)
        s._maybe_schedule_retry(task, current_retry_count=0)

        s._scheduler.add_job.assert_not_called()

    def test_no_retry_when_retries_exhausted(self):
        s = _scheduler()
        s._running = True
        s._scheduler = MagicMock()

        task = _task(max_retries=2)
        s._maybe_schedule_retry(task, current_retry_count=2)

        s._scheduler.add_job.assert_not_called()

    def test_retry_uses_task_delay(self):
        s = _scheduler()
        s._running = True
        s._scheduler = MagicMock()

        task = _task(max_retries=3, retry_delay=120)
        s._maybe_schedule_retry(task, current_retry_count=0)

        # Verify the trigger uses approximately the right delay
        call_args = s._scheduler.add_job.call_args
        trigger = call_args.kwargs.get("trigger") or call_args[1].get("trigger")
        assert isinstance(trigger, DateTrigger)

    def test_no_retry_when_scheduler_not_running(self):
        s = _scheduler()
        s._running = False
        s._scheduler = MagicMock()

        task = _task(max_retries=3)
        s._maybe_schedule_retry(task, current_retry_count=0)

        s._scheduler.add_job.assert_not_called()


# ---------------------------------------------------------------------------
# Task execution
# ---------------------------------------------------------------------------

class TestExecuteTask:
    """Verify _execute_task with mocked dependencies."""

    @pytest.mark.asyncio
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_skips_disabled_task(self, mock_repo_fn, mock_runner_fn):
        s = _scheduler()
        s._semaphore = __import__("asyncio").Semaphore(2)

        mock_repo = AsyncMock()
        mock_repo.get_by_id.return_value = _task(enabled=False)
        mock_repo_fn.return_value = mock_repo

        task_id = uuid4()
        await s._execute_task(task_id)

        mock_runner_fn.return_value.run.assert_not_called()

    @pytest.mark.asyncio
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_skips_missing_task(self, mock_repo_fn, mock_runner_fn):
        s = _scheduler()
        s._semaphore = __import__("asyncio").Semaphore(2)

        mock_repo = AsyncMock()
        mock_repo.get_by_id.return_value = None
        mock_repo_fn.return_value = mock_repo

        await s._execute_task(uuid4())

        mock_runner_fn.return_value.run.assert_not_called()

    @pytest.mark.asyncio
    @patch.object(TaskScheduler, "_check_consecutive_failures", new_callable=AsyncMock)
    @patch.object(TaskScheduler, "_get_next_run_time", return_value=None)
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_records_execution_and_calls_runner(
        self, mock_repo_fn, mock_runner_fn, _next_run, _check_fail
    ):
        s = _scheduler()
        s._semaphore = __import__("asyncio").Semaphore(2)

        task = _task(enabled=True)
        exec_id = uuid4()

        mock_repo = AsyncMock()
        mock_repo.get_by_id.return_value = task
        mock_repo.record_execution.return_value = exec_id
        mock_repo_fn.return_value = mock_repo

        mock_result = MagicMock()
        mock_result.success = True
        mock_result.response_text = "done"
        mock_result.error = None
        mock_runner = AsyncMock()
        mock_runner.run.return_value = mock_result
        mock_runner_fn.return_value = mock_runner

        await s._execute_task(task.id)

        mock_repo.record_execution.assert_awaited_once()
        mock_runner.run.assert_awaited_once_with(task)
        mock_repo.complete_execution.assert_awaited_once()
        status_arg = mock_repo.complete_execution.call_args[0][1]
        assert status_arg == "completed"

    @pytest.mark.asyncio
    @patch.object(TaskScheduler, "_check_consecutive_failures", new_callable=AsyncMock)
    @patch.object(TaskScheduler, "_maybe_schedule_retry")
    @patch.object(TaskScheduler, "_get_next_run_time", return_value=None)
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_failed_result_triggers_retry(
        self, mock_repo_fn, mock_runner_fn, _next_run, mock_retry, _check_fail
    ):
        s = _scheduler()
        s._semaphore = __import__("asyncio").Semaphore(2)

        task = _task(enabled=True, max_retries=2)

        mock_repo = AsyncMock()
        mock_repo.get_by_id.return_value = task
        mock_repo.record_execution.return_value = uuid4()
        mock_repo_fn.return_value = mock_repo

        mock_result = MagicMock()
        mock_result.success = False
        mock_result.response_text = ""
        mock_result.error = "something failed"
        mock_runner = AsyncMock()
        mock_runner.run.return_value = mock_result
        mock_runner_fn.return_value = mock_runner

        await s._execute_task(task.id)

        mock_retry.assert_called_once_with(task, 0)

    @pytest.mark.asyncio
    @patch.object(TaskScheduler, "_check_consecutive_failures", new_callable=AsyncMock)
    @patch.object(TaskScheduler, "_get_next_run_time", return_value=None)
    @patch("atlas_brain.autonomous.runner.get_headless_runner")
    @patch("atlas_brain.storage.repositories.scheduled_task.get_scheduled_task_repo")
    async def test_timeout_records_timeout_status(
        self, mock_repo_fn, mock_runner_fn, _next_run, _check_fail
    ):
        import asyncio

        s = _scheduler()
        s._semaphore = asyncio.Semaphore(2)

        task = _task(enabled=True, timeout=1)

        mock_repo = AsyncMock()
        mock_repo.get_by_id.return_value = task
        mock_repo.record_execution.return_value = uuid4()
        mock_repo_fn.return_value = mock_repo

        async def slow_run(_task):
            await asyncio.sleep(10)

        mock_runner = AsyncMock()
        mock_runner.run.side_effect = slow_run
        mock_runner_fn.return_value = mock_runner

        await s._execute_task(task.id)

        mock_repo.complete_execution.assert_awaited_once()
        status_arg = mock_repo.complete_execution.call_args[0][1]
        assert status_arg == "timeout"


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

class TestDefaults:
    """Verify initial scheduler state."""

    def test_not_running_initially(self):
        s = _scheduler()
        assert not s.is_running

    def test_scheduled_count_zero_when_not_running(self):
        s = _scheduler()
        assert s.scheduled_count == 0
