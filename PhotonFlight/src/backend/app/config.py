from functools import lru_cache
from pydantic import PositiveInt, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file = ".env", extra = "ignore")
    database_url: SecretStr | None = None
    dev_api_token: SecretStr | None = None
    dev_user_id: PositiveInt | None = None

@lru_cache
def get_settings() -> Settings:
    return Settings()