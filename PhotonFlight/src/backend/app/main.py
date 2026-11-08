'''This program is responsible for starting the API'''
import logging
import psycopg
from fastapi.responses import JSONResponse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routers import anomalies, drones, lidar, maps, pictures, users


#start by creating the application for the backend
app = FastAPI(title="PhotonFlight Data API", version = "0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "photonflight://renderer",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization"],
)


@app.get("/health", tags=["Health"])
def health():
    #checks if backend is running
    return {"status": "ok"}

#database error handler 
@app.exception_handler(psycopg.Error)
def database_error(request: Request, error: psycopg.Error):
    logging.getLogger(__name__).error("Database operation failed: %s", type(error).__name__)
    return JSONResponse(status_code = 503, content={"detail": "Database operation unavailable."})

# Make the new endpoints available in the application.
for entity in (maps, drones, lidar, pictures, anomalies, users):
    app.include_router(entity.router)
