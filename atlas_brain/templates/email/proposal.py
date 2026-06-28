"""
Email templates for Example Cleaning Co cleaning proposals.

These are sent after an estimate/walkthrough has been completed,
containing the detailed proposal for the client to review and approve.
"""

import os

# Business contact info (shared with estimate_confirmation). Real values are
# loaded from environment variables at runtime; the defaults below are
# public-safe placeholders only.
BUSINESS_NAME = os.environ.get("ATLAS_BUSINESS_NAME", "Example Cleaning Co")
BUSINESS_ADDRESS = os.environ.get("ATLAS_BUSINESS_ADDRESS", "123 Example St, Anytown IL, 60001")
BUSINESS_PHONE = os.environ.get("ATLAS_BUSINESS_PHONE", "(555) 010-0000")
BUSINESS_EMAIL = os.environ.get("ATLAS_BUSINESS_EMAIL", "info@example.com")
BUSINESS_WEBSITE = os.environ.get("ATLAS_BUSINESS_WEBSITE", "example.com")
# Email sign-off. Defaults to a generic, business-derived signatory so no
# personal name is hard-coded; override with a real signatory via env if desired.
BUSINESS_SIGNATORY = os.environ.get("ATLAS_BUSINESS_SIGNATORY", f"The {BUSINESS_NAME} Team")

# Key terms from proposal
TERMS = (
    "Verbal authorization to perform the outlined work constitutes customer "
    "agreement to pay the quoted amount. Contractor not responsible for worn, "
    "faded, or damaged carpet or fabric."
)


# =============================================================================
# BUSINESS PROPOSAL TEMPLATE
# =============================================================================

BUSINESS_PROPOSAL_SUBJECT = "Cleaning Proposal for {client_name}"

BUSINESS_PROPOSAL_TEMPLATE = """Dear {contact_name},

Thank you for taking the time to meet with us regarding cleaning services for {client_name}. We appreciate the opportunity to provide this proposal.

PROPOSAL SUMMARY
----------------
Business: {client_name}
Location: {address}
Contact: {contact_name}
Phone: {contact_phone}

AREAS TO BE CLEANED
-------------------
{areas_to_clean}

SCOPE OF WORK
-------------
{cleaning_description}

PRICING
-------
Cost Per Cleaning: ${price}
Frequency: {frequency}

WHAT SETS US APART
------------------
- We Clean Green Floor to Ceiling
- Affordable Prices
- Reliable Service
- Insured and Bonded
- Guaranteed Work

NEXT STEPS
----------
To proceed with services, simply reply to this email or give us a call at {BUSINESS_PHONE}. We can begin as soon as your schedule allows.

Upon completion of each service, an invoice will be provided. We offer flexible payment terms for our commercial clients.

IMPORTANT TERMS
---------------
{TERMS}

We look forward to the opportunity to serve {client_name}. Please don't hesitate to reach out with any questions.

Best regards,

{BUSINESS_SIGNATORY}
{BUSINESS_NAME}
{BUSINESS_ADDRESS}
Phone: {BUSINESS_PHONE}
Email: {BUSINESS_EMAIL}
Web: {BUSINESS_WEBSITE}
"""


# =============================================================================
# RESIDENTIAL PROPOSAL TEMPLATE
# =============================================================================

RESIDENTIAL_PROPOSAL_SUBJECT = "Your Cleaning Proposal - {client_name}"

