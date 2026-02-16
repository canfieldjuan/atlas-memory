"""Tests for security telemetry API endpoints."""

import pytest


class _FakePortScanDetector:
    def get_stats(self):
        return {"10.0.0.10": 4}


class _FakeARPMonitor:
    def get_arp_table(self):
        return {"192.168.1.1": "aa:bb:cc:dd:ee:ff"}

    def get_change_history(self):
        return {"192.168.1.1": [(1.0, "old", "new")]}


class _FakeTrafficAnalyzer:
    def get_metrics(self):
        return {
            "bytes_per_sec_in": 100.0,
            "bytes_per_sec_out": 50.0,
            "baseline_established": True,
            "total_connections": 7,
        }


class _FakeMonitor:
    is_running = True

    def get_runtime_stats(self):
        return {
            "packets_processed": 25,
            "alerts_emitted": 2,
            "packets_dropped": 0,
            "sniffer_running": True,
        }

    def get_port_scan_detector(self):
        return _FakePortScanDetector()

    def get_arp_monitor(self):
        return _FakeARPMonitor()

    def get_traffic_analyzer(self):
        return _FakeTrafficAnalyzer()

    def get_asset_summary(self):
        return {"drone": {"total": 1, "active": 1, "stale": 0}}

    def list_assets(self, asset_type=None):
        assets = [
            {
                "asset_type": "drone",
                "identifier": "drone-a",
                "status": "active",
                "first_seen": "2026-01-01T00:00:00+00:00",
                "last_seen": "2026-01-01T00:10:00+00:00",
                "metadata": {"battery_level": 80},
                "observations": 2,
            }
        ]
        if asset_type is None:
            return assets
        return [asset for asset in assets if asset["asset_type"] == asset_type]

    def observe_asset(self, asset_type, identifier, metadata):
        return {
            "asset_type": asset_type,
            "identifier": identifier,
            "status": "active",
            "first_seen": "2026-01-01T00:00:00+00:00",
            "last_seen": "2026-01-01T00:10:00+00:00",
            "metadata": metadata,
            "observations": 1,
        }


class _FakePoolNotReady:
    is_initialized = False


class _FakePoolReady:
    is_initialized = True

    async def fetchrow(self, _query, _hours):
        return {"cnt": 5}

    async def fetch(self, query, _hours):
        if "GROUP BY threat_type" in query:
            return [
                {"threat_type": "port_scan", "cnt": 3},
                {"threat_type": "arp_change", "cnt": 2},
            ]
        return [
            {"severity": "high", "cnt": 4},
            {"severity": "medium", "cnt": 1},
        ]


class _FakePoolAssetsReady:
    is_initialized = True

    async def fetchrow(self, query, *_args):
        if "FROM security_assets" in query:
            return {"cnt": 2}
        return {"cnt": 0}

    async def fetch(self, query, *_args):
        if "FROM security_assets" in query:
            return [
                {
                    "asset_type": "drone",
                    "identifier": "drone-a",
                    "name": None,
                    "status": "active",
                    "first_seen": _FakeDateTime("2026-02-14T10:00:00+00:00"),
                    "last_seen": _FakeDateTime("2026-02-14T10:05:00+00:00"),
                    "metadata": {"battery_level": 78},
                },
                {
                    "asset_type": "sensor",
                    "identifier": "sensor-1",
                    "name": None,
                    "status": "stale",
                    "first_seen": _FakeDateTime("2026-02-14T09:00:00+00:00"),
                    "last_seen": _FakeDateTime("2026-02-14T09:02:00+00:00"),
                    "metadata": {"reading": {"temp_c": 23.1}},
                },
            ]
        if "FROM security_asset_telemetry" in query:
            return [
                {
                    "asset_type": "drone",
                    "identifier": "drone-a",
                    "observed_at": _FakeDateTime("2026-02-14T10:05:00+00:00"),
                    "metadata": {"battery_level": 78},
                }
            ]
        return []


class _FakeDateTime:
    def __init__(self, value):
        self._value = value

    def isoformat(self):
        return self._value


