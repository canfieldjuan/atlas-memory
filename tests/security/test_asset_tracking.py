"""Tests for Phase 3 asset tracking logic."""

from datetime import datetime, timedelta, timezone

import pytest


def test_asset_tracker_observe_and_summary():
    from atlas_brain.security.assets.asset_tracker import AssetTracker

    tracker = AssetTracker(asset_type="drone", stale_after_seconds=60, max_assets=10)
    tracker.observe(identifier="drone-1", metadata={"battery_level": 87})

    summary = tracker.get_summary()
    assets = tracker.list_assets()

    assert summary["total"] == 1
    assert summary["active"] == 1
    assert assets[0]["identifier"] == "drone-1"
    assert assets[0]["metadata"]["battery_level"] == 87


def test_asset_tracker_marks_stale():
    from atlas_brain.security.assets.asset_tracker import AssetTracker

    tracker = AssetTracker(asset_type="sensor", stale_after_seconds=10, max_assets=10)
    old_time = datetime.now(timezone.utc) - timedelta(seconds=30)
    tracker.observe(identifier="sensor-1", observed_at=old_time)

    summary = tracker.get_summary()
    asset = tracker.get_asset("sensor-1")

    assert summary["stale"] == 1
    assert asset is not None
    assert asset["status"] == "stale"


def test_asset_tracker_prunes_oldest_records():
    from atlas_brain.security.assets.asset_tracker import AssetTracker

    tracker = AssetTracker(asset_type="vehicle", stale_after_seconds=60, max_assets=2)
    base = datetime.now(timezone.utc)
    tracker.observe("v-1", observed_at=base - timedelta(seconds=3))
    tracker.observe("v-2", observed_at=base - timedelta(seconds=2))
    tracker.observe("v-3", observed_at=base - timedelta(seconds=1))

    assets = tracker.list_assets()
    ids = {asset["identifier"] for asset in assets}

    assert len(assets) == 2
    assert "v-1" not in ids
    assert ids == {"v-2", "v-3"}


@pytest.mark.asyncio
async def test_security_monitor_asset_observation(monkeypatch):
    from atlas_brain.config import settings
    from atlas_brain.security import SecurityMonitor

    old_asset_enabled = settings.security.asset_tracking_enabled
    old_drone_enabled = settings.security.drone_tracking_enabled
    old_vehicle_enabled = settings.security.vehicle_tracking_enabled
    old_sensor_enabled = settings.security.sensor_tracking_enabled

    settings.security.asset_tracking_enabled = True
    settings.security.drone_tracking_enabled = True
    settings.security.vehicle_tracking_enabled = True
    settings.security.sensor_tracking_enabled = True

    try:
        monitor = SecurityMonitor()
        await monitor.start()

        result = monitor.observe_asset(
            asset_type="drone",
            identifier="drone-alpha",
            metadata={"battery_level": 65},
        )
        summary = monitor.get_asset_summary()

        assert result is not None
        assert summary["drone"]["total"] == 1
        assert summary["drone"]["active"] == 1

        await monitor.stop()
    finally:
        settings.security.asset_tracking_enabled = old_asset_enabled
        settings.security.drone_tracking_enabled = old_drone_enabled
        settings.security.vehicle_tracking_enabled = old_vehicle_enabled
        settings.security.sensor_tracking_enabled = old_sensor_enabled
