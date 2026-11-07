"""Drone endpoints with direct user ownership"""
from ..schemas import DroneInput
from ..entity_routes import make_router

router = make_router(
    "drones",
    "drone",
    "drone_id",
    DroneInput,
    "user_id",
)