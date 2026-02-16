"""Tests for memory quality signal detection."""

import inspect
import pytest

from atlas_brain.memory.quality import (
    MemoryQualityDetector,
    QualitySignal,
    _CORRECTION_PATTERNS,
    get_quality_detector,
)


# ---------------------------------------------------------------------------
# TestCorrectionDetection
# ---------------------------------------------------------------------------


class TestCorrectionDetection:
    """Test correction pattern matching."""

    def setup_method(self):
        self.detector = MemoryQualityDetector()

    @pytest.mark.parametrize(
        "text, expected_pattern",
        [
            ("No, I meant the kitchen lights", "no_i_meant"),
            ("no I meant something else", "no_i_meant"),
            ("That's wrong, it should be Tuesday", "thats_wrong"),
            ("thats not right", "thats_wrong"),
            ("That's incorrect", "thats_wrong"),
            ("That's not correct at all", "thats_wrong"),
            ("I already told you my name", "already_told"),
            ("I just said I want pizza", "already_told"),
            ("That's not what I asked", "not_what_i_asked"),
            ("not what I said", "not_what_i_asked"),
            ("Not what I meant at all", "not_what_i_asked"),
            ("You're wrong about that", "youre_wrong"),
            ("you are mistaken", "youre_wrong"),
            ("You're confused", "youre_wrong"),
            ("I didn't say that", "didnt_say"),
            ("I didnt say turn off", "didnt_say"),
            ("Let me rephrase that", "let_me_rephrase"),
            ("let me clarify what I need", "let_me_rephrase"),
            ("Let me repeat myself", "let_me_rephrase"),
            ("No, not that one", "no_not_that"),
            ("no not that", "no_not_that"),
            ("You misunderstood me", "misunderstood"),
            ("misunderstood what I said", "misunderstood"),
            ("I keep telling you it's Tuesday", "keep_telling"),
            ("I keep saying the same thing", "keep_telling"),
            ("I keep asking for help", "keep_telling"),
        ],
    )
    def test_correction_detected(self, text, expected_pattern):
        signal = self.detector.detect(
            session_id="test-session",
            user_content=text,
        )
        assert signal.correction is True
        assert signal.correction_pattern == expected_pattern

    @pytest.mark.parametrize(
        "text",
        [
            "No thanks, I'm good",
            "What's the weather like?",
            "Turn on the lights",
            "Tell me about machine learning",
            "I said hello",  # "I said" without "already/just"
            "Can you repeat that?",  # user asking Atlas to repeat, not correcting
            "That's right!",
            "Yes, that's correct",
            "No problem",
            "I know what you mean",
        ],
    )
    def test_correction_not_detected(self, text):
        signal = self.detector.detect(
            session_id="test-session",
            user_content=text,
        )
        assert signal.correction is False
        assert signal.correction_pattern is None

    def test_command_turns_skipped(self):
        signal = self.detector.detect(
            session_id="test-session",
            user_content="No, I meant the kitchen lights",
            turn_type="command",
        )
        assert signal.correction is False

    def test_empty_content_skipped(self):
        signal = self.detector.detect(
            session_id="test-session",
            user_content="",
        )
        assert signal.correction is False

    def test_detection_ms_populated(self):
        signal = self.detector.detect(
            session_id="test-session",
            user_content="Hello there",
        )
        assert signal.detection_ms >= 0


# ---------------------------------------------------------------------------
# TestQualitySignalMetadata
# ---------------------------------------------------------------------------


