import base64
import binascii
from functools import lru_cache
from pathlib import Path
import re

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ENV = Path(__file__).resolve().parents[3] / ".env"
BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"


def _clerk_domain_from_publishable_key(key: str) -> str | None:
    parts = key.split("_", 2)
    if len(parts) != 3 or parts[:2] not in (["pk", "test"], ["pk", "live"]):
        return None

    encoded_domain = parts[2].rstrip("$")
    try:
        domain = base64.b64decode(
            encoded_domain + "=" * (-len(encoded_domain) % 4),
            altchars=b"-_",
            validate=True,
        ).decode("ascii").removesuffix("$").lower()
    except (binascii.Error, UnicodeDecodeError):
        return None

    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain):
        return None
    return domain


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(PROJECT_ENV), str(BACKEND_ENV)),
        extra="ignore",
    )
    database_url: SecretStr | None = None
    clerk_issuer: str | None = None
    clerk_jwks_url: str | None = None
    clerk_publishable_key: str | None = Field(
        default=None,
        validation_alias="VITE_CLERK_PUBLISHABLE_KEY",
    )

    @model_validator(mode="after")
    def configure_clerk_verification(self):
        issuer = self.clerk_issuer.rstrip("/") if self.clerk_issuer else None
        if not issuer and self.clerk_publishable_key:
            domain = _clerk_domain_from_publishable_key(self.clerk_publishable_key)
            if domain:
                issuer = f"https://{domain}"

        if issuer:
            self.clerk_issuer = issuer
            if not self.clerk_jwks_url:
                self.clerk_jwks_url = f"{issuer}/.well-known/jwks.json"
        return self

@lru_cache
def get_settings() -> Settings:
    return Settings()