@pytest.mark.asyncio
async def test_get_security_status(monkeypatch):
    from atlas_brain.api.security import get_security_status

    fake_monitor = _FakeMonitor()
    monkeypatch.setattr(
        "atlas_brain.security.get_security_monitor",
        lambda: fake_monitor,
    )

    result = await get_security_status()

    assert result["monitor"]["is_running"] is True
    assert result["monitor"]["runtime"]["packets_processed"] == 25
    assert result["detectors"]["port_scan"]["active_sources"] == 1
    assert result["detectors"]["arp"]["tracked_ips"] == 1
    assert result["detectors"]["traffic"]["baseline_established"] is True
    assert result["monitor"]["assets"]["drone"]["total"] == 1


@pytest.mark.asyncio
async def test_get_security_threat_summary_db_not_initialized(monkeypatch):
    from atlas_brain.api.security import get_security_threat_summary

    monkeypatch.setattr(
        "atlas_brain.storage.database.get_db_pool",
        lambda: _FakePoolNotReady(),
    )

    result = await get_security_threat_summary(hours=24)

    assert result["hours"] == 24
    assert result["total"] == 0
    assert result["by_type"] == {}
    assert result["by_severity"] == {}


@pytest.mark.asyncio
async def test_get_security_threat_summary_db_initialized(monkeypatch):
    from atlas_brain.api.security import get_security_threat_summary

    monkeypatch.setattr(
        "atlas_brain.storage.database.get_db_pool",
        lambda: _FakePoolReady(),
    )

    result = await get_security_threat_summary(hours=12)

    assert result["hours"] == 12
    assert result["total"] == 5
    assert result["by_type"]["port_scan"] == 3
    assert result["by_type"]["arp_change"] == 2
    assert result["by_severity"]["high"] == 4


@pytest.mark.asyncio
async def test_list_security_assets(monkeypatch):
    from atlas_brain.api.security import list_security_assets

    fake_monitor = _FakeMonitor()
    monkeypatch.setattr("atlas_brain.security.get_security_monitor", lambda: fake_monitor)

    result = await list_security_assets(asset_type="drone", limit=100)

    assert result["count"] == 1
    assert result["total"] == 1
    assert result["assets"][0]["asset_type"] == "drone"


@pytest.mark.asyncio
async def test_observe_security_asset(monkeypatch):
    from atlas_brain.api.security import AssetObservationRequest, observe_security_asset

    fake_monitor = _FakeMonitor()
    async def _noop_persist(**_):
        return None

    monkeypatch.setattr("atlas_brain.security.get_security_monitor", lambda: fake_monitor)
    monkeypatch.setattr("atlas_brain.api.security._persist_asset_observation", _noop_persist)

    request = AssetObservationRequest(
        asset_type="drone",
        identifier="drone-a",
        metadata={"battery_level": 50},
    )
    result = await observe_security_asset(request)

    assert result["recorded"] is True
    assert result["asset"]["identifier"] == "drone-a"


@pytest.mark.asyncio
async def test_list_persisted_security_assets_db_not_initialized(monkeypatch):
    from atlas_brain.api.security import list_persisted_security_assets

    monkeypatch.setattr(
        "atlas_brain.storage.database.get_db_pool",
        lambda: _FakePoolNotReady(),
    )

    result = await list_persisted_security_assets(asset_type="drone", status="active", limit=50)
    assert result["count"] == 0
    assert result["total"] == 0
    assert result["assets"] == []


@pytest.mark.asyncio
async def test_list_persisted_security_assets_db_initialized(monkeypatch):
    from atlas_brain.api.security import list_persisted_security_assets

    monkeypatch.setattr(
        "atlas_brain.storage.database.get_db_pool",
        lambda: _FakePoolAssetsReady(),
    )

    result = await list_persisted_security_assets(asset_type=None, status=None, limit=100)
    assert result["count"] == 2
    assert result["total"] == 2
    assert result["assets"][0]["asset_type"] == "drone"


@pytest.mark.asyncio
async def test_get_security_asset_telemetry_db_initialized(monkeypatch):
    from atlas_brain.api.security import get_security_asset_telemetry

    monkeypatch.setattr(
        "atlas_brain.storage.database.get_db_pool",
        lambda: _FakePoolAssetsReady(),
    )

    result = await get_security_asset_telemetry(
        asset_type="drone",
        identifier="drone-a",
        hours=24,
        limit=100,
    )
    assert result["hours"] == 24
    assert result["count"] == 1
    assert result["telemetry"][0]["identifier"] == "drone-a"
