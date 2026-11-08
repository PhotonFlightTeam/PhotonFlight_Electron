"""Anomaly endpoints, including verification information."""

from ..schemas import AnomalyInput
from ..entity_routes import make_router

router = make_router(
    "anomalies",
    "anomalies",
    "anomaly_id",
    AnomalyInput,
    None,
)