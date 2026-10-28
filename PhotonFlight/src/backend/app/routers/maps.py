from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from psycopg import Connection
from psycopg.errors import ForeignKeyViolation
from ..auth import get_current_user_id
from ..database import get_connection
from ..schemas import MapCreate, MapRead

router = APIRouter(prefix="/api/maps", tags=["Maps"])
User = Annotated[int, Depends(get_current_user_id)]
Database = Annotated[Connection, Depends(get_connection)]
# Explicit columns keep the API independent of unrelated future schema changes.
COLUMNS = "map_id, name, description, created_by, created_at, location_name, latitude, longitude"


@router.get("", response_model=list[MapRead])
def list_maps(user_id: User, connection: Database,
              limit: Annotated[int, Query(ge=1, le=100)] = 50,
              offset: Annotated[int, Query(ge=0)] = 0):
    # Ownership filtering is enforced on the server, not trusted to the interface.
    return connection.execute(
        f"SELECT {COLUMNS} FROM public.maps WHERE created_by = %s "
        "ORDER BY map_id LIMIT %s OFFSET %s", (user_id, limit, offset)
    ).fetchall()


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: Annotated[int, Path(gt=0)], user_id: User, connection: Database):
    row = connection.execute(
        f"SELECT {COLUMNS} FROM public.maps WHERE map_id = %s AND created_by = %s",
        (map_id, user_id),
    ).fetchone()
    # Use the same response for nonexistent maps and maps owned by someone else.
    if row is None:
        raise HTTPException(404, "Map not found.")
    return row

#"/api/mappost"
@router.post("", response_model=MapRead, status_code=201)
def create_map(data: MapCreate, user_id: User, connection: Database):
    try:
        with connection.transaction():
            # Values are bound parameters, never pasted into SQL strings.
            row = connection.execute(
                "INSERT INTO public.maps "
                "(name, description, created_by, location_name, latitude, longitude) "
                f"VALUES (%s, %s, %s, %s, %s, %s) RETURNING {COLUMNS}",
                (data.name, data.description, user_id, data.location_name,
                 data.latitude, data.longitude),
            ).fetchone()
        return row
    except ForeignKeyViolation:
        raise HTTPException(409, "Configured user does not exist in the database.") from None
