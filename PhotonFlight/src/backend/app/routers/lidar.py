"""LiDAR metadata endpoints; access comes from the parent map."""

from ..schemas import LidarInput
from ..entity_routes import make_router

router = make_router(
    "lidar",
    "lidar_data",
    "lidar_id",
    LidarInput,
    None,  # Use map ownership rather than a direct ownership column.
)