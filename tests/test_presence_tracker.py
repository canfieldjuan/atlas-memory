"""
Unit tests for PresenceTracker state machine.

Tests occupancy transitions, occupant tracking, callback firing,
cooldown, and empty-timer behavior -- all in-memory, no DB.
"""

import asyncio
import time
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from atlas_brain.autonomous.presence import (
    OccupancyState,
    PresenceConfig,
    PresenceTracker,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tracker(
    empty_delay: int = 1,
    arrival_cooldown: int = 0,
) -> PresenceTracker:
    """Create a tracker with short timers for testing."""
    cfg = PresenceConfig(
        empty_delay_seconds=empty_delay,
        arrival_cooldown_seconds=arrival_cooldown,
    )
    return PresenceTracker(config=cfg)


async def _enter_known(tracker: PresenceTracker, name: str = "Alice") -> None:
    """Simulate a known person entering."""
    await tracker.on_security_event("person_entered", {"name": name, "is_known": True})


async def _enter_unknown(tracker: PresenceTracker) -> None:
    """Simulate an unknown person entering."""
    await tracker.on_security_event("person_entered", {"name": "unknown", "is_known": False})


async def _leave_known(tracker: PresenceTracker, name: str = "Alice") -> None:
    """Simulate a known person leaving."""
    await tracker.on_security_event("person_left", {"name": name, "is_known": True})


async def _leave_unknown(tracker: PresenceTracker) -> None:
    """Simulate an unknown person leaving."""
    await tracker.on_security_event("person_left", {"name": "unknown", "is_known": False})


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------

class TestStateTransitions:
    """Verify EMPTY -> OCCUPIED -> IDENTIFIED -> EMPTY transitions."""

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_to_occupied_on_unknown(self, _persist):
        t = _tracker()
        assert t.state.state == OccupancyState.EMPTY

        await _enter_unknown(t)
        assert t.state.state == OccupancyState.OCCUPIED
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_to_identified_on_known(self, _persist):
        t = _tracker()
        await _enter_known(t, "Bob")
        assert t.state.state == OccupancyState.IDENTIFIED
        assert "Bob" in t.state.occupants  # dict key lookup
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_occupied_to_identified_on_known_arrival(self, _persist):
        t = _tracker()
        await _enter_unknown(t)
        assert t.state.state == OccupancyState.OCCUPIED

        await _enter_known(t, "Carol")
        assert t.state.state == OccupancyState.IDENTIFIED
        assert "Carol" in t.state.occupants
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_identified_stays_on_more_known(self, _persist):
        t = _tracker()
        await _enter_known(t, "Alice")
        await _enter_known(t, "Bob")
        assert t.state.state == OccupancyState.IDENTIFIED
        assert set(t.state.occupants.keys()) == {"Alice", "Bob"}
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_transition_to_empty_after_all_leave(self, _persist):
        t = _tracker(empty_delay=0)  # instant
        await _enter_known(t, "Alice")
        await _leave_known(t, "Alice")

        # Allow the empty-check task to run
        await asyncio.sleep(0.05)
        assert t.state.state == OccupancyState.EMPTY
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_check_cancelled_on_new_arrival(self, _persist):
        t = _tracker(empty_delay=5)
        await _enter_known(t, "Alice")
        await _leave_known(t, "Alice")

        # Timer is pending; new arrival should cancel it
        await _enter_known(t, "Bob")
        assert t.state.state == OccupancyState.IDENTIFIED
        assert t._empty_timer is None or t._empty_timer.done() or t._empty_timer.cancelled()
        await t.shutdown()


# ---------------------------------------------------------------------------
# Occupant tracking
# ---------------------------------------------------------------------------

class TestOccupantTracking:
    """Verify known/unknown occupant list management."""

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_known_added_to_occupants(self, _persist):
        t = _tracker()
        await _enter_known(t, "Dan")
        assert "Dan" in t.state.occupants
        assert isinstance(t.state.occupants["Dan"], datetime)
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_duplicate_known_not_added_twice(self, _persist):
        t = _tracker()
        await _enter_known(t, "Eve")
        first_time = t.state.occupants["Eve"]
        await _enter_known(t, "Eve")
        assert len(t.state.occupants) == 1
        assert t.state.occupants["Eve"] == first_time  # timestamp not overwritten
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_unknown_increments_count(self, _persist):
        t = _tracker()
        await _enter_unknown(t)
        await _enter_unknown(t)
        assert t._unknown_count == 2
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_person_left_removes_known(self, _persist):
        t = _tracker()
        await _enter_known(t, "Frank")
        await _leave_known(t, "Frank")
        assert "Frank" not in t.state.occupants
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_person_left_decrements_unknown_floor_zero(self, _persist):
        t = _tracker()
        await _enter_unknown(t)
        assert t._unknown_count == 1

        await _leave_unknown(t)
        assert t._unknown_count == 0

        # Extra leave shouldn't go negative
        await _leave_unknown(t)
        assert t._unknown_count == 0
        await t.shutdown()


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

class TestCallbacks:
    """Verify arrival/departure callbacks fire correctly."""

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_arrival_callback_on_empty_to_occupied(self, _persist):
        t = _tracker()
        cb = AsyncMock()
        t.register_callback(cb)

        await _enter_unknown(t)
        cb.assert_awaited_once()
        args = cb.call_args[0]
        assert args[0] == "arrival"
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_arrival_callback_on_empty_to_identified(self, _persist):
        t = _tracker()
        cb = AsyncMock()
        t.register_callback(cb)

        await _enter_known(t, "Grace")
        cb.assert_awaited_once()
        args = cb.call_args[0]
        assert args[0] == "arrival"
        assert args[2] == "Grace"
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_departure_callback_on_transition_to_empty(self, _persist):
        t = _tracker(empty_delay=0)
        cb = AsyncMock()
        t.register_callback(cb)

        await _enter_known(t, "Hank")
        cb.reset_mock()  # ignore arrival callback

        await _leave_known(t, "Hank")
        await asyncio.sleep(0.05)

        # Should have fired departure
        assert any(
            call.args[0] == "departure" for call in cb.call_args_list
        )
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_callback_exception_does_not_crash(self, _persist):
        t = _tracker()
        bad_cb = AsyncMock(side_effect=RuntimeError("boom"))
        t.register_callback(bad_cb)

        # Should not raise
        await _enter_unknown(t)
        assert t.state.state == OccupancyState.OCCUPIED
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_arrival_cooldown_suppresses_rapid_fires(self, _persist):
        t = _tracker(arrival_cooldown=300)
        cb = AsyncMock()
        t.register_callback(cb)

        await _enter_known(t, "Ivy")
        assert cb.await_count == 1

        # Transition back to empty (force)
        t._state.state = OccupancyState.EMPTY
        t._state.occupants.clear()
        t._unknown_count = 0

        # Second arrival within cooldown -> suppressed
        await _enter_known(t, "Ivy")
        assert cb.await_count == 1  # still 1
        await t.shutdown()


# ---------------------------------------------------------------------------
# Timer behavior
# ---------------------------------------------------------------------------

class TestTimerBehavior:
    """Verify empty timer scheduling and cancellation."""

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_timer_created_on_leave(self, _persist):
        t = _tracker(empty_delay=10)
        await _enter_known(t, "Jack")
        await _leave_known(t, "Jack")

        assert t._empty_timer is not None
        assert not t._empty_timer.done()
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_timer_cancelled_on_new_arrival(self, _persist):
        t = _tracker(empty_delay=10)
        await _enter_known(t, "Kate")
        await _leave_known(t, "Kate")

        old_timer = t._empty_timer
        assert old_timer is not None

        await _enter_known(t, "Kate")
        await asyncio.sleep(0)  # let cancellation propagate
        # Old timer should be cancelled
        assert old_timer.cancelled() or old_timer.done()
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_empty_timer_respects_delay(self, _persist):
        t = _tracker(empty_delay=1)
        await _enter_known(t, "Leo")
        await _leave_known(t, "Leo")

        # Immediately after leave, still not empty
        assert t.state.state == OccupancyState.IDENTIFIED

        # After delay, should be empty
        await asyncio.sleep(1.1)
        assert t.state.state == OccupancyState.EMPTY
        await t.shutdown()

    @pytest.mark.asyncio
    @patch.object(PresenceTracker, "_persist_transition", new_callable=AsyncMock)
    async def test_shutdown_cancels_timer(self, _persist):
        t = _tracker(empty_delay=60)
        await _enter_known(t, "Mia")
        await _leave_known(t, "Mia")

        timer = t._empty_timer
        assert timer is not None
        await t.shutdown()
        await asyncio.sleep(0)  # let cancellation propagate
        assert timer.cancelled() or timer.done()


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------

class TestDefaults:
    """Verify default state and config."""

    def test_initial_state_empty(self):
        t = _tracker()
        assert t.state.state == OccupancyState.EMPTY
        assert t.state.occupants == {}

    def test_default_config_values(self):
        t = PresenceTracker()
        assert t._config.empty_delay_seconds == 300
        assert t._config.arrival_cooldown_seconds == 300

    def test_state_to_dict(self):
        t = _tracker()
        d = t.state.to_dict()
        assert d["state"] == "empty"
        assert d["occupants"] == []  # to_dict returns list of keys
        assert "last_activity" in d
        assert "changed_at" in d
