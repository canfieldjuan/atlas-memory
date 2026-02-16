"""
Tests for ContextAggregator writer wiring (GAP-4 writer side).

Verifies that each data source properly feeds the global ContextAggregator:
- Vision subscriber feeds update_person() and update_object()
- HA WebSocket backend feeds update_device()
- Voice pipeline feeds update_person() from speaker ID
- Voice pipeline feeds set_room() from node_id
"""

import inspect

import pytest

from atlas_brain.orchestration.context import ContextAggregator, get_context


# ------------------------------------------------------------------ #
# Vision subscriber -> ContextAggregator
# ------------------------------------------------------------------ #


class TestVisionWriterWiring:
    """Verify VisionSubscriber._update_context feeds the aggregator."""

    def test_subscriber_has_update_context_method(self):
        """VisionSubscriber has a _update_context method."""
        from atlas_brain.vision.subscriber import VisionSubscriber
        assert hasattr(VisionSubscriber, "_update_context")

    def test_update_context_called_in_handle_event(self):
        """_handle_event calls _update_context before store/alerts."""
        from atlas_brain.vision.subscriber import VisionSubscriber
        source = inspect.getsource(VisionSubscriber._handle_event)
        assert "_update_context" in source
        # Must appear before _store_event
        idx_ctx = source.index("_update_context")
        idx_store = source.index("_store_event")
        assert idx_ctx < idx_store

    def test_update_context_feeds_person_for_person_class(self):
        """_update_context calls ctx.update_person for class_name == 'person'."""
        from atlas_brain.vision.subscriber import VisionSubscriber
        source = inspect.getsource(VisionSubscriber._update_context)
        assert "update_person" in source
        assert 'class_name == "person"' in source

    def test_update_context_feeds_object_for_other_classes(self):
        """_update_context calls ctx.update_object for non-person classes."""
        from atlas_brain.vision.subscriber import VisionSubscriber
        source = inspect.getsource(VisionSubscriber._update_context)
        assert "update_object" in source

    def test_update_context_skips_track_lost(self):
        """_update_context returns early for TRACK_LOST events."""
        from atlas_brain.vision.subscriber import VisionSubscriber
        source = inspect.getsource(VisionSubscriber._update_context)
        assert "TRACK_LOST" in source

    def test_vision_person_integration(self):
        """Simulating a person detection populates the aggregator."""
        from atlas_brain.vision.models import EventType, VisionEvent
        from atlas_brain.vision.subscriber import VisionSubscriber

        sub = VisionSubscriber.__new__(VisionSubscriber)
        event = VisionEvent(
            event_id="ev1",
            event_type=EventType.NEW_TRACK,
            track_id=42,
            class_name="person",
            source_id="cam_front",
            node_id="node1",
            timestamp=__import__("datetime").datetime.now(),
            metadata={"confidence": 0.91},
        )

        ctx = get_context()
        ctx._people.clear()
        try:
            sub._update_context(event)
            people = ctx.get_present_people()
            assert len(people) >= 1
            found = any(p.id == "track_42_cam_front" for p in people)
            assert found, "Expected person track_42_cam_front in context"
        finally:
            ctx._people.clear()

    def test_vision_object_integration(self):
        """Simulating a non-person detection populates objects."""
        from atlas_brain.vision.models import EventType, VisionEvent
        from atlas_brain.vision.subscriber import VisionSubscriber

        sub = VisionSubscriber.__new__(VisionSubscriber)
        event = VisionEvent(
            event_id="ev2",
            event_type=EventType.NEW_TRACK,
            track_id=7,
            class_name="car",
            source_id="cam_driveway",
            node_id="node1",
            timestamp=__import__("datetime").datetime.now(),
            metadata={"confidence": 0.85},
        )

        ctx = get_context()
        ctx._objects.clear()
        try:
            sub._update_context(event)
            objects = ctx.get_visible_objects()
            assert len(objects) >= 1
            found = any(o.label == "car" for o in objects)
            assert found, "Expected object 'car' in context"
        finally:
            ctx._objects.clear()


# ------------------------------------------------------------------ #
# HA WebSocket -> ContextAggregator
# ------------------------------------------------------------------ #


