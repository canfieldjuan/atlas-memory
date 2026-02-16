"""
Test network security monitor components.
"""

import pytest


class TestDeauthDetector:
    """Test WiFi deauth attack detection."""

    def test_detector_initialization(self):
        """Test detector initializes correctly."""
        from atlas_brain.security.wireless import DeauthDetector

        detector = DeauthDetector()
        assert detector._threshold == 10
        assert detector._window_seconds == 10
        assert len(detector._deauth_counts) == 0

    def test_deauth_count_tracking(self):
        """Test deauth frame counting."""
        from atlas_brain.security.wireless import DeauthDetector

        detector = DeauthDetector()
        
        test_mac = "AA:BB:CC:DD:EE:FF"
        for _ in range(3):
            result = detector.process_deauth_frame(test_mac, "11:22:33:44:55:66")
        
        assert result is False
        assert test_mac in detector._deauth_counts
        assert len(detector._deauth_counts[test_mac]) == 3

    def test_deauth_threshold_alert(self):
        """Test alert triggers at threshold."""
        from atlas_brain.security.wireless import DeauthDetector

        detector = DeauthDetector()
        
        test_mac = "AA:BB:CC:DD:EE:FF"
        target_mac = "11:22:33:44:55:66"
        
        result = False
        for i in range(10):
            result = detector.process_deauth_frame(test_mac, target_mac)
        
        assert result is True


class TestRogueAPDetector:
    """Test rogue AP and evil twin detection."""

    def test_detector_initialization(self):
        """Test detector initializes with known APs."""
        from atlas_brain.security.wireless import RogueAPDetector

        detector = RogueAPDetector()
        assert len(detector._seen_aps) == 0

    def test_legitimate_ap_no_alert(self):
        """Test legitimate AP does not trigger alert."""
        from atlas_brain.security.wireless import RogueAPDetector

        detector = RogueAPDetector()
        
        result = detector.process_beacon("AA:BB:CC:DD:EE:FF", "HomeWiFi", 6, -50)
        assert result is None

    def test_rogue_ap_detection(self):
        """Test evil twin detection with known SSID."""
        from atlas_brain.security.wireless import RogueAPDetector

        detector = RogueAPDetector()
        detector._known_ssids.add("HomeWiFi")
        detector._known_bssids.add("aa:bb:cc:dd:ee:ff")
        
        result = detector.process_beacon(
            "11:22:33:44:55:66",
            "HomeWiFi",
            6,
            -30
        )
        
        assert result is not None
        assert result["type"] == "evil_twin"
        assert result["bssid"] == "11:22:33:44:55:66"


class TestSecurityMonitor:
    """Test main security monitor service."""

    @pytest.mark.asyncio
    async def test_monitor_initialization(self):
        """Test security monitor initializes correctly."""
        from atlas_brain.security import SecurityMonitor

        monitor = SecurityMonitor()
        assert monitor.is_running is False

    @pytest.mark.asyncio
    async def test_monitor_disabled_by_default(self):
        """Test monitor respects enabled flag."""
        from atlas_brain.security import get_security_monitor

        monitor = get_security_monitor()
        await monitor.start()
        
        assert monitor.is_running is False
