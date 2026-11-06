'''
Checks that a request has the correct development token and
returns the database user ID configured for testing.
'''
from secrets import compare_digest
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from .config import Settings, get_settings

bearer = HTTPBearer(auto_error = False)

def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> int:
    # LOCAL DEVELOPMENT ONLY. This is not Clerk authentication.
    # Missing configuration disables data access instead of allowing anonymous use.
    token = settings.dev_api_token
    if not token or not token.get_secret_value() or not settings.dev_user_id:
        raise HTTPException(503, "Configure development authentication first.")
    if credentials is None or not compare_digest(
        credentials.credentials.encode(), token.get_secret_value().encode()
    ):
        raise HTTPException(401, "Invalid or missing bearer token.", headers = {"WWW-Authenticate": "Bearer"})
    return settings.dev_user_id


def get_current_user_email(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if not settings.clerk_issuer or not settings.clerk_jwks_url:
        raise HTTPException(
            503,
            "Clerk JWT verification is not configured. Set "
            "VITE_CLERK_PUBLISHABLE_KEY in the PhotonFlight root .env, or set "
            "both CLERK_ISSUER and CLERK_JWKS_URL in src/backend/.env.",
        )
    if credentials is None:
        raise HTTPException(401, "Invalid or missing bearer token.", headers = {"WWW-Authenticate": "Bearer"})

    try:
        signing_key = PyJWKClient(
            settings.clerk_jwks_url, timeout=5
        ).get_signing_key_from_jwt(credentials.credentials).key
        claims = jwt.decode(
            credentials.credentials,
            signing_key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["sub", "email", "email_verified"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise HTTPException(
            401, "Invalid or expired Clerk session token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    email = claims.get("email")
    email_verified = claims.get("email_verified")
    if (
        not isinstance(email, str)
        or not email.strip()
        or not (
            email_verified is True
            or isinstance(email_verified, str) and email_verified.lower() == "true"
        )
    ):
        raise HTTPException(
            403,
            "The Clerk JWT template must include a non-empty email claim and "
            "email_verified: true. Use {{user.primary_email_address}} and "
            "{{user.email_verified}} in the photonflight template, and verify "
            "the email address in Clerk.",
        )
    return email.strip()