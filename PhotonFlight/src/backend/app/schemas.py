'''Defines acceptable data'''

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

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
    
