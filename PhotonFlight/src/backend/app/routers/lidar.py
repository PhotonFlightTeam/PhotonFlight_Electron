"""LiDAR metadata and file endpoints; access comes from the parent map."""

import hashlib

from fastapi import Depends, File, Form, HTTPException, Path, Response, UploadFile
from psycopg import Connection

from ..auth import get_current_user_id
from ..database import get_connection
from ..entity_routes import make_router
from ..schemas import LidarInput

MAX_LIDAR_BYTES = 100 * 1024 * 1024
LIDAR_RESPONSE_COLUMNS = [
    "lidar_id",
    "map_id",
    "uploaded_by",
    "file_location",
    "file_format",
    "uploaded_at",
    "file_size_bytes",
    "sha256",
]

router = make_router(
    "lidar",
    "lidar_data",
    "lidar_id",
    LidarInput,
    None,  # Use map ownership rather than a direct ownership column.
    response_columns=LIDAR_RESPONSE_COLUMNS,
    filter_by_map=True,
)


@router.post("/upload", status_code=201)
async def upload_lidar(
    file: UploadFile = File(...),
    map_id: int = Form(gt=0),
    user: int = Depends(get_current_user_id),
    connection: Connection = Depends(get_connection),
):
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if not filename or extension not in {"las", "laz"} or len(filename) > 255:
        raise HTTPException(415, "LiDAR file must be a LAS or LAZ file.")

    owned_map = connection.execute(
        "SELECT map_id FROM public.maps "
        "WHERE map_id = %s AND created_by = %s FOR SHARE",
        (map_id, user),
    ).fetchone()

    if owned_map is None:
        raise HTTPException(404, "Map not found.")

    data = await file.read(MAX_LIDAR_BYTES + 1)
    if len(data) > MAX_LIDAR_BYTES:
        raise HTTPException(413, "LiDAR file is too large.")
    if len(data) < 4 or data[:4] != b"LASF":
        raise HTTPException(415, "File does not have a LAS/LAZ header.")

    file_format = extension.upper()
    content_type = (
        "application/vnd.las" if extension == "las"
        else "application/vnd.laszip"
    )
    sha256 = hashlib.sha256(data).hexdigest()

    return connection.execute(
        "INSERT INTO public.lidar_data "
        "(map_id, uploaded_by, file_size_bytes, file_data, file_location, "
        "sha256, file_format, content_type) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
        "RETURNING "
        "lidar_id, map_id, uploaded_by, file_location, file_format, "
        "uploaded_at, file_size_bytes, sha256",
        (
            map_id,
            user,
            len(data),
            data,
            filename,
            sha256,
            file_format,
            content_type,
        ),
    ).fetchone()


@router.get("/{lidar_id}/file")
def download_lidar(
    lidar_id: int = Path(gt=0),
    user: int = Depends(get_current_user_id),
    connection: Connection = Depends(get_connection),
):
    row = connection.execute(
        """
        SELECT file_data, content_type
        FROM public.lidar_data
        WHERE lidar_id = %s
          AND file_data IS NOT NULL
          AND file_size_bytes IS NOT NULL
          AND map_id IN (
              SELECT map_id FROM public.maps WHERE created_by = %s
          )
        """,
        (lidar_id, user),
    ).fetchone()

    if row is None:
        raise HTTPException(404, "Lidar file not found.")

    return Response(
        content=row["file_data"],
        media_type=row["content_type"] or "application/octet-stream",
    )