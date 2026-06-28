"""
Core configuration and protocols for atlas_comms.
"""

from .config import (
    CommsConfig,
    BusinessContext,
    BusinessHours,
    SchedulingConfig,
    ServerConfig,
    AtlasBrainConfig,
    comms_settings,
    DEFAULT_PERSONAL_CONTEXT,
    EXAMPLE_CLEANING_CONTEXT,
)
from .protocols import (
    Call,
    CallState,
    CallDirection,
    SMSMessage,
    SMSDirection,
    TelephonyProvider,
    AudioChunkCallback,
    CallEventCallback,
    SMSCallback,
)

__all__ = [
    # Config
    "CommsConfig",
    "BusinessContext",
    "BusinessHours",
    "SchedulingConfig",
    "ServerConfig",
    "AtlasBrainConfig",
    "comms_settings",
    "DEFAULT_PERSONAL_CONTEXT",
    "EXAMPLE_CLEANING_CONTEXT",
    # Protocols
    "Call",
    "CallState",
    "CallDirection",
    "SMSMessage",
    "SMSDirection",
    "TelephonyProvider",
    "AudioChunkCallback",
    "CallEventCallback",
    "SMSCallback",
]
