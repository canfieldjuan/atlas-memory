"""
Unit tests for IdentityRepository.diff_manifest() logic and validation.

Patches get_all() to return controlled embeddings; no real DB or GPU.
"""

from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

from atlas_brain.storage.repositories.identity import (
    VALID_MODALITIES,
    IdentityRepository,
    _DIMS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _repo() -> IdentityRepository:
    return IdentityRepository()


def _face_embedding(name: str = "alice") -> np.ndarray:
    """Generate a deterministic 512-dim face embedding."""
    rng = np.random.RandomState(hash(name) % (2**31))
    return rng.randn(512).astype(np.float32)


def _gait_embedding(name: str = "alice") -> np.ndarray:
    """Generate a deterministic 256-dim gait embedding."""
    rng = np.random.RandomState(hash(name) % (2**31))
    return rng.randn(256).astype(np.float32)


# ---------------------------------------------------------------------------
# diff_manifest tests
# ---------------------------------------------------------------------------

class TestDiffManifest:
    """Verify diff_manifest correctly compares edge manifest to brain DB."""

    @pytest.mark.asyncio
    async def test_brain_has_extra_identities_to_send(self):
        repo = _repo()
        brain_data = {"alice": _face_embedding("alice"), "bob": _face_embedding("bob")}

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = brain_data
            edge_manifest = {"face": ["alice"]}

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        assert "face" in to_send
        assert "bob" in to_send["face"]
        assert "alice" not in to_send.get("face", {})

    @pytest.mark.asyncio
    async def test_edge_has_extra_identities_need_from_edge(self):
        repo = _repo()

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = {"alice": _face_embedding("alice")}
            edge_manifest = {"face": ["alice", "charlie"]}

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        assert "face" in need_from_edge
        assert "charlie" in need_from_edge["face"]

    @pytest.mark.asyncio
    async def test_both_have_same_identities_empty_diffs(self):
        repo = _repo()

        async def mock_get_all(mod):
            if mod == "face":
                return {"alice": _face_embedding("alice")}
            return {}

        with patch.object(repo, "get_all", side_effect=mock_get_all):
            edge_manifest = {"face": ["alice"]}

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        assert to_send == {}
        assert need_from_edge == {}

    @pytest.mark.asyncio
    async def test_to_delete_always_empty(self):
        repo = _repo()

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = {}
            edge_manifest = {"face": ["alice", "bob"]}

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        # By design, to_delete is always empty
        assert to_delete == {}

    @pytest.mark.asyncio
    async def test_multiple_modalities_handled_independently(self):
        repo = _repo()

        async def mock_get_all(mod):
            if mod == "face":
                return {"alice": _face_embedding("alice")}
            elif mod == "gait":
                return {"bob": _gait_embedding("bob")}
            return {}

        with patch.object(repo, "get_all", side_effect=mock_get_all):
            edge_manifest = {
                "face": ["alice", "charlie"],
                "gait": [],
            }

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        # face: brain has alice (edge has too), edge has charlie (brain doesn't)
        assert "face" not in to_send  # alice already on edge, no extras on brain
        assert "charlie" in need_from_edge.get("face", [])

        # gait: brain has bob (edge doesn't)
        assert "bob" in to_send.get("gait", {})

    @pytest.mark.asyncio
    async def test_empty_edge_manifest_sends_all_brain(self):
        repo = _repo()
        brain_data = {"alice": _face_embedding("alice"), "bob": _face_embedding("bob")}

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = brain_data
            edge_manifest = {}  # edge has nothing

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        assert "face" in to_send
        assert set(to_send["face"].keys()) == {"alice", "bob"}

    @pytest.mark.asyncio
    async def test_empty_brain_db_requests_all_from_edge(self):
        repo = _repo()

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = {}
            edge_manifest = {"face": ["alice", "bob"]}

            to_send, to_delete, need_from_edge = await repo.diff_manifest(edge_manifest)

        assert to_send == {}
        assert "face" in need_from_edge
        assert set(need_from_edge["face"]) == {"alice", "bob"}

    @pytest.mark.asyncio
    async def test_to_send_embeddings_are_lists(self):
        """Verify embeddings in to_send are converted to lists (JSON-serializable)."""
        repo = _repo()
        emb = _face_embedding("alice")

        with patch.object(repo, "get_all", new_callable=AsyncMock) as mock_get_all:
            mock_get_all.return_value = {"alice": emb}
            edge_manifest = {"face": []}

            to_send, _, _ = await repo.diff_manifest(edge_manifest)

        assert isinstance(to_send["face"]["alice"], list)
        assert len(to_send["face"]["alice"]) == 512


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------

class TestValidation:
    """Verify upsert validation for modality and dimension."""

    @pytest.mark.asyncio
    @patch("atlas_brain.storage.repositories.identity.get_db_pool")
    async def test_invalid_modality_raises(self, mock_pool):
        repo = _repo()
        with pytest.raises(ValueError, match="Invalid modality"):
            await repo.upsert("alice", "voice", np.zeros(192))

    @pytest.mark.asyncio
    @patch("atlas_brain.storage.repositories.identity.get_db_pool")
    async def test_dimension_mismatch_raises(self, mock_pool):
        repo = _repo()
        wrong_dim = np.zeros(128)
        with pytest.raises(ValueError, match="dim mismatch"):
            await repo.upsert("alice", "face", wrong_dim)

    @pytest.mark.asyncio
    @patch("atlas_brain.storage.repositories.identity.get_db_pool")
    async def test_valid_modality_and_dim_passes_validation(self, mock_pool):
        repo = _repo()
        mock_pool_inst = AsyncMock()
        mock_pool.return_value = mock_pool_inst

        # Should not raise -- 512-dim face embedding is valid
        await repo.upsert("alice", "face", np.zeros(512))
        mock_pool_inst.execute.assert_awaited_once()

    def test_valid_modalities_constant(self):
        assert "face" in VALID_MODALITIES
        assert "gait" in VALID_MODALITIES
        assert "speaker" in VALID_MODALITIES
        assert len(VALID_MODALITIES) == 3

    def test_dims_constant(self):
        assert _DIMS["face"] == 512
        assert _DIMS["gait"] == 256
        assert _DIMS["speaker"] == 192
