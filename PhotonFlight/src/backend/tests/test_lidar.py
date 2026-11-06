from datetime import datetime, timezone
from unittest.mock import Mock

import psycopg
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import auth
from app.auth import get_current_user_email
from app.config import Settings, _clerk_domain_from_publishable_key, get_settings
from app.database import get_connection
from app.main import app

EMAIL = "pilot@example.com"
HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def api(monkeypatch):
    def forbid_real_connection(*args, **kwargs):
        pytest.fail("A test attempted to connect to a real connection.")

    monkeypatch.setattr(psycopg, "connect", forbid_real_connection)
    settings = Settings.model_construct(
        database_url=None, dev_api_token=None, dev_user_id=None,
        clerk_issuer=None, clerk_jwks_url=None,
    )
    connection = Mock()
    connection.execute.return_value.fetchall.return_value = []
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_connection] = lambda: connection
    app.dependency_overrides[get_current_user_email] = lambda: EMAIL
    try:
        with TestClient(app) as client:
            yield client, connection
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_list_lidar_files_filters_by_resolved_database_user(api):
    client, connection = api
    connection.execute.side_effect = [
        Mock(fetchall=Mock(return_value=[{"user_id": 8}])),
        Mock(fetchall=Mock(return_value=[{
            "lidar_id": 14,
            "file_location": "C:\\surveys\\site.laz",
            "file_format": "LAZ",
            "uploaded_at": datetime(2026, 10, 28, tzinfo=timezone.utc),
            "latitude": 36.1,
            "longitude": -97.0,
            "map_id": 4,
            "map_name": "Campus",
        }])),
    ]

    response = client.get("/api/lidar?limit=10&offset=20", headers=HEADERS)

    assert response.status_code == 200
    assert response.json()[0]["lidar_id"] == 14
    user_sql, user_params = connection.execute.call_args_list[0].args
    lidar_sql, lidar_params = connection.execute.call_args_list[1].args
    assert "lower(email) = lower(%s)" in user_sql
    assert user_params == (EMAIL,)
    assert "WHERE lidar.uploaded_by = %s" in lidar_sql
    assert lidar_params == (8, 10, 20)


def test_lidar_list_requires_a_matching_database_user(api):
    client, connection = api

    response = client.get("/api/lidar", headers=HEADERS)

    assert response.status_code == 404
    assert response.json() == {
        "detail": "No database user is associated with this Clerk email."
    }
    connection.execute.assert_called_once()


def test_lidar_list_rejects_ambiguous_email_mapping(api):
    client, connection = api
    connection.execute.return_value.fetchall.return_value = [
        {"user_id": 8}, {"user_id": 9},
    ]

    response = client.get("/api/lidar", headers=HEADERS)

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Clerk email matches multiple database users."
    }
    connection.execute.assert_called_once()


def test_database_errors_log_diagnostic_without_returning_it_to_client(api, caplog):
    client, connection = api
    connection.execute.side_effect = psycopg.ProgrammingError(
        'column "uploaded_by" does not exist'
    )

    response = client.get("/api/lidar", headers=HEADERS)

    assert response.status_code == 503
    assert response.json() == {"detail": "Database operation unavailable."}
    assert 'ProgrammingError: column "uploaded_by" does not exist' in caplog.text


@pytest.mark.parametrize("path", [
    "/api/lidar?limit=0", "/api/lidar?limit=101", "/api/lidar?offset=-1",
])
def test_invalid_lidar_pagination_does_not_query_database(api, path):
    client, connection = api

    assert client.get(path, headers=HEADERS).status_code == 422
    connection.execute.assert_not_called()


def test_clerk_auth_configuration_is_required():
    settings = Settings.model_construct(
        database_url=None, dev_api_token=None, dev_user_id=None,
        clerk_issuer=None, clerk_jwks_url=None,
    )

    with pytest.raises(HTTPException) as error:
        get_current_user_email(Mock(credentials="token"), settings)

    assert error.value.status_code == 503


def test_clerk_urls_are_derived_from_publishable_key():
    import base64

    encoded_domain = base64.urlsafe_b64encode(
        b"healthy-alien.clerk.accounts.dev$"
    ).decode("ascii").rstrip("=")
    settings = Settings(
        _env_file=None,
        VITE_CLERK_PUBLISHABLE_KEY=f"pk_test_{encoded_domain}",
    )

    assert settings.clerk_issuer == "https://healthy-alien.clerk.accounts.dev"
    assert settings.clerk_jwks_url == (
        "https://healthy-alien.clerk.accounts.dev/.well-known/jwks.json"
    )


def test_explicit_clerk_urls_override_publishable_key_defaults():
    import base64

    encoded_domain = base64.urlsafe_b64encode(
        b"healthy-alien.clerk.accounts.dev$"
    ).decode("ascii").rstrip("=")
    settings = Settings(
        _env_file=None,
        VITE_CLERK_PUBLISHABLE_KEY=f"pk_test_{encoded_domain}",
        CLERK_ISSUER="https://auth.example.com/",
        CLERK_JWKS_URL="https://keys.example.com/jwks.json",
    )

    assert settings.clerk_issuer == "https://auth.example.com"
    assert settings.clerk_jwks_url == "https://keys.example.com/jwks.json"


def test_clerk_token_requires_verified_email(monkeypatch):
    class FakeJWKClient:
        def __init__(self, url, timeout):
            assert url == "https://clerk.example/.well-known/jwks.json"
            assert timeout == 5

        def get_signing_key_from_jwt(self, token):
            assert token == "session-token"
            return Mock(key="verified-key")

    monkeypatch.setattr(auth, "PyJWKClient", FakeJWKClient)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *args, **kwargs: {
            "sub": "clerk-user",
            "email": EMAIL,
            "email_verified": True,
        },
    )
    settings = Settings.model_construct(
        database_url=None, dev_api_token=None, dev_user_id=None,
        clerk_issuer="https://clerk.example",
        clerk_jwks_url="https://clerk.example/.well-known/jwks.json",
    )

    assert get_current_user_email(Mock(credentials="session-token"), settings) == EMAIL


def test_clerk_token_rejects_unverified_email(monkeypatch):
    class FakeJWKClient:
        def __init__(self, url, timeout):
            pass

        def get_signing_key_from_jwt(self, token):
            return Mock(key="verified-key")

    monkeypatch.setattr(auth, "PyJWKClient", FakeJWKClient)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *args, **kwargs: {
            "sub": "clerk-user",
            "email": EMAIL,
            "email_verified": False,
        },
    )
    settings = Settings.model_construct(
        database_url=None, dev_api_token=None, dev_user_id=None,
        clerk_issuer="https://clerk.example",
        clerk_jwks_url="https://clerk.example/.well-known/jwks.json",
    )

    with pytest.raises(HTTPException) as error:
        get_current_user_email(Mock(credentials="session-token"), settings)

    assert error.value.status_code == 403
    assert "{{user.email_verified}}" in error.value.detail