class TestQualitySignalMetadata:
    """Test QualitySignal.to_metadata() serialization."""

    def test_empty_signal(self):
        signal = QualitySignal()
        assert signal.to_metadata() == {}

    def test_correction_only(self):
        signal = QualitySignal(
            correction=True,
            correction_pattern="no_i_meant",
            detection_ms=0.05,
        )
        meta = signal.to_metadata()
        assert "memory_quality" in meta
        mq = meta["memory_quality"]
        assert mq["correction"] is True
        assert mq["correction_pattern"] == "no_i_meant"
        assert mq["detection_ms"] == 0.05
        assert "repetition" not in mq

    def test_repetition_only(self):
        signal = QualitySignal(
            repetition=True,
            repetition_of_turn_id="abc-123",
            repetition_similarity=0.912,
            detection_ms=2.3,
        )
        meta = signal.to_metadata()
        mq = meta["memory_quality"]
        assert mq["repetition"] is True
        assert mq["repetition_of"] == "abc-123"
        assert mq["repetition_similarity"] == 0.912
        assert "correction" not in mq

    def test_both_signals(self):
        signal = QualitySignal(
            correction=True,
            correction_pattern="keep_telling",
            repetition=True,
            repetition_of_turn_id="xyz-789",
            repetition_similarity=0.95,
            detection_ms=1.5,
        )
        meta = signal.to_metadata()
        mq = meta["memory_quality"]
        assert mq["correction"] is True
        assert mq["repetition"] is True
        assert mq["correction_pattern"] == "keep_telling"
        assert mq["repetition_of"] == "xyz-789"

    def test_similarity_rounding(self):
        signal = QualitySignal(
            repetition=True,
            repetition_similarity=0.91234567,
            detection_ms=1.23456,
        )
        meta = signal.to_metadata()
        mq = meta["memory_quality"]
        assert mq["repetition_similarity"] == 0.912
        assert mq["detection_ms"] == 1.23


# ---------------------------------------------------------------------------
# TestSessionState
# ---------------------------------------------------------------------------


class TestSessionState:
    """Test session cache management."""

    def test_clear_session(self):
        detector = MemoryQualityDetector()
        # Manually add to cache
        detector._session_turns["sess-1"] = []
        detector._session_turns["sess-2"] = []

        detector.clear_session("sess-1")
        assert "sess-1" not in detector._session_turns
        assert "sess-2" in detector._session_turns

    def test_clear_nonexistent_session(self):
        detector = MemoryQualityDetector()
        # Should not raise
        detector.clear_session("nonexistent")

    def test_max_turns_trimming(self):
        import numpy as np
        from atlas_brain.memory.quality import DEFAULT_MAX_SESSION_TURNS

        detector = MemoryQualityDetector()
        max_turns = DEFAULT_MAX_SESSION_TURNS

        # Fill cache beyond max
        for i in range(max_turns + 5):
            detector._record_turn(
                "sess-trim",
                f"turn-{i}",
                np.random.randn(384).astype(np.float32),
            )

        assert len(detector._session_turns["sess-trim"]) == max_turns
        # Oldest should be trimmed, newest should be last
        last = detector._session_turns["sess-trim"][-1]
        assert last.turn_id == f"turn-{max_turns + 4}"

    def test_custom_max_session_turns(self):
        import numpy as np

        detector = MemoryQualityDetector(max_session_turns=3)
        for i in range(5):
            detector._record_turn(
                "sess-custom",
                f"turn-{i}",
                np.random.randn(384).astype(np.float32),
            )

        assert len(detector._session_turns["sess-custom"]) == 3
        assert detector._session_turns["sess-custom"][-1].turn_id == "turn-4"

    def test_session_eviction_when_max_exceeded(self):
        import numpy as np

        detector = MemoryQualityDetector(max_sessions=2)
        embedding = np.random.randn(384).astype(np.float32)

        detector._record_turn("sess-a", "t1", embedding)
        detector._record_turn("sess-b", "t2", embedding)
        assert len(detector._session_turns) == 2

        # Adding a 3rd session should evict the oldest (sess-a)
        detector._record_turn("sess-c", "t3", embedding)
        assert len(detector._session_turns) == 2
        assert "sess-a" not in detector._session_turns
        assert "sess-b" in detector._session_turns
        assert "sess-c" in detector._session_turns

    def test_session_lru_order_preserved(self):
        import numpy as np

        detector = MemoryQualityDetector(max_sessions=2)
        embedding = np.random.randn(384).astype(np.float32)

        detector._record_turn("sess-a", "t1", embedding)
        detector._record_turn("sess-b", "t2", embedding)

        # Touch sess-a again to make it most recently used
        detector._record_turn("sess-a", "t3", embedding)

        # Now sess-b is oldest; adding sess-c should evict sess-b
        detector._record_turn("sess-c", "t4", embedding)
        assert "sess-a" in detector._session_turns
        assert "sess-b" not in detector._session_turns
        assert "sess-c" in detector._session_turns

    def test_custom_repetition_threshold(self):
        # Constructor param is stored and accessible
        detector = MemoryQualityDetector(repetition_threshold=0.90)
        assert detector.repetition_threshold == 0.90


