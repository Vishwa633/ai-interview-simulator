import logging
import os
import sqlite3
from contextlib import asynccontextmanager, closing, contextmanager
from pathlib import Path
from typing import Annotated
from uuid import UUID

import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Path as PathParam, Response, status
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, ConfigDict, Field, field_validator

from account import Credentials, router as account_router, supabase_host, verify_user

load_dotenv(Path(__file__).with_name(".env"))
DATABASE = Path(os.environ.get("FEEDBACK_DATABASE", Path(__file__).with_name("feedback.sqlite3")))
DATABASE_URL = os.environ.get("DATABASE_URL")
logger = logging.getLogger(__name__)
feedback_pool = ConnectionPool(
    DATABASE_URL,
    kwargs={"row_factory": dict_row, "sslmode": "require", "connect_timeout": 7},
    min_size=1,
    max_size=4,
    timeout=12,
    check=ConnectionPool.check_connection,
    open=False,
) if DATABASE_URL else None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if feedback_pool is None:
        initialize_sqlite()
        yield
    else:
        with feedback_pool:
            yield


app = FastAPI(lifespan=lifespan)
app.include_router(account_router)

class FeedbackInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(default="", max_length=60)
    rating: int = Field(strict=True, ge=1, le=5)
    comment: str = Field(min_length=1, max_length=1000)

    @field_validator("name")
    @classmethod
    def reject_contact_details(cls, name: str) -> str:
        if "@" in name:
            raise ValueError("Use a display name, such as your first name.")
        return name

class Review(FeedbackInput):
    id: int
    can_edit: bool = False

@contextmanager
def connect_postgres():
    try:
        with feedback_pool.connection() as database:
            yield database
    except psycopg.OperationalError as error:
        logger.warning("Feedback database connection failed: %s", type(error).__name__)
        raise HTTPException(503, "Reviews are temporarily unavailable.") from error

def connect_sqlite():
    database = sqlite3.connect(DATABASE)
    database.row_factory = sqlite3.Row
    return database


def initialize_sqlite():
    with closing(connect_sqlite()) as database, database:
        database.execute("BEGIN IMMEDIATE")
        database.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                comment TEXT NOT NULL,
                author_id TEXT
            )
        """)
        if not any(row["name"] == "author_id" for row in database.execute("PRAGMA table_info(feedback)")):
            database.execute("ALTER TABLE feedback ADD COLUMN author_id TEXT")


def review_query(statement, parameters=()):
    # Statements are defined here; user input is always bound as parameters.
    if feedback_pool is not None:
        with connect_postgres() as database:
            query = statement.format(table="interviewloop.feedback").replace("?", "%s")
            return database.execute(query, parameters).fetchall()
    with closing(connect_sqlite()) as database, database:
        query = statement.format(table="feedback")
        bindings = tuple(str(value) if isinstance(value, UUID) else value for value in parameters)
        return database.execute(query, bindings).fetchall()


def viewer_id(credentials: Credentials):
    if credentials is None:
        return None
    host = supabase_host()
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
    if not host or not key.startswith("sb_publishable_"):
        raise HTTPException(503, "Review sign-in is not configured.")
    return verify_user(host, key, credentials.credentials)


def review_author(viewer: Annotated[UUID | None, Depends(viewer_id)]):
    if viewer is None:
        raise HTTPException(401, "Log in to manage reviews.")
    return viewer


Viewer = Annotated[UUID | None, Depends(viewer_id)]
Author = Annotated[UUID, Depends(review_author)]
ReviewId = Annotated[int, PathParam(ge=1, le=2**63 - 1)]


@app.get("/api/feedback", response_model=list[Review])
def list_feedback(response: Response, viewer: Viewer):
    response.headers["Cache-Control"] = "private, no-store"
    rows = review_query("""
        SELECT id, name, rating, comment, COALESCE(author_id = ?, FALSE) AS can_edit
        FROM {table} ORDER BY id DESC
    """, (viewer,))
    return [dict(row) for row in rows]


@app.get("/api/feedback/mine", response_model=list[int])
def my_feedback(response: Response, author: Author):
    response.headers["Cache-Control"] = "private, no-store"
    rows = review_query("SELECT id FROM {table} WHERE author_id = ?", (author,))
    return [row["id"] for row in rows]


@app.post("/api/feedback", response_model=Review, status_code=status.HTTP_201_CREATED)
def publish_feedback(feedback: FeedbackInput, author: Author):
    (row,) = review_query("""
        INSERT INTO {table} (name, rating, comment, author_id) VALUES (?, ?, ?, ?)
        RETURNING id, name, rating, comment
    """, (feedback.name or "Anonymous", feedback.rating, feedback.comment, author))
    return {**dict(row), "can_edit": True}


@app.patch("/api/feedback/{review_id}", response_model=Review)
def edit_feedback(review_id: ReviewId, feedback: FeedbackInput, author: Author):
    rows = review_query("""
        UPDATE {table} SET name = ?, rating = ?, comment = ?
        WHERE id = ? AND author_id = ?
        RETURNING id, name, rating, comment
    """, (feedback.name or "Anonymous", feedback.rating, feedback.comment, review_id, author))
    if not rows:
        raise HTTPException(404, "Review not found.")
    return {**dict(rows[0]), "can_edit": True}


@app.delete("/api/feedback/{review_id}", status_code=204)
def delete_feedback(review_id: ReviewId, author: Author):
    rows = review_query("""
        DELETE FROM {table} WHERE id = ? AND author_id = ? RETURNING id
    """, (review_id, author))
    if not rows:
        raise HTTPException(404, "Review not found.")
    return Response(status_code=204)
