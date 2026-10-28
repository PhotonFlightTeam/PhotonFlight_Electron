'''
Checks that a request has the correct development token and
returns the database user ID configured for testing.
'''
from secrets import compare_digest
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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