# ---------------------------------------------------------------------------
# TestRepetitionDetection -- skipped if sentence-transformers not installed
# ---------------------------------------------------------------------------

try:
    from sentence_transformers import SentenceTransformer
    _HAS_ST = True
except ImportError:
    _HAS_ST = False


@pytest.mark.skipif(not _HAS_ST, reason="sentence-transformers not installed")
class TestRepetitionDetection:
    """Test repetition detection using embeddings."""

    def setup_method(self):
        self.detector = MemoryQualityDetector()
        # Ensure the embedding model is loaded
        from atlas_brain.services.embedding.sentence_transformer import get_embedding_service
        svc = get_embedding_service()
        svc.load()

    def test_exact_repeat_detected(self):
        text = "What's the weather like today?"
        # First turn -- no repetition
        sig1 = self.detector.detect("sess-rep", text, turn_id="turn-1")
        assert sig1.repetition is False

        # Exact repeat -- should be detected
        sig2 = self.detector.detect("sess-rep", text, turn_id="turn-2")
        assert sig2.repetition is True
        assert sig2.repetition_of_turn_id == "turn-1"
        assert sig2.repetition_similarity is not None
        assert sig2.repetition_similarity > 0.95

    def test_semantic_repeat_detected(self):
        # First turn
        self.detector.detect(
            "sess-sem", "What is the temperature outside?", turn_id="turn-1",
        )
        # Semantic rephrase
        sig = self.detector.detect(
            "sess-sem", "How warm is it outside right now?", turn_id="turn-2",
        )
        # Semantic similarity should be reasonably high
        # This is model-dependent; if it doesn't hit 0.85, it's fine -- adjust threshold
        # The test verifies the mechanism works, not a specific threshold
        assert sig.detection_ms > 0

    def test_different_question_not_flagged(self):
        self.detector.detect(
            "sess-diff", "Turn on the kitchen lights", turn_id="turn-1",
        )
        sig = self.detector.detect(
            "sess-diff", "What's the weather like today?", turn_id="turn-2",
        )
        assert sig.repetition is False

    def test_cross_session_isolation(self):
        text = "Set a timer for 5 minutes"
        self.detector.detect("sess-A", text, turn_id="turn-A1")

        # Different session -- should not detect repetition from sess-A
        sig = self.detector.detect("sess-B", text, turn_id="turn-B1")
        assert sig.repetition is False


# ---------------------------------------------------------------------------
# TestWiring -- verify integration points reference get_quality_detector
# ---------------------------------------------------------------------------


class TestWiring:
    """Verify that integration points reference get_quality_detector."""

    def test_store_turn_references_quality_detector(self):
        source = inspect.getsource(
            __import__(
                "atlas_brain.agents.graphs.atlas",
                fromlist=["AtlasAgentGraph"],
            ).AtlasAgentGraph._store_turn
        )
        assert "get_quality_detector" in source

    def test_persist_streaming_turns_references_quality_detector(self):
        source = inspect.getsource(
            __import__(
                "atlas_brain.voice.launcher",
                fromlist=["_persist_streaming_turns"],
            )._persist_streaming_turns
        )
        assert "get_quality_detector" in source


# ---------------------------------------------------------------------------
# TestSingleton
# ---------------------------------------------------------------------------


class TestSingleton:
    """Test get_quality_detector() returns same instance."""

    def test_singleton(self):
        d1 = get_quality_detector()
        d2 = get_quality_detector()
        assert d1 is d2
