from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from ..auth import get_current_user_id
from ..database import get_connection

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