"""
Test network IDS components (Phase 2).
"""

import pytest
import time
from unittest.mock import MagicMock


class TestPortScanDetector:
    """Test port scan detection."""
    
    def test_detector_initialization(self):
        """Test detector initializes correctly."""
        from atlas_brain.security.network import PortScanDetector
        
        detector = PortScanDetector()
        assert detector._threshold == 20
        assert detector._window_seconds == 60
        assert len(detector._port_access) == 0
    
    def test_below_threshold_no_alert(self):
        """Test that scans below threshold don't trigger."""
        from atlas_brain.security.network import PortScanDetector
        
        detector = PortScanDetector()
        
        for port in range(1, 15):
            result = detector.process_connection_attempt(
                "192.168.1.100", "192.168.1.1", port
            )
            assert result is None
    
    def test_threshold_triggers_alert(self):
        """Test that threshold triggers port scan alert."""
        from atlas_brain.security.network import PortScanDetector
        
        detector = PortScanDetector()
        
        result = None
        for port in range(1, 22):
            r = detector.process_connection_attempt(
                "192.168.1.100", "192.168.1.1", port
            )
            if r:
                result = r
        
        assert result is not None
        assert result["type"] == "port_scan"
        assert result["severity"] == "low"
        assert result["ports_scanned"] >= 20    
    def test_whitelist_no_alert(self):
        """Test whitelisted IPs don't trigger alerts."""
        from atlas_brain.security.network import PortScanDetector
        from atlas_brain.config import settings
        
        original = settings.security.whitelist_ips
        settings.security.whitelist_ips = ["192.168.1.100"]
        
        detector = PortScanDetector()
        
        for port in range(1, 50):
            result = detector.process_connection_attempt(
                "192.168.1.100", "192.168.1.1", port
            )
            assert result is None
        
        settings.security.whitelist_ips = original
    
    def test_severity_calculation(self):
        """Test severity levels based on port count."""
        from atlas_brain.security.network import PortScanDetector
        
        detector = PortScanDetector()
        
        assert detector._calculate_severity(15) == "low"
        assert detector._calculate_severity(50) == "medium"
        assert detector._calculate_severity(100) == "high"


class TestARPMonitor:
    """Test ARP poisoning detection."""
    
    def test_monitor_initialization(self):
        """Test ARP monitor initializes correctly."""
        from atlas_brain.security.network import ARPMonitor
        
        monitor = ARPMonitor()
        assert len(monitor._arp_table) == 0
    
    def test_first_arp_no_alert(self):
        """Test first ARP entry doesn't trigger alert."""
        from atlas_brain.security.network import ARPMonitor
        
        monitor = ARPMonitor()
        result = monitor.process_arp_packet(
            "192.168.1.10", "AA:BB:CC:DD:EE:01", 2
        )
        assert result is None
        assert len(monitor._arp_table) == 1
    
    def test_arp_change_triggers_alert(self):
        """Test ARP MAC change triggers alert."""
        from atlas_brain.security.network import ARPMonitor
        
        monitor = ARPMonitor()
        monitor.process_arp_packet("192.168.1.10", "AA:BB:CC:DD:EE:01", 2)
        result = monitor.process_arp_packet("192.168.1.10", "AA:BB:CC:DD:EE:02", 2)
        
        assert result is not None
        assert result["type"] == "arp_change"
        assert result["severity"] == "medium"
        assert result["source_ip"] == "192.168.1.10"
    
    def test_gateway_change_high_severity(self):
        """Test gateway MAC change has high severity."""
        from atlas_brain.security.network import ARPMonitor
        from atlas_brain.config import settings
        
        original = settings.security.known_gateways
        settings.security.known_gateways = ["192.168.1.1"]
        
        monitor = ARPMonitor()
        monitor.process_arp_packet("192.168.1.1", "AA:BB:CC:DD:EE:01", 2)
        result = monitor.process_arp_packet("192.168.1.1", "AA:BB:CC:DD:EE:02", 2)
        
        assert result is not None
        assert result["severity"] == "high"
        assert result["is_gateway"] is True
        
        settings.security.known_gateways = original


class TestTrafficAnalyzer:
    """Test traffic anomaly detection."""
    
    def test_analyzer_initialization(self):
        """Test traffic analyzer initializes correctly."""
        from atlas_brain.security.network import TrafficAnalyzer
        
        analyzer = TrafficAnalyzer()
        assert analyzer._baseline_hours == 24
        assert analyzer._baseline_established is False
    
    def test_record_traffic(self):
        """Test traffic recording."""
        from atlas_brain.security.network import TrafficAnalyzer
        
        analyzer = TrafficAnalyzer()
        result = analyzer.record_traffic("in", 1024, "192.168.1.10")
        
        assert result is None
        metrics = analyzer.get_metrics()
        assert metrics["total_connections"] == 1
    
    def test_baseline_not_ready(self):
        """Test no alerts before baseline established."""
        from atlas_brain.security.network import TrafficAnalyzer
        
        analyzer = TrafficAnalyzer()
        
        for i in range(100):
            result = analyzer.record_traffic("in", 10000, "192.168.1.10")
            assert result is None
    
    def test_metrics_collection(self):
        """Test metrics are collected correctly."""
        from atlas_brain.security.network import TrafficAnalyzer
        
        analyzer = TrafficAnalyzer()
        analyzer.record_traffic("in", 1024, "192.168.1.10")
        analyzer.record_traffic("out", 2048, "192.168.1.10")
        
        metrics = analyzer.get_metrics()
        assert metrics["total_connections"] == 2
        assert "bytes_per_sec_in" in metrics
        assert "bytes_per_sec_out" in metrics


