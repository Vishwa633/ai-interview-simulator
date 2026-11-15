import http.client
import json
import os
import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter()
bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def auth_request(host, method, path, headers, body=None):
    connection = http.client.HTTPSConnection(host, timeout=8)
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        return response.status, response.read()
    except (OSError, http.client.HTTPException) as error:
        raise HTTPException(502, "The account service is unavailable.") from error
    finally:
        connection.close()


def supabase_host():
    url = os.environ.get("SUPABASE_URL", "").strip()
    project = re.fullmatch(r"https://([a-z0-9-]+\.supabase\.co)/?", url)
    return project.group(1) if project else None


def verify_user(host, key, token):
    code, body = auth_request(host, "GET", "/auth/v1/user", {
        "apikey": key,
        "Authorization": f"Bearer {token}",
    })
    if code in (400, 401, 403, 404):
        raise HTTPException(401, "Please log in again.")
    if code != 200:
        raise HTTPException(502, "The account service is unavailable.")

    try:
        return UUID(json.loads(body)["id"])
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(502, "The account service returned an invalid user.") from error


@router.delete("/api/account", status_code=204)
def delete_account(credentials: Credentials):
    if credentials is None:
        raise HTTPException(401, "Log in again before deleting your account.")

    host = supabase_host()
    secret = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not host or not secret.startswith("sb_secret_"):
        raise HTTPException(503, "Account deletion is not configured.")

    user_id = verify_user(host, secret, credentials.credentials)

    code, _ = auth_request(host, "DELETE", f"/auth/v1/admin/users/{user_id}", {
        "apikey": secret,
        "Content-Type": "application/json",
    }, body='{"should_soft_delete": false}')
    if not (200 <= code < 300 or code == 404):
        raise HTTPException(502, "Your account could not be deleted.")
    return Response(status_code=204)
