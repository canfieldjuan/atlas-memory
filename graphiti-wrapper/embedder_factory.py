import logging
from dataclasses import dataclass
from typing import Optional, List, Any

from embedders import TransformersEmbedder, OpenAIEmbedderWrapper

logger = logging.getLogger(__name__)

# Singleton embedder instance to avoid reloading model on every request
_embedder_instance = None
_embedder_config_hash = None


@dataclass
class EmbedderSettings:
    provider: str = "openai"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    device: str = "cpu"
    batch_size: int = 32
    embedding_dim: Optional[int] = None

    def config_hash(self) -> str:
        """Generate a hash to detect config changes"""
        return f"{self.provider}:{self.model}:{self.device}:{self.batch_size}"


def validate_config(cfg: EmbedderSettings) -> None:
    if not cfg.provider:
        raise ValueError("provider is required")
    prov = cfg.provider.lower()
    if prov == "openai":
        if not cfg.api_key:
            raise ValueError("api_key required for openai provider")
        if not cfg.model:
            cfg.model = "text-embedding-3-small"
        if cfg.embedding_dim is None:
            cfg.embedding_dim = 1536
    elif prov == "transformers":
        if not cfg.model:
            cfg.model = "all-MiniLM-L6-v2"
        if cfg.embedding_dim is None:
            # Do not guess at runtime; common default for MiniLM
            cfg.embedding_dim = 384
    else:
        raise ValueError(f"Unsupported provider: {cfg.provider}")


def create_embedder(cfg: EmbedderSettings):
    """Create or return cached embedder instance (singleton pattern)"""
    global _embedder_instance, _embedder_config_hash

    validate_config(cfg)
    current_hash = cfg.config_hash()

    # Return cached instance if config hasn't changed
    if _embedder_instance is not None and _embedder_config_hash == current_hash:
        logger.debug("Reusing cached embedder instance")
        return _embedder_instance

    prov = cfg.provider.lower()
    logger.info("Creating NEW embedder: provider=%s model=%s device=%s", prov, cfg.model, cfg.device)

    if prov == "openai":
        _embedder_instance = OpenAIEmbedderWrapper(
            api_key=cfg.api_key or "",
            model=cfg.model or "text-embedding-3-small",
            base_url=cfg.base_url,
            embedding_dim=cfg.embedding_dim,
        )
    elif prov == "transformers":
        _embedder_instance = TransformersEmbedder(
            model_name=cfg.model or "all-MiniLM-L6-v2",
            device=cfg.device,
            batch_size=cfg.batch_size,
            embedding_dim=cfg.embedding_dim,
        )
    else:
        raise ValueError(f"Unsupported provider: {cfg.provider}")

    _embedder_config_hash = current_hash
    return _embedder_instance


def reset_embedder():
    """Reset the singleton embedder (useful for testing or config changes)"""
    global _embedder_instance, _embedder_config_hash
    _embedder_instance = None
    _embedder_config_hash = None
    logger.info("Embedder instance reset")
