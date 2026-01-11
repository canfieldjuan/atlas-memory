import logging
import asyncio
import numpy as np
from typing import List, Dict

logger = logging.getLogger(__name__)


class SentimentSimilarityAnalyzer:
    """
    Sentiment analysis using semantic similarity to anchor texts.
    Uses existing TransformersEmbedder (all-MiniLM-L6-v2) for embeddings.
    No additional models needed.
    """

    POSITIVE_ANCHORS = [
        "This is amazing, excellent, and perfect!",
        "I absolutely love this! Great work!",
        "Very helpful, useful, and clear. Thanks!",
        "Outstanding performance and quality!",
        "Fantastic experience, highly recommend!",
    ]

    NEGATIVE_ANCHORS = [
        "This is terrible, awful, and broken.",
        "I hate this! Very disappointing and frustrating.",
        "Useless, unhelpful, and confusing mess.",
        "Horrible experience, doesn't work at all.",
        "Worst thing ever, complete garbage!",
    ]

    def __init__(self, embedder):
        """
        Initialize sentiment analyzer with existing embedder.

        Args:
            embedder: TransformersEmbedder instance (already loaded)
        """
        logger.info("Initializing SentimentSimilarityAnalyzer")
        self.embedder = embedder
        self.positive_embeddings = None
        self.negative_embeddings = None
        self._initialized = False
        logger.info("SentimentSimilarityAnalyzer created, not yet initialized")

    async def initialize(self):
        """Pre-compute anchor embeddings for faster analysis"""
        if self._initialized:
            logger.debug("Already initialized, skipping")
            return

        logger.info("Pre-computing positive anchor embeddings...")
        self.positive_embeddings = await self.embedder.create_batch(
            self.POSITIVE_ANCHORS
        )
        logger.info("Computed %d positive embeddings", len(self.positive_embeddings))

        logger.info("Pre-computing negative anchor embeddings...")
        self.negative_embeddings = await self.embedder.create_batch(
            self.NEGATIVE_ANCHORS
        )
        logger.info("Computed %d negative embeddings", len(self.negative_embeddings))

        self._initialized = True
        logger.info("SentimentSimilarityAnalyzer fully initialized")

    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """
        Compute cosine similarity between two vectors.

        Args:
            vec1: First embedding vector
            vec2: Second embedding vector

        Returns:
            Similarity score between -1 and 1 (higher = more similar)
        """
        a = np.array(vec1)
        b = np.array(vec2)
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            logger.warning("Zero vector detected in cosine similarity")
            return 0.0

        similarity = dot_product / (norm_a * norm_b)
        return float(similarity)

    async def analyze(self, text: str) -> Dict:
        """
        Analyze sentiment using semantic similarity.

        Args:
            text: Input text to analyze

        Returns:
            Dictionary with sentiment, score, confidence, and method
        """
        logger.info("Analyzing sentiment for text: %s", text[:100])
        await self.initialize()

        if not text or len(text.strip()) == 0:
            logger.warning("Empty text provided for sentiment analysis")
            return {
                "text": text,
                "sentiment": "neutral",
                "score": 0.0,
                "confidence": 0.0,
                "method": "semantic_similarity",
                "error": "Empty text"
            }

        try:
            # Get embedding for input text
            logger.debug("Creating embedding for input text")
            text_embedding = await self.embedder.create(text)
            logger.debug("Embedding created, length: %d", len(text_embedding))

            # Compute similarities with positive anchors
            logger.debug("Computing positive similarities")
            positive_similarities = [
                self.cosine_similarity(text_embedding, anchor)
                for anchor in self.positive_embeddings
            ]
            positive_score = max(positive_similarities)
            logger.debug("Positive score: %.4f", positive_score)

            # Compute similarities with negative anchors
            logger.debug("Computing negative similarities")
            negative_similarities = [
                self.cosine_similarity(text_embedding, anchor)
                for anchor in self.negative_embeddings
            ]
            negative_score = max(negative_similarities)
            logger.debug("Negative score: %.4f", negative_score)

            # Compute sentiment score (-1 to +1)
            score = positive_score - negative_score
            logger.info("Final score: %.4f (pos=%.4f, neg=%.4f)",
                       score, positive_score, negative_score)

            # Determine sentiment category
            if score >= 0.15:
                sentiment = "positive"
            elif score <= -0.15:
                sentiment = "negative"
            else:
                sentiment = "neutral"

            # Confidence is the absolute difference
            confidence = abs(score)

            logger.info("Sentiment: %s, Confidence: %.4f", sentiment, confidence)

            return {
                "text": text,
                "sentiment": sentiment,
                "score": float(score),
                "confidence": float(confidence),
                "method": "semantic_similarity",
                "debug": {
                    "positive_max": float(positive_score),
                    "negative_max": float(negative_score)
                }
            }

        except Exception as e:
            logger.error("Error analyzing sentiment: %s", str(e), exc_info=True)
            return {
                "text": text,
                "sentiment": "neutral",
                "score": 0.0,
                "confidence": 0.0,
                "method": "semantic_similarity",
                "error": str(e)
            }