class TestSecurityMonitorPacketRouting:
    """Test packet routing from capture into Phase 2 detectors."""

    def test_ip_packet_routes_to_port_scan_detector(self):
        """Verify TCP packets are forwarded to port scan detector."""
        from scapy.layers.inet import IP, TCP

        from atlas_brain.security import SecurityMonitor
        from atlas_brain.security.network import PortScanDetector, TrafficAnalyzer

        monitor = SecurityMonitor()
        monitor._port_scan_detector = PortScanDetector()
        monitor._traffic_analyzer = TrafficAnalyzer()
        monitor._traffic_analyzer._enabled = False

        for dst_port in [2201, 2202, 2203]:
            pkt = IP(src="10.10.10.20", dst="10.10.10.1") / TCP(dport=dst_port)
            monitor._process_network_packet(pkt)

        stats = monitor._port_scan_detector.get_stats()
        assert stats.get("10.10.10.20") == 3
        assert monitor.get_runtime_stats()["packets_processed"] == 3

    def test_arp_packet_routes_to_arp_monitor(self):
        """Verify ARP packets are forwarded to ARP monitor."""
        from scapy.layers.l2 import ARP

        from atlas_brain.security import SecurityMonitor
        from atlas_brain.security.network import ARPMonitor

        monitor = SecurityMonitor()
        monitor._arp_monitor = ARPMonitor()

        pkt_one = ARP(op=2, psrc="192.168.5.10", hwsrc="AA:BB:CC:DD:EE:01")
        pkt_two = ARP(op=2, psrc="192.168.5.10", hwsrc="AA:BB:CC:DD:EE:02")

        monitor._process_network_packet(pkt_one)
        monitor._process_network_packet(pkt_two)

        changes = monitor._arp_monitor.get_change_history("192.168.5.10")
        assert len(changes["192.168.5.10"]) == 1

    def test_ip_packet_routes_to_traffic_analyzer(self):
        """Verify IP packets are forwarded to traffic analyzer."""
        from scapy.layers.inet import IP, UDP

        from atlas_brain.security import SecurityMonitor
        from atlas_brain.security.network import TrafficAnalyzer

        monitor = SecurityMonitor()
        monitor._traffic_analyzer = TrafficAnalyzer()

        pkt = IP(src="172.16.0.9", dst="172.16.0.1") / UDP(dport=5353)
        monitor._process_network_packet(pkt)

        metrics = monitor._traffic_analyzer.get_metrics()
        assert metrics["total_connections"] == 1
        assert metrics["bytes_per_sec_in"] >= 0.0

    def test_build_capture_filter_from_protocols(self):
        """Verify BPF filter is derived from configured protocols."""
        from atlas_brain.config import settings
        from atlas_brain.security import SecurityMonitor

        original = settings.security.protocols_to_monitor
        settings.security.protocols_to_monitor = ["TCP", "ARP", "INVALID"]

        monitor = SecurityMonitor()
        capture_filter = monitor._build_capture_filter()

        assert capture_filter in ("arp or tcp", "tcp or arp")
        settings.security.protocols_to_monitor = original

    def test_writes_packet_when_pcap_writer_present(self):
        """Verify packet capture writer receives captured packets."""
        from scapy.layers.inet import IP, TCP

        from atlas_brain.security import SecurityMonitor

        monitor = SecurityMonitor()
        fake_writer = MagicMock()
        monitor._pcap_writer = fake_writer
        monitor._traffic_analyzer = None
        monitor._port_scan_detector = None
        monitor._arp_monitor = None

        pkt = IP(src="10.0.0.3", dst="10.0.0.9") / TCP(dport=443)
        monitor._process_network_packet(pkt)

        fake_writer.write.assert_called_once()

    def test_enforces_pcap_storage_limit(self, tmp_path):
        """Verify oldest pcap files are removed when storage exceeds limit."""
        from atlas_brain.config import settings
        from atlas_brain.security import SecurityMonitor

        old_dir = settings.security.pcap_directory
        old_limit = settings.security.pcap_max_size_mb
        settings.security.pcap_directory = str(tmp_path)
        settings.security.pcap_max_size_mb = 1

        try:
            old_file = tmp_path / "old.pcap"
            new_file = tmp_path / "new.pcap"
            old_file.write_bytes(b"a" * 700_000)
            new_file.write_bytes(b"b" * 700_000)

            monitor = SecurityMonitor()
            monitor._enforce_pcap_storage_limit()

            assert old_file.exists() is False
            assert new_file.exists() is True
        finally:
            settings.security.pcap_directory = old_dir
            settings.security.pcap_max_size_mb = old_limit
