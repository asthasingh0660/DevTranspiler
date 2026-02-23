"""
api/routes/execute.py

POST /api/v1/execute
    → receives code + language
    → maps language name to Judge0 language_id
    → submits to Judge0 CE (self-hosted)
    → polls until result is ready (max ~10s)
    → returns stdout, stderr, exit code, execution time

This powers the "Run" button in the frontend output panel.
Resume bullet: "sandboxed execution via Judge0, supporting 60+ languages"
"""

import asyncio
import base64
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import settings
from core.logger import logger

router = APIRouter()

# ── Judge0 language ID map ────────────────────────────────────────────────────
# Full list: GET http://localhost:2358/languages
LANGUAGE_IDS = {
    "JavaScript": 63,   # Node.js
    "TypeScript": 74,
    "Python":     71,   # Python 3
    "Java":       62,
    "C++":        54,
    "C#":         51,
    "Ruby":       72,
    "Go":         60,
    "PHP":        68,
    "Swift":      83,
    "Kotlin":     78,
}

# ── Schemas ───────────────────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    code: str
    language: str
    stdin: Optional[str] = ""     # optional stdin for the program


class ExecuteResponse(BaseModel):
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    compile_output: Optional[str] = None
    exit_code: Optional[int] = None
    time: Optional[str] = None     # execution time in seconds e.g. "0.042"
    memory: Optional[int] = None   # memory used in KB
    status: str                    # "Accepted" | "Runtime Error" | "Time Limit Exceeded" etc.
    status_id: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode(b64: Optional[str]) -> Optional[str]:
    """Judge0 returns output as base64."""
    if not b64:
        return None
    try:
        return base64.b64decode(b64).decode("utf-8", errors="replace")
    except Exception:
        return b64   # already plain text in some configs


async def _submit(client: httpx.AsyncClient, language_id: int, code: str, stdin: str) -> str:
    """Submit a job to Judge0 and return the token."""
    payload = {
        "source_code": base64.b64encode(code.encode()).decode(),
        "language_id": language_id,
        "stdin": base64.b64encode((stdin or "").encode()).decode(),
        "base64_encoded": True,
    }
    headers = {}
    if settings.JUDGE0_AUTH_TOKEN:
        headers["X-Auth-Token"] = settings.JUDGE0_AUTH_TOKEN

    resp = await client.post(
        f"{settings.JUDGE0_URL}/submissions?base64_encoded=true&wait=false",
        json=payload,
        headers=headers,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["token"]


async def _poll(client: httpx.AsyncClient, token: str, max_attempts: int = 20) -> dict:
    """Poll Judge0 until execution completes."""
    headers = {}
    if settings.JUDGE0_AUTH_TOKEN:
        headers["X-Auth-Token"] = settings.JUDGE0_AUTH_TOKEN

    for attempt in range(max_attempts):
        await asyncio.sleep(0.5)
        resp = await client.get(
            f"{settings.JUDGE0_URL}/submissions/{token}?base64_encoded=true",
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        status_id = data.get("status", {}).get("id", 0)

        # Status IDs 1 (In Queue) and 2 (Processing) mean not done yet
        if status_id not in (1, 2):
            return data

    raise TimeoutError("Judge0 did not respond in time.")


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post(
    "/execute",
    response_model=ExecuteResponse,
    summary="Run code in Judge0 sandboxed environment",
)
async def execute_code(body: ExecuteRequest):
    language_id = LANGUAGE_IDS.get(body.language)
    if language_id is None:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{body.language}' is not supported for execution. "
                   f"Supported: {', '.join(LANGUAGE_IDS.keys())}",
        )

    if not body.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty.")

    try:
        async with httpx.AsyncClient() as client:
            # 1. Submit
            token = await _submit(client, language_id, body.code, body.stdin or "")
            logger.info(f"Judge0 submission token: {token} ({body.language})")

            # 2. Poll for result
            result = await _poll(client, token)

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Judge0 execution service is not reachable. Is it running?",
        )
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Code execution timed out.")
    except Exception as exc:
        logger.error(f"Judge0 error: {exc}")
        raise HTTPException(status_code=500, detail=f"Execution error: {str(exc)}")

    status_info = result.get("status", {})

    return ExecuteResponse(
        stdout=_decode(result.get("stdout")),
        stderr=_decode(result.get("stderr")),
        compile_output=_decode(result.get("compile_output")),
        exit_code=result.get("exit_code"),
        time=result.get("time"),
        memory=result.get("memory"),
        status=status_info.get("description", "Unknown"),
        status_id=status_info.get("id", 0),
    )