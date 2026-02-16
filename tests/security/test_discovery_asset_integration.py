"""Tests for discovery-to-security-asset integration."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


def test_device_type_to_asset_type_mapping():
    from atlas_brain.discovery.service import DEVICE_TYPE_TO_ASSET_TYPE

    assert DEVICE_TYPE_TO_ASSET_TYPE["roku"] == "sensor"
    assert DEVICE_TYPE_TO_ASSET_TYPE["chromecast"] == "sensor"
    assert DEVICE_TYPE_TO_ASSET_TYPE["smart_tv"] == "sensor"
    assert DEVICE_TYPE_TO_ASSET_TYPE["drone"] == "drone"
    assert DEVICE_TYPE_TO_ASSET_TYPE["vehicle"] == "vehicle"


@pytest.mark.asyncio
async def test_notify_security_asset_tracker_disabled(monkeypatch):
    from atlas_brain.discovery.service import DiscoveryService
    from atlas_brain.storage.models import DiscoveredDevice
    from atlas_brain.config import settings

    old_enabled = settings.security.asset_tracking_enabled
    settings.security.asset_tracking_enabled = False

    try:
        service = DiscoveryService()
        device = DiscoveredDevice(
            id=uuid4(),
            device_id="roku.192_168_1_100",
            name="Living Room Roku",
            device_type="roku",
            protocol="ssdp",
            host="192.168.1.100",
            port=8060,
            discovered_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
            is_active=True,
            auto_registered=False,
            metadata={},
        )

        await service._notify_security_asset_tracker(device)
    finally:
        settings.security.asset_tracking_enabled = old_enabled


@pytest.mark.asyncio
async def test_notify_security_asset_tracker_unmapped_type(monkeypatch):
    from atlas_brain.discovery.service import DiscoveryService
    from atlas_brain.storage.models import DiscoveredDevice
    from atlas_brain.config import settings

    old_enabled = settings.security.asset_tracking_enabled
    settings.security.asset_tracking_enabled = True

    try:
        service = DiscoveryService()
        device = DiscoveredDevice(
            id=uuid4(),
            device_id="unknown.192_168_1_101",
            name="Unknown Device",
            device_type="unknown_device_type",
            protocol="ssdp",
            host="192.168.1.101",
            port=None,
            discovered_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
            is_active=True,
            auto_registered=False,
            metadata={},
        )

        await service._notify_security_asset_tracker(device)
    finally:
        settings.security.asset_tracking_enabled = old_enabled


@pytest.mark.asyncio
async def test_notify_security_asset_tracker_success():
    from atlas_brain.discovery.service import DiscoveryService
    from atlas_brain.storage.models import DiscoveredDevice
    from atlas_brain.config import settings

    old_enabled = settings.security.asset_tracking_enabled
    settings.security.asset_tracking_enabled = True

    try:
        fake_monitor = MagicMock()
        fake_monitor.is_running = True
        fake_monitor.observe_asset = MagicMock(return_value={
            "asset_type": "sensor",
            "identifier": "roku.192_168_1_102",
            "status": "active",
        })

        with patch(
            "atlas_brain.security.get_security_monitor",
            return_value=fake_monitor,
        ):
            service = DiscoveryService()
            device = DiscoveredDevice(
                id=uuid4(),
                device_id="roku.192_168_1_102",
                name="Bedroom Roku",
                device_type="roku",
                protocol="ssdp",
                host="192.168.1.102",
                port=8060,
                discovered_at=datetime.utcnow(),
                last_seen_at=datetime.utcnow(),
                is_active=True,
                auto_registered=False,
                metadata={"manufacturer": "Roku", "model": "Ultra"},
            )

            await service._notify_security_asset_tracker(device)

            fake_monitor.observe_asset.assert_called_once()
            call_args = fake_monitor.observe_asset.call_args
            assert call_args.kwargs["asset_type"] == "sensor"
            assert call_args.kwargs["identifier"] == "roku.192_168_1_102"
            assert call_args.kwargs["metadata"]["host"] == "192.168.1.102"
            assert call_args.kwargs["metadata"]["manufacturer"] == "Roku"
    finally:
        settings.security.asset_tracking_enabled = old_enabled


@pytest.mark.asyncio
async def test_notify_security_asset_tracker_monitor_not_running():
    from atlas_brain.discovery.service import DiscoveryService
    from atlas_brain.storage.models import DiscoveredDevice
    from atlas_brain.config import settings

    old_enabled = settings.security.asset_tracking_enabled
    settings.security.asset_tracking_enabled = True

    try:
        fake_monitor = MagicMock()
        fake_monitor.is_running = False
        fake_monitor.observe_asset = MagicMock()

        with patch(
            "atlas_brain.security.get_security_monitor",
            return_value=fake_monitor,
        ):
            service = DiscoveryService()
            device = DiscoveredDevice(
                id=uuid4(),
                device_id="roku.192_168_1_103",
                name="Office Roku",
                device_type="roku",
                protocol="ssdp",
                host="192.168.1.103",
                port=8060,
                discovered_at=datetime.utcnow(),
                last_seen_at=datetime.utcnow(),
                is_active=True,
                auto_registered=False,
                metadata={},
            )

            await service._notify_security_asset_tracker(device)

            fake_monitor.observe_asset.assert_not_called()
    finally:
        settings.security.asset_tracking_enabled = old_enabled


@pytest.mark.asyncio
async def test_notify_security_asset_tracker_drone_type():
    from atlas_brain.discovery.service import DiscoveryService
    from atlas_brain.storage.models import DiscoveredDevice
    from atlas_brain.config import settings

    old_enabled = settings.security.asset_tracking_enabled
    settings.security.asset_tracking_enabled = True

    try:
        fake_monitor = MagicMock()
        fake_monitor.is_running = True
        fake_monitor.observe_asset = MagicMock(return_value={
            "asset_type": "drone",
            "identifier": "drone.192_168_1_200",
            "status": "active",
        })

        with patch(
            "atlas_brain.security.get_security_monitor",
            return_value=fake_monitor,
        ):
            service = DiscoveryService()
            device = DiscoveredDevice(
                id=uuid4(),
                device_id="drone.192_168_1_200",
                name="Security Drone",
                device_type="drone",
                protocol="mdns",
                host="192.168.1.200",
                port=None,
                discovered_at=datetime.utcnow(),
                last_seen_at=datetime.utcnow(),
                is_active=True,
                auto_registered=False,
                metadata={},
            )

            await service._notify_security_asset_tracker(device)

            fake_monitor.observe_asset.assert_called_once()
            call_args = fake_monitor.observe_asset.call_args
            assert call_args.kwargs["asset_type"] == "drone"
    finally:
        settings.security.asset_tracking_enabled = old_enabled
