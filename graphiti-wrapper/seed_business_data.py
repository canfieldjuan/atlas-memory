"""
Seed business data into the knowledge graph via POST /messages.

Uses the same code path as the nightly sync -- messages are processed
into graph episodes with entity/relationship extraction.

Usage:
    python seed_business_data.py [--url http://localhost:8001]

Fill in BUSINESS_FACTS below with real business information before running.
"""

import argparse
import asyncio
import sys

import httpx

# ============================================================================
# Business facts to seed -- EDIT THESE with real data
# ============================================================================

# NOTE: These are bracketed placeholders on purpose. The seed() guard below
# drops any fact still containing "[" so this script fails closed and will not
# ingest fictional sample data into a real knowledge graph. Replace the bracketed
# tokens with your real business facts before running.
BUSINESS_FACTS = [
    # Company basics
    "The company name is [COMPANY NAME].",
    "[COMPANY NAME] is located at [BUSINESS ADDRESS].",
    "[COMPANY NAME] provides [SERVICES OFFERED].",
    "Cleaning schedules are based on customer needs: [SCHEDULE OPTIONS].",

    # Team
    "[OWNER NAME] is the owner and founder of [COMPANY NAME].",
    "[MANAGER NAME] is the manager at [COMPANY NAME] and handles customers and staff.",

    # Clients
    "[CLIENT NAME] is a client of [COMPANY NAME].",

    # Communication
    "The preferred communication method for residential clients is [METHOD].",
    "The preferred communication method for commercial clients is [METHOD].",

    # Hours and scheduling
    "Office hours are [OFFICE HOURS].",

    # Invoicing
    "Invoices are sent [INVOICE SCHEDULE].",
]

GROUP_ID = "atlas-conversations"


async def seed(base_url: str) -> None:
    """Post business facts as messages to the graphiti wrapper."""
    # Health check first
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{base_url}/healthcheck")
            resp.raise_for_status()
            print(f"Service healthy: {resp.json()}")
        except Exception as e:
            print(f"ERROR: Service not reachable at {base_url}/healthcheck -- {e}")
            sys.exit(1)

    # Filter out placeholder facts
    facts = [f for f in BUSINESS_FACTS if "[" not in f]
    if not facts:
        print(
            "WARNING: All facts still contain placeholder brackets [...].\n"
            "Edit BUSINESS_FACTS in this file with real data before running."
        )
        sys.exit(1)

    # Build messages payload
    messages = [
        {
            "content": fact,
            "role_type": "system",
            "role": None,
            "source_description": "business-seed-data",
        }
        for fact in facts
    ]

    payload = {
        "group_id": GROUP_ID,
        "messages": messages,
    }

    print(f"Sending {len(messages)} business facts to {base_url}/messages ...")

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{base_url}/messages", json=payload)
        resp.raise_for_status()
        result = resp.json()

    print(f"Done: {result}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed business data into knowledge graph")
    parser.add_argument("--url", default="http://localhost:8001", help="Graphiti wrapper URL")
    args = parser.parse_args()
    asyncio.run(seed(args.url))


if __name__ == "__main__":
    main()
