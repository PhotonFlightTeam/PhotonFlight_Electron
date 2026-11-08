from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

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
    connection.execute(
        "INSERT INTO public.app_user (clerk_user_id, name, email) "
        "VALUES (%s, %s, %s) "
        "ON CONFLICT (clerk_user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email "
        "RETURNING user_id, name, email;",
        (clerk_user_id, payload.name, payload.email),
    ).fetchone()

    return {"clerk_user_id": clerk_user_id, "name": payload.name, "email": payload.email}



