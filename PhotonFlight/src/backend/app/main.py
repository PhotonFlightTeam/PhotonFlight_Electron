'''This program is responsible for starting the API'''
import logging
import psycopg
from fastapi.responses import JSONResponse
from fastapi import FastAPI, Request
from .routers.maps import router

#start by creating the application for the backend
app = FastAPI(title="PhotonFlight Data API", version = "0.1.0")
#add the endpoints of map to the applicaiton
app.include_router(router)

@app.get("/health", tags=["Health"])
def health():
    #checks if backend is running
    return {"status": "ok"}

#database error handler 
@app.exception_handler(psycopg.Error)
def database_error(request: Request, error: psycopg.Error):
    logging.getLogger(__name__).error("Database operation failed: %s", type(error).__name__)
    return JSONResponse(status_code = 503, content={"detail": "Database operation unavailable."})
