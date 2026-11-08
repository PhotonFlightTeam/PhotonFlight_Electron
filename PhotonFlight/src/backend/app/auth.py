from typing import Annotated
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from psycopg import Connection
from .config import Settings, get_settings
from .database import get_connection

bearer = HTTPBearer(auto_error=False)


def get_current_user_sub(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer)
    ],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if not settings.clerk_issuer or not settings.clerk_jwks_url:
        raise HTTPException(
            503,
            "Clerk JWT verification is not configured. Set "
            "VITE_CLERK_PUBLISHABLE_KEY in the PhotonFlight root .env, or set "
            "both CLERK_ISSUER and CLERK_JWKS_URL in the backend .env.",
        )
    if credentials is None:
        raise HTTPException(
            401,
            "Invalid or missing Clerk session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        signing_key = PyJWKClient(
            settings.clerk_jwks_url, timeout=5
        ).get_signing_key_from_jwt(credentials.credentials).key
        claims = jwt.decode(
            credentials.credentials,
            signing_key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["sub"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise HTTPException(
            401,
            "Invalid or expired Clerk session token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    clerk_user_id = claims.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id.strip():
        raise HTTPException(
            401,
            "Invalid or expired Clerk session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return clerk_user_id.strip()


def get_current_user_id(
    clerk_user_id: Annotated[str, Depends(get_current_user_sub)],
    connection: Annotated[Connection[dict[str, int]], Depends(get_connection)],
) -> int:
    user_rows = connection.execute(
        "SELECT user_id FROM public.app_user WHERE clerk_user_id = %s",
        (clerk_user_id,),
    ).fetchall()
    if len(user_rows) > 1:
        raise HTTPException(409, "Clerk ID matches multiple database users.")
    if not user_rows:
        raise HTTPException(
            404,
            "No database user is associated with this Clerk ID.",
        )
    return user_rows[0]["user_id"]


