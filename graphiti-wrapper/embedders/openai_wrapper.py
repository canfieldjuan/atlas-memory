import logging
import asyncio
from typing import List, Optional

from graphiti_core.embedder import EmbedderClient

logger = logging.getLogger(__name__)


class OpenAIEmbedderWrapper(EmbedderClient):
    """Thin wrapper to adapt OpenAI embedder to expected async interface."""

    def __init__(
        self,
        api_key: str,
        model: str = "text-embedding-3-small",
        base_url: Optional[str] = None,
        embedding_dim: Optional[int] = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.embedding_dim = embedding_dim
        self._client = None
        self._lock = asyncio.Lock()
        logger.info("OpenAIEmbedderWrapper init: model=%s base=%s", self.model, str(self.base_url))

    async def _ensure_client(self) -> None:
        if self._client is not None:
            return
        async with self._lock:
            if self._client is not None:
                return
            await self._load_client()

    async def _load_client(self) -> None:
        def _load():
            try:
                from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig  # type: ignore
            except Exception as ex:
                logger.error("graphiti_core OpenAI embedder import failed: %s", ex)
                raise
            cfg = OpenAIEmbedderConfig(
                embedding_model=self.model,
                api_key=self.api_key,
                base_url=self.base_url,
            )
            return OpenAIEmbedder(cfg)
        logger.debug("Creating OpenAI embedder client")
        self._client = await asyncio.to_thread(_load)

    async def create(self, input_data: str) -> List[float]:
        await self._ensure_client()
        # Call underlying embedder (may be sync or async)
        emb = self._client.create(input_data)
        # Await if it's a coroutine
        if asyncio.iscoroutine(emb):
            emb = await emb
        vec = emb.tolist() if hasattr(emb, "tolist") else list(emb)
        if self.embedding_dim and len(vec) != self.embedding_dim:
            logger.warning("Embedding dim mismatch: got %d expected %d", len(vec), self.embedding_dim)
        return vec

    async def create_batch(self, input_data_list: List[str]) -> List[List[float]]:
        await self._ensure_client()
        if not input_data_list:
            return []
        # Call underlying embedder (may be sync or async)
        embs = self._client.create_batch(input_data_list)
        # Await if it's a coroutine
        if asyncio.iscoroutine(embs):
            embs = await embs
        out = [e.tolist() if hasattr(e, "tolist") else list(e) for e in embs]
        if self.embedding_dim and out and len(out[0]) != self.embedding_dim:
            logger.warning("Embedding dim mismatch: got %d expected %d", len(out[0]), self.embedding_dim)
        return out
