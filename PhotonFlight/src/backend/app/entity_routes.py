"""Shared CRUD behavior for the database entity routers."""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Path,
    Query,
    Response,
)
from psycopg import Connection, sql
from psycopg.errors import IntegrityError, RaiseException

from .auth import get_current_user_id
from .database import get_connection


def make_router(
    path,
    table,
    key,
    model,
    owner=None,
    response_columns=None,
    filter_by_map=False,
):
    router = APIRouter(
        prefix="/api/" + path,
        tags=[path.title()],
    )

    table_sql = sql.Identifier("public", table)
    key_sql = sql.Identifier(key)

    # Drones have direct ownership.
    # Other records inherit access from their parent map.
    if owner:
        guard = sql.SQL("{owner} = %s").format(
            owner=sql.Identifier(owner)
        )
    else:
        guard = sql.SQL(
            "map_id IN "
            "(SELECT map_id FROM public.maps WHERE created_by = %s)"
        )

    projection = (
        sql.SQL(", ").join(map(sql.Identifier, response_columns))
        if response_columns else sql.SQL("*")
    )

    def check_links(connection, data, user):
        if "map_id" not in data:
            return

        # Verify that the user can access the requested parent map.
        row = connection.execute(
            "SELECT map_id FROM public.maps "
            "WHERE map_id = %s AND created_by = %s FOR SHARE",
            (data["map_id"], user),
        ).fetchone()

        if row is None:
            raise HTTPException(404, "Map not found.")

        # An anomaly's related records must belong to the same map.
        links = [
            ("lidar_id", "lidar_data", "lidar_id"),
            (
                "verification_picture_id",
                "picture",
                "picture_id",
            ),
        ]

        for field, linked_table, linked_key in links:
            if data.get(field) is None:
                continue

            query = sql.SQL(
                "SELECT {key} FROM {table} "
                "WHERE {key} = %s AND map_id = %s FOR SHARE"
            ).format(
                key=sql.Identifier(linked_key),
                table=sql.Identifier("public", linked_table),
            )

            linked_row = connection.execute(
                query,
                (data[field], data["map_id"]),
            ).fetchone()

            if linked_row is None:
                raise HTTPException(
                    422,
                    "Referenced record must belong to the same map.",
                )

    @router.get("")
    def list_records(
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        map_id: int | None = Query(None, gt=0),
        user: int = Depends(get_current_user_id),
        connection: Connection = Depends(get_connection),
    ):
        where = guard
        params = [user]
        if filter_by_map and map_id is not None:
            where = sql.SQL("{} AND map_id = %s").format(guard)
            params.append(map_id)

        query = sql.SQL(
            "SELECT {projection} FROM {table} WHERE {where} "
            "ORDER BY {key} LIMIT %s OFFSET %s"
        ).format(
            table=table_sql,
            where=where,
            key=key_sql,
            projection=projection,
        )

        return connection.execute(
            query,
            (*params, limit, offset),
        ).fetchall()

    @router.get("/{record_id}")
    def get_record(
        record_id: int = Path(gt=0),
        user: int = Depends(get_current_user_id),
        connection: Connection = Depends(get_connection),
    ):
        query = sql.SQL(
            "SELECT {projection} FROM {table} "
            "WHERE {key} = %s AND {guard}"
        ).format(
            table=table_sql,
            key=key_sql,
            guard=guard,
            projection=projection,
        )

        row = connection.execute(
            query,
            (record_id, user),
        ).fetchone()

        if row is None:
            raise HTTPException(404, "Record not found.")

        return row

    def write(data, user, connection, record_id=None):
        try:
            with connection.transaction():
                # For updates, check access to the existing record first.
                if record_id is not None:
                    get_record(record_id, user, connection)

                if table == "maps":
                    if record_id is None:
                        query = (
                            "CALL public.create_map(%s, %s, %s, %s, %s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["name"],
                            data.get("description"),
                            data.get("location_name"),
                            data.get("latitude"),
                            data.get("longitude"),
                        )
                    else:
                        query = (
                            "CALL public.update_map(%s, %s, %s, %s, %s, "
                            "%s, %s, NULL)"
                        )
                        params = (
                            user,
                            record_id,
                            data["name"],
                            data.get("description"),
                            data.get("location_name"),
                            data.get("latitude"),
                            data.get("longitude"),
                        )

                elif table == "drone":
                    if record_id is None:
                        query = (
                            "CALL public.create_drone(%s, %s, %s, %s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["name"],
                            data.get("type"),
                            data.get("serial_number"),
                            data.get("status"),
                        )
                    else:
                        query = (
                            "CALL public.update_drone(%s, %s, %s, %s, %s, "
                            "%s, NULL)"
                        )
                        params = (
                            user,
                            record_id,
                            data["name"],
                            data.get("type"),
                            data.get("serial_number"),
                            data.get("status"),
                        )

                elif table == "picture":
                    if record_id is None:
                        query = (
                            "CALL public.create_picture(%s, %s, %s, %s, %s, "
                            "%s, NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            data["file_location"],
                            data.get("capture_time"),
                            data.get("width_px"),
                            data.get("height_px"),
                        )
                    else:
                        query = (
                            "CALL public.update_picture(%s, %s, %s, %s, %s, "
                            "%s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            record_id,
                            data["file_location"],
                            data.get("capture_time"),
                            data.get("width_px"),
                            data.get("height_px"),
                        )

                elif table == "lidar_data":
                    if record_id is None:
                        query = (
                            "CALL public.create_lidar(%s, %s, %s, %s, %s, %s, "
                            "NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            data.get("file_location"),
                            data.get("file_format"),
                            data.get("latitude"),
                            data.get("longitude"),
                        )
                    else:
                        query = (
                            "CALL public.update_lidar(%s, %s, %s, %s, %s, "
                            "%s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            record_id,
                            data.get("file_location"),
                            data.get("file_format"),
                            data.get("latitude"),
                            data.get("longitude"),
                        )

                elif table == "anomalies":
                    if record_id is None:
                        query = (
                            "CALL public.create_anomaly_full(%s, %s, %s, %s, "
                            "%s, %s, %s, %s, %s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            data["anomaly_type"],
                            data.get("description"),
                            data.get("lidar_id"),
                            data.get("latitude"),
                            data.get("longitude"),
                            data.get("status", "suspected"),
                            data.get("verification_status", "pending"),
                            data.get("verification_picture_id"),
                        )
                    else:
                        query = (
                            "CALL public.update_anomaly_full(%s, %s, %s, %s, "
                            "%s, %s, %s, %s, %s, %s, %s, NULL)"
                        )
                        params = (
                            user,
                            data["map_id"],
                            record_id,
                            data["anomaly_type"],
                            data.get("description"),
                            data.get("lidar_id"),
                            data.get("latitude"),
                            data.get("longitude"),
                            data.get("status", "suspected"),
                            data.get("verification_status", "pending"),
                            data.get("verification_picture_id"),
                        )

                else:
                    raise RuntimeError(
                        "No write procedure is configured for this entity."
                    )

                row = connection.execute(query, params).fetchone()
                if row is None:
                    raise HTTPException(404, "Record not found.")
                if "p_row" in row:
                    row = row["p_row"]
                elif "p_anomaly_id" in row:
                    row = {"anomaly_id": row["p_anomaly_id"]}

            return row

        except IntegrityError:
            raise HTTPException(
                409,
                "Record conflicts with database constraints.",
            ) from None
        except RaiseException as error:
            if error.sqlstate == "P0002":
                raise HTTPException(404, "Record not found.") from None
            if error.sqlstate == "22023":
                raise HTTPException(422, str(error).split("CONTEXT:")[0].strip()) from None

    def create_record(
        data,
        user: int = Depends(get_current_user_id),
        connection: Connection = Depends(get_connection),
    ):
        return write(data.model_dump(), user, connection)

    # Supply the specific input model before FastAPI registers the route.
    create_record.__annotations__["data"] = model

    router.add_api_route(
        "",
        create_record,
        methods=["POST"],
        status_code=201,
    )

    def replace_record(
        data,
        record_id: int = Path(gt=0),
        user: int = Depends(get_current_user_id),
        connection: Connection = Depends(get_connection),
    ):
        return write(
            data.model_dump(),
            user,
            connection,
            record_id,
        )

    replace_record.__annotations__["data"] = model

    router.add_api_route(
        "/{record_id}",
        replace_record,
        methods=["PUT"],
    )

    @router.delete("/{record_id}", status_code=204)
    def delete_record(
        record_id: int = Path(gt=0),
        user: int = Depends(get_current_user_id),
        connection: Connection = Depends(get_connection),
    ):
        try:
            with connection.transaction():
                procedure = {
                    "maps": "delete_map",
                    "drone": "delete_drone",
                    "picture": "delete_picture",
                    "lidar_data": "delete_lidar",
                    "anomalies": "delete_anomaly",
                }.get(table)

                if procedure is None:
                    raise RuntimeError(
                        "No delete procedure is configured for this entity."
                    )

                if table in ("picture", "lidar_data", "anomalies"):
                    if table == "lidar_data":
                        record = get_record(record_id, user, connection)
                        map_id = record["map_id"]
                    elif table == "picture":
                        record = get_record(record_id, user, connection)
                        map_id = record["map_id"]
                    else:
                        record = get_record(record_id, user, connection)
                        map_id = record["map_id"]
                    params = (user, map_id, record_id)
                else:
                    params = (user, record_id)

                query = (
                    f"CALL public.{procedure}("
                    + ", ".join("%s" for _ in params)
                    + ")"
                )
                connection.execute(query, params)

            # A successful deletion returns no response body.
            return Response(status_code=204)

        except IntegrityError:
            raise HTTPException(
                409,
                "Remove dependent records before deleting this record.",
            ) from None
        except RaiseException as error:
            if error.sqlstate == "P0002":
                raise HTTPException(404, "Record not found.") from None

    return router