class TestHADeviceWriterWiring:
    """Verify HomeAssistantWebSocket feeds devices into the aggregator."""

    def test_ha_ws_has_update_context_device(self):
        """HomeAssistantWebSocket has _update_context_device method."""
        from atlas_brain.capabilities.backends.homeassistant_ws import HomeAssistantWebSocket
        assert hasattr(HomeAssistantWebSocket, "_update_context_device")

    def test_handle_message_calls_update_context_device(self):
        """_handle_message calls _update_context_device for state_changed."""
        from atlas_brain.capabilities.backends.homeassistant_ws import HomeAssistantWebSocket
        source = inspect.getsource(HomeAssistantWebSocket._handle_message)
        assert "_update_context_device" in source

    def test_update_context_device_calls_update_device(self):
        """_update_context_device calls ctx.update_device()."""
        from atlas_brain.capabilities.backends.homeassistant_ws import HomeAssistantWebSocket
        source = inspect.getsource(HomeAssistantWebSocket._update_context_device)
        assert "update_device" in source
        assert "friendly_name" in source

    def test_ha_device_integration(self):
        """Simulating an HA state_changed populates device context."""
        from atlas_brain.capabilities.backends.homeassistant_ws import HomeAssistantWebSocket

        backend = HomeAssistantWebSocket.__new__(HomeAssistantWebSocket)
        event_data = {
            "entity_id": "light.kitchen",
            "new_state": {
                "state": "on",
                "attributes": {
                    "friendly_name": "Kitchen Light",
                    "brightness": 255,
                },
            },
        }

        ctx = get_context()
        ctx._devices.clear()
        try:
            backend._update_context_device(event_data)
            devices = ctx.get_all_devices()
            assert len(devices) >= 1
            found = any(d.device_id == "light.kitchen" for d in devices)
            assert found, "Expected device light.kitchen in context"
            device = ctx.get_device_state("light.kitchen")
            assert device.name == "Kitchen Light"
            assert device.state["state"] == "on"
        finally:
            ctx._devices.clear()

    def test_ha_device_no_new_state_skipped(self):
        """When new_state is missing, no device is added."""
        from atlas_brain.capabilities.backends.homeassistant_ws import HomeAssistantWebSocket

        backend = HomeAssistantWebSocket.__new__(HomeAssistantWebSocket)
        event_data = {
            "entity_id": "light.kitchen",
            "old_state": {"state": "off"},
        }

        ctx = get_context()
        ctx._devices.clear()
        try:
            backend._update_context_device(event_data)
            assert len(ctx.get_all_devices()) == 0
        finally:
            ctx._devices.clear()


# ------------------------------------------------------------------ #
# Speaker ID -> ContextAggregator
# ------------------------------------------------------------------ #


class TestSpeakerWriterWiring:
    """Verify speaker identification feeds person context."""

    def test_speaker_id_injects_update_person(self):
        """Pipeline _identify_speaker_sync calls update_person on match."""
        from atlas_brain.voice.pipeline import VoicePipeline

        # Find the code block around "Speaker identified" that has update_person
        source = inspect.getsource(VoicePipeline)
        idx_identified = source.index("Speaker identified")
        # update_person call must follow the identification log
        idx_update = source.index("update_person", idx_identified)
        assert idx_update > idx_identified

    def test_speaker_id_passes_name_and_confidence(self):
        """update_person call includes name and confidence from match."""
        from atlas_brain.voice.pipeline import VoicePipeline

        # _update_speaker_context wires name, confidence, and node_id
        source = inspect.getsource(VoicePipeline._update_speaker_context)
        assert "match.user_name" in source
        assert "match.confidence" in source
        assert "self.node_id" in source


# ------------------------------------------------------------------ #
# Room/location -> ContextAggregator
# ------------------------------------------------------------------ #


class TestRoomWriterWiring:
    """Verify pipeline start sets room context."""

    def test_pipeline_start_calls_set_room(self):
        """VoicePipeline.start() calls set_room with node_id."""
        from atlas_brain.voice.pipeline import VoicePipeline
        source = inspect.getsource(VoicePipeline.start)
        assert "set_room" in source
        assert "node_id" in source

    def test_set_room_integration(self):
        """Calling set_room populates the context location."""
        ctx = get_context()
        ctx._current_room = None
        try:
            ctx.set_room("kitchen")
            result = ctx.build_context_string()
            assert "Location: kitchen" in result
        finally:
            ctx._current_room = None


# ------------------------------------------------------------------ #
# End-to-end: all writers feed build_context_string
# ------------------------------------------------------------------ #


class TestFullWriterPipeline:
    """Verify that data from all writers appears in LLM context string."""

    def test_all_sources_in_context_string(self):
        """Person, object, device, and room all appear in build_context_string."""
        ctx = get_context()
        ctx._people.clear()
        ctx._objects.clear()
        ctx._devices.clear()
        ctx._audio_events.clear()
        ctx._current_room = None

        try:
            ctx.update_person("sp1", name="Juan", confidence=0.95)
            ctx.update_object("laptop", confidence=0.8, location="desk")
            ctx.update_device("light.office", name="Office Light", state={"state": "on"})
            ctx.set_room("office")

            result = ctx.build_context_string()
            assert "Juan" in result
            assert "laptop" in result
            assert "Office Light" in result
            assert "Location: office" in result
        finally:
            ctx._people.clear()
            ctx._objects.clear()
            ctx._devices.clear()
            ctx._current_room = None
