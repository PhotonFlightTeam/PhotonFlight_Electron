from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from ..auth import get_current_user_email
from ..database import get_connection
from ..schemas import LidarRead

router = APIRouter(prefix="/api/lidar", tags=["Lidar"])
UserEmail = Annotated[str, Depends(get_current_user_email)]
Database = Annotated[Connection, Depends(get_connection)]


@router.get("", response_model=list[LidarRead])
def list_lidar_files(
    user_email: UserEmail,
    connection: Database,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    user_rows = connection.execute(
        "SELECT user_id FROM public.app_user WHERE lower(email) = lower(%s)",
        (user_email,),
    ).fetchall()
    if len(user_rows) > 1:
        raise HTTPException(409, "Clerk email matches multiple database users.")
    if not user_rows:
        raise HTTPException(404, "No database user is associated with this Clerk email.")

    user_id = user_rows[0]["user_id"]
    return connection.execute(
        "SELECT lidar.lidar_id, lidar.file_location, lidar.file_format, "
        "lidar.uploaded_at, lidar.latitude, lidar.longitude, lidar.map_id, "
        "maps.name AS map_name "
        "FROM public.lidar_data AS lidar "
        "LEFT JOIN public.maps AS maps ON maps.map_id = lidar.map_id "
        "WHERE lidar.uploaded_by = %s "
        "ORDER BY lidar.uploaded_at DESC, lidar.lidar_id DESC "
        "LIMIT %s OFFSET %s",
        (user_id, limit, offset),
    ).fetchall()