RESIDENTIAL_PROPOSAL_TEMPLATE = """Hi {contact_name},

It was great meeting with you! Thank you for considering {BUSINESS_NAME} for your home cleaning needs. Here's the proposal we discussed:

YOUR HOME
---------
Address: {address}

AREAS WE'LL CLEAN
-----------------
{areas_to_clean}

WHAT WE'LL DO
-------------
{cleaning_description}

PRICING
-------
Cost Per Cleaning: ${price}
Frequency: {frequency}

WHY FAMILIES CHOOSE US
----------------------
- We Clean Green Floor to Ceiling (eco-friendly products safe for kids & pets!)
- Affordable Prices
- Reliable, Friendly Service
- Insured and Bonded
- 100% Satisfaction Guaranteed

READY TO GET STARTED?
---------------------
Just reply to this email or give us a call at {BUSINESS_PHONE}. We're flexible with scheduling and happy to work around your family's routine.

A FEW THINGS TO KNOW
--------------------
{TERMS}

We can't wait to help make your home sparkle! Let us know if you have any questions.

Warm regards,

{BUSINESS_SIGNATORY}
{BUSINESS_NAME}
{BUSINESS_PHONE}
{BUSINESS_EMAIL}
{BUSINESS_WEBSITE}
"""


def format_business_proposal(
    client_name: str,
    contact_name: str,
    contact_phone: str,
    address: str,
    areas_to_clean: str,
    cleaning_description: str,
    price: str,
    frequency: str = "As needed",
) -> tuple[str, str]:
    """
    Format a business cleaning proposal email.

    Args:
        client_name: Business name
        contact_name: Contact person's name
        contact_phone: Contact phone number
        address: Service address
        areas_to_clean: List of areas (e.g., "Offices, Bathrooms, Break Room")
        cleaning_description: Description of cleaning tasks
        price: Price per cleaning (without $)
        frequency: How often (e.g., "Weekly", "Bi-weekly", "As needed")

    Returns:
        Tuple of (subject, body)
    """
    subject = BUSINESS_PROPOSAL_SUBJECT.format(client_name=client_name)
    body = BUSINESS_PROPOSAL_TEMPLATE.format(
        client_name=client_name,
        contact_name=contact_name,
        contact_phone=contact_phone,
        address=address,
        areas_to_clean=areas_to_clean,
        cleaning_description=cleaning_description,
        price=price,
        frequency=frequency,
        BUSINESS_NAME=BUSINESS_NAME,
        BUSINESS_ADDRESS=BUSINESS_ADDRESS,
        BUSINESS_PHONE=BUSINESS_PHONE,
        BUSINESS_EMAIL=BUSINESS_EMAIL,
        BUSINESS_WEBSITE=BUSINESS_WEBSITE,
        BUSINESS_SIGNATORY=BUSINESS_SIGNATORY,
        TERMS=TERMS,
    )
    return subject, body


def format_residential_proposal(
    client_name: str,
    contact_name: str,
    address: str,
    areas_to_clean: str,
    cleaning_description: str,
    price: str,
    frequency: str = "As needed",
) -> tuple[str, str]:
    """
    Format a residential cleaning proposal email.

    Args:
        client_name: Family/client name
        contact_name: Contact person's first name
        address: Home address
        areas_to_clean: List of areas (e.g., "3 Bedrooms, 2 Bathrooms, Kitchen")
        cleaning_description: Description of cleaning tasks
        price: Price per cleaning (without $)
        frequency: How often (e.g., "Weekly", "Bi-weekly", "As needed")

    Returns:
        Tuple of (subject, body)
    """
    subject = RESIDENTIAL_PROPOSAL_SUBJECT.format(client_name=client_name)
    body = RESIDENTIAL_PROPOSAL_TEMPLATE.format(
        client_name=client_name,
        contact_name=contact_name,
        address=address,
        areas_to_clean=areas_to_clean,
        cleaning_description=cleaning_description,
        price=price,
        frequency=frequency,
        BUSINESS_NAME=BUSINESS_NAME,
        BUSINESS_PHONE=BUSINESS_PHONE,
        BUSINESS_EMAIL=BUSINESS_EMAIL,
        BUSINESS_WEBSITE=BUSINESS_WEBSITE,
        BUSINESS_SIGNATORY=BUSINESS_SIGNATORY,
        TERMS=TERMS,
    )
    return subject, body
