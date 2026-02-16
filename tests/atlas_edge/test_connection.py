"""
Tests for BrainConnectionManager message decoding.

Covers the _decode_message static helper that handles both
plain-text and zlib-compressed binary WebSocket frames.
"""

import json
import zlib

from atlas_edge.brain.connection import BrainConnectionManager


class TestDecodeMessage:
    """Tests for _decode_message static method."""

    def test_text_frame(self):
        """Plain JSON string is decoded correctly."""
        payload = {"type": "health_ack", "ts": 1.0}
        result = BrainConnectionManager._decode_message(json.dumps(payload))
        assert result == payload

    def test_binary_compressed_frame(self):
        """Zlib-compressed bytes are decompressed and decoded."""
        payload = {"type": "token", "token": "hello"}
        compressed = zlib.compress(json.dumps(payload).encode())
        result = BrainConnectionManager._decode_message(compressed)
        assert result == payload

    def test_binary_large_payload(self):
        """Larger compressed payloads round-trip correctly."""
        payload = {"type": "response", "data": "x" * 2000}
        compressed = zlib.compress(json.dumps(payload).encode())
        assert len(compressed) < len(json.dumps(payload))
        result = BrainConnectionManager._decode_message(compressed)
        assert result == payload

    def test_invalid_json_raises(self):
        """Non-JSON text raises ValueError."""
        import pytest

        with pytest.raises((json.JSONDecodeError, ValueError)):
            BrainConnectionManager._decode_message("not json")

    def test_invalid_zlib_raises(self):
        """Non-zlib bytes raise zlib.error."""
        import pytest

        with pytest.raises(zlib.error):
            BrainConnectionManager._decode_message(b"not compressed")


class TestCompressionEnabledDefault:
    """Verify compression_enabled wiring in constructor."""

    def test_default_compression_enabled(self):
        mgr = BrainConnectionManager(brain_url="ws://localhost:8000")
        assert mgr._compression_enabled is True

    def test_compression_disabled(self):
        mgr = BrainConnectionManager(
            brain_url="ws://localhost:8000",
            compression_enabled=False,
        )
        assert mgr._compression_enabled is False
