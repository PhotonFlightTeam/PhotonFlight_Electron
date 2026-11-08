"""Map endpoints with owner determined by the authenticated user."""

from ..schemas import MapCreate
from ..entity_routes import make_router

# Generate list, retrieve, create, replace, and delete endpoints.
router = make_router(
    "maps",        # API prefix: /api/maps
    "maps",        # Database table
    "map_id",      # Primary key
    MapCreate,     # Validates create and replace requests
    "created_by",  # Ownership column, assigned by the backend
)