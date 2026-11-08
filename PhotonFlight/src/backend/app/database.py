'''Connects to PostgreSQL'''
from typing import Annotated
import psycopg
from psycopg.rows import dict_row
from fastapi import Depends, HTTPException
from .config import Settings, get_settings


def get_connection(settings: Annotated[Settings, Depends(get_settings)]):
    if not settings.database_url:
        raise HTTPException(503, "DATABASE_URL is not configured.")
    # A connection belongs to one request. Successful work commits; failures roll back.
    # Explicit transactions in write routes commit before the response is returned.
    with psycopg.connect(settings.database_url.get_secret_value(),
                         row_factory=dict_row, connect_timeout=5,
                         options="-c statement_timeout=10000") as connection:
        yield connection
