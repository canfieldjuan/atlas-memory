"""
Test wireless monitor implementation.

Run with: pytest tests/security/test_wireless_monitor.py -v
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from atlas_brain.security.wireless.monitor import WirelessMonitor
from atlas_brain.security.wireless.deauth_detector import DeauthDetector
from atlas_brain.security.wireless.rogue_ap_detector import RogueAPDetector


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    with patch("atlas_brain.security.wireless.monitor.settings") as mock:
        mock.security.wireless_interface = "wlan0mon"
        mock.security.wireless_channels = [1, 6, 11]
        mock.security.channel_hop_interval = 2.0
        mock.security.pcap_directory = "/tmp/atlas_test_pcap"
        mock.security.deauth_threshold = 10
        mock.security.known_ssids = ["MyNetwork"]
        mock.security.known_ap_bssids = ["00:11:22:33:44:55"]
        yield mock


def test_deauth_detector_threshold():
    """Test deauth detector threshold logic."""
    detector = DeauthDetector()
    detector._threshold = 3
    
    attacker = "AA:BB:CC:DD:EE:FF"
    target = "11:22:33:44:55:66"
    
    assert not detector.process_deauth_frame(attacker, target)
    assert not detector.process_deauth_frame(attacker, target)
    
    alert_triggered = detector.process_deauth_frame(attacker, target)
    assert alert_triggered
    
    stats = detector.get_stats()
    assert attacker not in stats


def test_rogue_ap_detector_evil_twin():
    """Test rogue AP detector identifies evil twins."""
    detector = RogueAPDetector()
    detector._known_ssids = {"MyNetwork"}
    detector._known_bssids = {"00:11:22:33:44:55"}
    
    result = detector.process_beacon(
        bssid="AA:BB:CC:DD:EE:FF",
        ssid="MyNetwork",
        channel=6,
        signal_strength=-50
    )
    
    assert result is not None
    assert result["type"] == "evil_twin"
    assert result["ssid"] == "MyNetwork"
    assert result["bssid"] == "AA:BB:CC:DD:EE:FF"
    
    
def test_rogue_ap_detector_known_ap():
    """Test rogue AP detector ignores known APs."""
    detector = RogueAPDetector()
    detector._known_ssids = {"MyNetwork"}
    detector._known_bssids = {"00:11:22:33:44:55"}
    
    result = detector.process_beacon(
        bssid="00:11:22:33:44:55",
        ssid="MyNetwork",
        channel=6,
        signal_strength=-50
    )
    
    assert result is None
