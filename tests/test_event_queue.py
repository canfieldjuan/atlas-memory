"""
Unit tests for EventQueue dedup, debounce, batch flush, and stats.

Uses concrete VisionAlertEvent / AlertRule objects with AsyncMock callbacks.
No DB, no GPU, no external services.
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from atlas_brain.alerts.events import VisionAlertEvent
from atlas_brain.alerts.rules import AlertRule
from atlas_brain.autonomous.event_queue import EventQueue, EventQueueConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _queue(
    debounce: float = 0.2,
    max_batch: int = 50,
    max_age: float = 30.0,
) -> EventQueue:
    """Create a queue with short timers for testing."""
    return EventQueue(config=EventQueueConfig(
        debounce_seconds=debounce,
        max_batch_size=max_batch,
        max_age_seconds=max_age,
    ))


def _event(
    source: str = "cam_front",
    class_name: str = "person",
    track_id: int = 1,
) -> VisionAlertEvent:
    return VisionAlertEvent(
        source_id=source,
        timestamp=datetime.utcnow(),
        class_name=class_name,
        detection_type="new_track",
        track_id=track_id,
        node_id="node1",
    )


def _rule(name: str = "person_front") -> AlertRule:
    return AlertRule(
        name=name,
        event_types=["vision"],
        source_pattern="cam_front*",
        conditions={"class_name": "person"},
    )


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------

class TestDedup:
    """Events with the same (rule, source_id, class_name) should dedup."""

    @pytest.mark.asyncio
    async def test_same_key_increments_count(self):
        q = _queue(debounce=10)  # long debounce so flush doesn't fire
        cb = AsyncMock()
        q.register_callback(cb)

        ev = _event()
        rule = _rule()

        await q.enqueue(ev, rule, "person detected")
        await q.enqueue(ev, rule, "person detected")

        assert q.stats["total_enqueued"] == 2
        assert q.stats["total_deduplicated"] == 1
        assert q.stats["pending"] == 1

        # Verify internal count
        pending = list(q._pending.values())
        assert pending[0].count == 2
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_different_keys_create_separate_entries(self):
        q = _queue(debounce=10)

        ev1 = _event(source="cam_front", class_name="person")
        ev2 = _event(source="cam_back", class_name="cat")
        r1 = _rule("rule_a")
        r2 = _rule("rule_b")

        await q.enqueue(ev1, r1, "person")
        await q.enqueue(ev2, r2, "cat")

        assert q.stats["pending"] == 2
        assert q.stats["total_deduplicated"] == 0
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_stats_track_enqueued_and_deduplicated(self):
        q = _queue(debounce=10)
        ev = _event()
        rule = _rule()

        for _ in range(5):
            await q.enqueue(ev, rule, "msg")

        assert q.stats["total_enqueued"] == 5
        assert q.stats["total_deduplicated"] == 4
        await q.shutdown()


# ---------------------------------------------------------------------------
# Debounce
# ---------------------------------------------------------------------------

class TestDebounce:
    """Flush should happen after debounce_seconds of quiet."""

    @pytest.mark.asyncio
    async def test_flush_after_debounce(self):
        q = _queue(debounce=0.1)
        cb = AsyncMock()
        q.register_callback(cb)

        await q.enqueue(_event(), _rule(), "msg")

        # Wait for debounce + margin
        await asyncio.sleep(0.2)
        cb.assert_awaited_once()
        batch = cb.call_args[0][0]
        assert len(batch) == 1
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_new_event_resets_debounce(self):
        q = _queue(debounce=0.2)
        cb = AsyncMock()
        q.register_callback(cb)

        await q.enqueue(_event(), _rule(), "msg")
        await asyncio.sleep(0.1)
        # Add another event before debounce fires -> resets timer
        await q.enqueue(_event(class_name="car"), _rule("car_rule"), "car")
        await asyncio.sleep(0.1)
        # Should not have flushed yet (timer reset)
        assert cb.await_count == 0

        # Wait for full debounce window from last enqueue
        await asyncio.sleep(0.15)
        cb.assert_awaited_once()
        batch = cb.call_args[0][0]
        assert len(batch) == 2
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_callback_receives_all_pending(self):
        q = _queue(debounce=0.1)
        cb = AsyncMock()
        q.register_callback(cb)

        for i in range(3):
            await q.enqueue(
                _event(class_name=f"cls_{i}"),
                _rule(f"rule_{i}"),
                f"msg_{i}",
            )

        await asyncio.sleep(0.2)
        cb.assert_awaited_once()
        batch = cb.call_args[0][0]
        assert len(batch) == 3
        await q.shutdown()


# ---------------------------------------------------------------------------
# Max batch size
# ---------------------------------------------------------------------------

class TestMaxBatchSize:
    """Immediate flush when pending reaches max_batch_size."""

    @pytest.mark.asyncio
    async def test_immediate_flush_at_max_batch(self):
        q = _queue(debounce=10, max_batch=3)
        cb = AsyncMock()
        q.register_callback(cb)

        for i in range(3):
            await q.enqueue(
                _event(class_name=f"cls_{i}"),
                _rule(f"rule_{i}"),
                f"msg_{i}",
            )

        # Should have flushed immediately (no debounce wait)
        cb.assert_awaited_once()
        assert q.stats["pending"] == 0
        await q.shutdown()


# ---------------------------------------------------------------------------
# Max age
# ---------------------------------------------------------------------------

class TestMaxAge:
    """Events flushed after max_age_seconds even under continuous traffic."""

    @pytest.mark.asyncio
    async def test_max_age_flush(self):
        q = _queue(debounce=10, max_age=0.3)
        cb = AsyncMock()
        q.register_callback(cb)

        await q.enqueue(_event(), _rule(), "msg")

        # debounce is 10s, but max_age is 0.3s
        await asyncio.sleep(0.5)
        cb.assert_awaited_once()
        await q.shutdown()


# ---------------------------------------------------------------------------
# Shutdown
# ---------------------------------------------------------------------------

class TestShutdown:
    """Remaining events flushed and timers cancelled on shutdown."""

    @pytest.mark.asyncio
    async def test_remaining_flushed_on_shutdown(self):
        q = _queue(debounce=10)
        cb = AsyncMock()
        q.register_callback(cb)

        await q.enqueue(_event(), _rule(), "msg")
        assert q.stats["pending"] == 1

        await q.shutdown()
        # Should have flushed remaining
        cb.assert_awaited_once()
        assert q.stats["pending"] == 0

    @pytest.mark.asyncio
    async def test_timers_cancelled_on_shutdown(self):
        q = _queue(debounce=10)

        await q.enqueue(_event(), _rule(), "msg")
        assert q._flush_task is not None

        await q.shutdown()
        # Timers cleaned up (either None or done)
        assert q._flush_task is None or q._flush_task.done()

    @pytest.mark.asyncio
    async def test_shutdown_empty_queue_is_noop(self):
        q = _queue()
        cb = AsyncMock()
        q.register_callback(cb)

        await q.shutdown()
        cb.assert_not_awaited()


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class TestStats:
    """Verify cumulative stats tracking."""

    @pytest.mark.asyncio
    async def test_total_flushed_reflects_cumulative(self):
        q = _queue(debounce=0.05)
        cb = AsyncMock()
        q.register_callback(cb)

        # First batch
        await q.enqueue(_event(), _rule(), "msg")
        await asyncio.sleep(0.1)

        # Second batch
        await q.enqueue(
            _event(class_name="cat"),
            _rule("cat_rule"),
            "cat msg",
        )
        await asyncio.sleep(0.1)

        assert q.stats["total_flushed"] == 2
        assert q.stats["pending"] == 0
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_pending_accurate_after_cycles(self):
        q = _queue(debounce=0.05)
        cb = AsyncMock()
        q.register_callback(cb)

        await q.enqueue(_event(), _rule(), "msg")
        assert q.stats["pending"] == 1

        await asyncio.sleep(0.1)  # flush
        assert q.stats["pending"] == 0

        await q.enqueue(_event(class_name="dog"), _rule("dog"), "dog")
        assert q.stats["pending"] == 1
        await q.shutdown()

    @pytest.mark.asyncio
    async def test_callback_error_does_not_lose_stats(self):
        q = _queue(debounce=0.05)
        bad_cb = AsyncMock(side_effect=RuntimeError("boom"))
        q.register_callback(bad_cb)

        await q.enqueue(_event(), _rule(), "msg")
        await asyncio.sleep(0.1)

        # Stats still updated even though callback failed
        assert q.stats["total_flushed"] == 1
        assert q.stats["pending"] == 0
        await q.shutdown()
