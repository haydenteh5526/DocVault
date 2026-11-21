"""Household preferences request and response models."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_LEAD_DAYS = 60


class HouseholdPreferencesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reminder_days_before_due: int = Field(strict=True, ge=0, le=MAX_LEAD_DAYS)
    default_split_rule: Literal["equal", "days_home"]
    routines_enabled: bool


class HouseholdPreferencesOut(BaseModel):
    reminder_days_before_due: int
    default_split_rule: Literal["equal", "days_home"]
    routines_enabled: bool
    # False when the account has not saved preferences yet and these are the defaults.
    saved: bool
