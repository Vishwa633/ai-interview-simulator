import os
import sqlite3
from contextlib import closing
from pathlib import Path

from fastapi import FastAPI, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

app = FastAPI()
DATABASE = Path(os.environ.get("FEEDBACK_DATABASE", Path(__file__).with_name("feedback.sqlite3")))

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

def connect():
    database = sqlite3.connect(DATABASE)
    database.row_factory = sqlite3.Row
    database.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment TEXT NOT NULL
        )
    """)
    return database

@app.get("/api/feedback", response_model=list[Review])
def list_feedback():
    with closing(connect()) as database:
        return [dict(row) for row in database.execute("SELECT id, name, rating, comment FROM feedback ORDER BY id DESC")]

@app.post("/api/feedback", response_model=Review, status_code=status.HTTP_201_CREATED)
def publish_feedback(feedback: FeedbackInput):
    with closing(connect()) as database, database:
        review = feedback.model_dump()
        review["name"] = review["name"] or "Anonymous"
        cursor = database.execute(
            "INSERT INTO feedback (name, rating, comment) VALUES (:name, :rating, :comment)",
            review,
        )
        return {**review, "id": cursor.lastrowid}
