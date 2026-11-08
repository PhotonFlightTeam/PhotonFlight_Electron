"""Picture metadata endpoints; access comes from the parent map."""

from ..schemas import PictureInput
from ..entity_routes import make_router

router = make_router(
    "pictures",
    "picture",
    "picture_id",
    PictureInput,
    None,
)