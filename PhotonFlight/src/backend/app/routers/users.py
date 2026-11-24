from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from psycopg.errors import RaiseException

from ..auth import get_current_user_id, get_current_user_sub
from ..database import get_connection
from ..schemas import UserCreate

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me") #define endpoint
def me(
    user: int = Depends(get_current_user_id),
    connection: Connection = Depends(get_connection),
):
    # Select safe profile fields explicitly; never return password_hash.
    row = connection.execute(
        "SELECT user_id, name, email "
        "FROM public.app_user WHERE user_id = %s",
        (user,),
    ).fetchone()

    if row is None:
        raise HTTPException(404, "User not found.")

    return row

@router.post("/me")
def create_user(
    payload: UserCreate,
    clerk_user_id: str = Depends(get_current_user_sub),
    connection: Connection = Depends(get_connection),
):
    try:
        with connection.transaction():
            row = connection.execute(
                "CALL public.create_or_update_user(%s, %s, %s, NULL)",
                (clerk_user_id, payload.name, payload.email),
            ).fetchone()
    except RaiseException as error:
        if error.sqlstate == "22023":
            raise HTTPException(
                422,
                str(error).split("CONTEXT:")[0].strip(),
            ) from None
        raise

    if row is not None and "p_row" in row:
        row = row["p_row"]

    return {"clerk_user_id": clerk_user_id, "name": payload.name, "email": payload.email}



