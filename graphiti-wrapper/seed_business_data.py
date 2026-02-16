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

BUSINESS_FACTS = [
    # Company basics
    "The company name is Effingham Office Maids.",
    "Effingham Office Maids is located at 1901 South 4th Street, Suite 1, Effingham, IL 60421.",
    "Effingham Office Maids provides cleaning services for homes and offices.",
    "Cleaning schedules are based on customer needs: weekly, daily, biweekly, monthly, or quarterly.",

    # Team
    "Juan Canfield is the owner and founder of Effingham Office Maids.",
    "Juan handles customer complaints, rescheduling, scheduling of new customers, and customer outreach.",
    "Mayra Canfield is the manager at Effingham Office Maids. She manages employees and customers.",

    # Clients
    "Menards is a client of Effingham Office Maids.",
    "Ackra Builders is a client of Effingham Office Maids.",
    "The American Red Cross is a client of Effingham Office Maids.",
    "Mid Illinois Concrete is a client of Effingham Office Maids.",
    "Heartland Human Services is a client of Effingham Office Maids.",
    "Canarm Inc. is a client of Effingham Office Maids.",

    # Communication
    "The preferred communication method for residential clients is phone.",
    "The preferred communication method for commercial clients is email.",

    # Hours and scheduling
    "Office hours are 8:00 AM to 5:00 PM, Monday through Friday.",
    "Cleaning starts as early as 6:00 AM, Monday through Friday.",
    "Effingham Office Maids is closed on Saturday and Sunday.",

    # Invoicing
    "Invoices are sent on the 1st of every month by email.",
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
