import base64
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from git.PhotonFlight.src.backend.app import auth
from git.PhotonFlight.src.backend.app.auth import get_current_user_id
from git.PhotonFlight.src.backend.app.config import Settings, _clerk_domain_from_publishable_key, get_settings
from git.PhotonFlight.src.backend.app.database import get_connection
from git.PhotonFlight.src.backend.app.main import app

TOKEN = "clerk-session-token"
EMAIL = "pilot@example.com"
USER_ID = 8
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def api(monkeypatch):
    settings = Settings.model_construct(
        database_url=None,
        clerk_issuer="https://clerk.example",
        clerk_jwks_url="https://clerk.example/.well-known/jwks.json",
    )
    claims = {
        "sub": "clerk-user",
        "email": EMAIL,
        "email_verified": True,
    }

    class FakeJWKClient:
        def __init__(self, url, timeout):
            assert url == settings.clerk_jwks_url
            assert timeout == 5

        def get_signing_key_from_jwt(self, token):
            if token != TOKEN:
                raise auth.jwt.InvalidTokenError()
            return Mock(key="verified-key")

    def decode(token, key, algorithms, issuer, options):
        assert token == TOKEN
        assert key == "verified-key"
        assert algorithms == ["RS256"]
        assert issuer == settings.clerk_issuer
        assert options == {"require": ["sub", "email", "email_verified"]}
        return dict(claims)

    monkeypatch.setattr(auth, "PyJWKClient", FakeJWKClient)
    monkeypatch.setattr(auth.jwt, "decode", decode)

    connection = Mock()
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_connection] = lambda: connection
    app.dependency_overrides.pop(get_current_user_id, None)
    try:
        with TestClient(app) as client:
            yield client, connection, settings, claims
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer invalid-token"}],
)
def test_missing_or_invalid_clerk_token_is_rejected(api, headers):
    client, connection, _, _ = api
    response = client.get("/api/maps", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    connection.execute.assert_not_called()


def test_clerk_verification_requires_configuration(api):
    client, connection, settings, _ = api
    settings.clerk_issuer = None
    settings.clerk_jwks_url = None

    response = client.get("/api/maps", headers=HEADERS)

    assert response.status_code == 503
    assert "Clerk JWT verification is not configured" in response.json()["detail"]
    connection.execute.assert_not_called()


def test_verified_clerk_email_maps_to_database_user_id(api):
    client, connection, _, _ = api
    user_lookup = Mock()
    user_lookup.fetchall.return_value = [{"user_id": USER_ID}]
    maps_lookup = Mock()
    maps_lookup.fetchall.return_value = []
    connection.execute.side_effect = [user_lookup, maps_lookup]

    response = client.get("/api/maps", headers=HEADERS)

    assert response.status_code == 200
    assert response.json() == []
    email_sql, email_params = connection.execute.call_args_list[0].args
    maps_sql, maps_params = connection.execute.call_args_list[1].args
    assert "lower(email) = lower(%s)" in email_sql
    assert email_params == (EMAIL,)
    assert "created_by" in str(maps_sql)
    assert maps_params == (USER_ID, 50, 0)


@pytest.mark.parametrize(
    "user_rows,status_code,detail",
    [
        ([], 404, "No database user is associated with this Clerk email."),
        (
            [{"user_id": 8}, {"user_id": 9}],
            409,
            "Clerk email matches multiple database users.",
        ),
    ],
)
def test_clerk_email_must_resolve_to_one_database_user(
    api, user_rows, status_code, detail
):
    client, connection, _, _ = api
    connection.execute.return_value.fetchall.return_value = user_rows

    response = client.get("/api/maps", headers=HEADERS)

    assert response.status_code == status_code
    assert response.json() == {"detail": detail}
    connection.execute.assert_called_once()


def test_unverified_clerk_email_is_rejected_before_database_lookup(api):
    client, connection, _, claims = api
    claims["email_verified"] = False

    response = client.get("/api/maps", headers=HEADERS)

    assert response.status_code == 403
    assert "email_verified: true" in response.json()["detail"]
    connection.execute.assert_not_called()


def test_publishable_key_derives_clerk_urls():
    encoded_domain = base64.urlsafe_b64encode(
        b"healthy-alien.clerk.accounts.dev$"
    ).decode("ascii").rstrip("=")
    settings = Settings.model_construct(
        database_url=None,
        clerk_issuer=None,
        clerk_jwks_url=None,
        clerk_publishable_key=f"pk_test_{encoded_domain}",
    )
    settings.configure_clerk_verification()

    assert settings.clerk_issuer == "https://healthy-alien.clerk.accounts.dev"
    assert settings.clerk_jwks_url == (
        "https://healthy-alien.clerk.accounts.dev/.well-known/jwks.json"
    )


def test_invalid_publishable_key_domain_is_rejected():
    assert _clerk_domain_from_publishable_key("pk_test_not-base64!") is None


def test_cors_allows_electron_renderer_and_authenticated_crud():
    with TestClient(app) as client:
        response = client.options(
            "/api/maps",
            headers={
                "Origin": "photonflight://renderer",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "photonflight://renderer"
    )
    assert "POST" in response.headers["access-control-allow-methods"]
