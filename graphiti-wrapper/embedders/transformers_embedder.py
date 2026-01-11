import logging
import asyncio
import threading
from typing import List, Optional

from graphiti_core.embedder import EmbedderClient

# Lazy import of sentence-transformers to avoid hard dependency at import time
# Model will be loaded only when used

logger = logging.getLogger(__name__)


class TransformersEmbedder(EmbedderClient):
    """
    Local embeddings using sentence-transformers.
    Provides async create and create_batch methods.
    """

    def __init__(
        self,
        model_name: str,
        device: str = "cpu",
        batch_size: int = 32,
        embedding_dim: Optional[int] = None,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.batch_size = max(1, int(batch_size))
        self.embedding_dim = embedding_dim
        self._model = None
        self._model_lock = asyncio.Lock()
        # Threading lock to serialize model inference - PyTorch models are NOT thread-safe
        self._inference_lock = threading.Lock()
        logger.info(
            "TransformersEmbedder init: model=%s device=%s batch=%d dim=%s",
            self.model_name,
            self.device,
            self.batch_size,
            str(self.embedding_dim),
        )

    async def _ensure_model(self) -> None:
        if self._model is not None:
            return
        async with self._model_lock:
            if self._model is not None:
                return
            await self._load_model()

    async def _load_model(self) -> None:
        def _load():
            try:
                from sentence_transformers import SentenceTransformer
            except Exception as ex:
                logger.error("sentence-transformers not installed: %s", ex)
                raise

            import torch  # type: ignore

            requested = self.device
            device = requested

            if requested == "cuda" and not torch.cuda.is_available():
                logger.warning("CUDA requested but not available, falling back to CPU")
                device = "cpu"
            elif requested == "cuda" and torch.cuda.is_available():
                logger.info("CUDA available, using GPU")

            # Force eager loading to avoid meta tensor issues in torch 2.9+
            # Load to CPU first, then move to target device
            logger.info("Loading model %s (will move to %s)", self.model_name, device)

            model = SentenceTransformer(
                self.model_name,
                device="cpu",  # Always load to CPU first
                trust_remote_code=True,
            )

            # Move to target device if not CPU
            if device != "cpu":
                logger.info("Moving model to %s", device)
                model = model.to(device)

            logger.info("Model loaded successfully on %s", device)
            return model, device

        logger.debug("Loading sentence-transformers model: %s", self.model_name)
        self._model, actual_device = await asyncio.to_thread(_load)
        self.device = actual_device
        logger.info("Model loaded: %s on %s", self.model_name, self.device)

    async def create(self, input_data: str) -> List[float]:
        await self._ensure_model()
        def _encode_single() -> List[float]:
            logger.info("create() called with input_data type=%s", type(input_data).__name__)

            # Handle case where input_data is a list instead of string
            text_to_encode = input_data
            if isinstance(input_data, list):
                logger.warning("create() received list instead of string, extracting first element")
                if len(input_data) == 0:
                    raise ValueError("Cannot encode empty list")
                text_to_encode = input_data[0]

            logger.info("create() encoding text preview: %s", str(text_to_encode)[:100])

            # Use threading lock to serialize model access - PyTorch is NOT thread-safe
            with self._inference_lock:
                emb = self._model.encode(
                    text_to_encode,
                    convert_to_numpy=True,
                    normalize_embeddings=False,
                    show_progress_bar=False,
                )

            logger.info("create() emb shape=%s", getattr(emb, 'shape', 'no shape'))
            vec = emb.tolist()
            logger.info("create() vec len=%d", len(vec))

            if self.embedding_dim and len(vec) != self.embedding_dim:
                logger.warning("Embedding dim mismatch: got %d expected %d", len(vec), self.embedding_dim)
            return vec
        return await asyncio.to_thread(_encode_single)

    async def create_batch(self, input_data_list: List[str]) -> List[List[float]]:
        await self._ensure_model()
        if not input_data_list:
            return []
        results: List[List[float]] = []
        start = 0
        total = len(input_data_list)
        while start < total:
            end = min(start + self.batch_size, total)
            batch = input_data_list[start:end]
            logger.info("Encoding batch %d:%d of %d", start, end, total)
            def _encode_batch() -> List[List[float]]:
                logger.info("create_batch() batch size=%d types=%s", len(batch), [type(x).__name__ for x in batch[:3]])

                # Use threading lock to serialize model access - PyTorch is NOT thread-safe
                with self._inference_lock:
                    embs = self._model.encode(
                        batch,
                        convert_to_numpy=True,
                        normalize_embeddings=False,
                        show_progress_bar=False,
                        batch_size=self.batch_size,
                    )

                logger.info("create_batch() embs type=%s shape=%s", type(embs).__name__, getattr(embs, 'shape', 'no shape'))
                out = [e.tolist() for e in embs]
                logger.info("create_batch() out len=%d first_vec_len=%d", len(out), len(out[0]) if out else 0)

                if self.embedding_dim and out and len(out[0]) != self.embedding_dim:
                    logger.warning(
                        "Embedding dim mismatch: got %d expected %d",
                        len(out[0]),
                        self.embedding_dim,
                    )
                return out
            part = await asyncio.to_thread(_encode_batch)
            results.extend(part)
            start = end
        return results
