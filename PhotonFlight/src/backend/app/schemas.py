"""Validate incoming data; ownership is assigned by the server."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Input(BaseModel):
    # Reject unexpected fields, trim strings, and reject infinite numbers.
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
    )


class DroneInput(Input):
    name: str = Field(min_length=1, max_length=150)
    type: str | None = Field(None, max_length=100)
    serial_number: str | None = Field(None, max_length=150)
    status: str | None = Field(None, max_length=50)


class LidarInput(Input):
    map_id: int = Field(gt=0)
    file_location: str | None = None
    file_format: str | None = Field(None, max_length=50)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class PictureInput(Input):
    map_id: int = Field(gt=0)
    file_location: str = Field(min_length=1)
    capture_time: datetime | None = None
    width_px: int | None = Field(None, gt=0)
    height_px: int | None = Field(None, gt=0)


class AnomalyInput(Input):
    map_id: int = Field(gt=0)
    lidar_id: int | None = Field(None, gt=0)
    anomaly_type: str = Field(min_length=1, max_length=100)
    description: str | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    status: str = Field("suspected", max_length=50)

    # Match the allowed values in the database constraint.
    verification_status: Literal[
        "pending", "confirmed", "rejected"
    ] = "pending"

    verification_picture_id: int | None = Field(None, gt=0)

class MapCreate(BaseModel):
    #reject unknown fields
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    location_name: str | None = None
    latitude: float | None = Field(default=None, ge= -90, le=90)
    longitude: float | None = Field(default= None, ge=-180, le = 180)

class MapRead(MapCreate):
    map_id: int
    created_by: int | None
    created_at: datetime

class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=1, max_length=150)
    
