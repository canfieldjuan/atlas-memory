"""
Initialize Neo4j database with Graphiti indexes and constraints.
Run this once after starting Neo4j to set up the required schema.
"""
import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from graphiti_core import Graphiti
from embedder_factory import EmbedderSettings, create_embedder

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Initialize Neo4j database with required indexes and constraints."""
    logger.info("Starting Neo4j database initialization...")

    # Get configuration from environment
    neo4j_uri = os.getenv('NEO4J_URI', 'bolt://localhost:7687')
    neo4j_user = os.getenv('NEO4J_USER', 'neo4j')
    neo4j_password = os.getenv('NEO4J_PASSWORD', 'password123')

    # Create embedder (required by Graphiti but not used for init)
    embedder_config = EmbedderSettings(
        provider=os.getenv('EMBEDDER_PROVIDER', 'transformers'),
        model=os.getenv('EMBEDDER_MODEL', 'all-MiniLM-L6-v2'),
        api_key=os.getenv('EMBEDDER_API_KEY') or os.getenv('OPENAI_API_KEY'),
        device=os.getenv('EMBEDDER_DEVICE', 'cpu'),
        batch_size=int(os.getenv('EMBEDDER_BATCH_SIZE', '32')),
        embedding_dim=int(os.getenv('EMBEDDER_EMBEDDING_DIM', '384')),
    )

    logger.info(f"Connecting to Neo4j at {neo4j_uri}...")
    embedder = create_embedder(embedder_config)

    # Create Graphiti client
    client = Graphiti(
        uri=neo4j_uri,
        user=neo4j_user,
        password=neo4j_password,
        embedder=embedder,
    )

    try:
        logger.info("Building indices and constraints...")
        logger.info("This will create the following fulltext indexes:")
        logger.info("  - episode_content (Episodic nodes)")
        logger.info("  - node_name_and_summary (Entity nodes)")
        logger.info("  - community_name (Community nodes)")
        logger.info("  - edge_name_and_fact (RELATES_TO edges)")

        await client.build_indices_and_constraints(delete_existing=False)

        logger.info("✓ Indexes and constraints created successfully!")
        logger.info("Neo4j database is ready for use.")

    except Exception as e:
        logger.error(f"✗ Failed to initialize database: {e}")
        raise
    finally:
        await client.close()
        logger.info("Database connection closed.")


if __name__ == "__main__":
    asyncio.run(main())
