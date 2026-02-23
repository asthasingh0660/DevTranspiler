"""
core/sanitize.py
Server-side sanitisation — mirrors the frontend sanitize.js but is the
authoritative check (never trust client-side only).
"""

import re
import hashlib
from typing import Tuple

# ── Constants ──────────────────────────────────────────────────────────────
MAX_INPUT_CHARS = 50_000      # ~1 250 lines of code
MAX_OUTPUT_CHARS = 200_000

# Patterns that suggest the LLM was jailbroken into producing shell commands
_DANGEROUS_SHELL = re.compile(
    r"(?:rm\s+-rf|sudo\b|mkfs\b|dd\s+if=|:\(\)\{:|forkbomb|"
    r"chmod\s+777|curl\s+.*\|\s*(?:sh|bash)|wget\s+.*\|\s*(?:sh|bash))",
    re.IGNORECASE,
)

# Fence patterns the LLM adds around code blocks
_FENCE_RE = re.compile(r"```[a-zA-Z0-9+\-._]*\n([\s\S]*?)```")


# ── Public helpers ─────────────────────────────────────────────────────────

def strip_fences(text: str) -> str:
    """Remove markdown code fences; return inner content."""
    matches = _FENCE_RE.findall(text)
    if matches:
        return "\n\n".join(m.strip() for m in matches)
    # Fallback: strip stray leading/trailing fences
    text = re.sub(r"^\s*```[^\n]*\n?", "", text)
    text = re.sub(r"```\s*$", "", text)
    return text.strip()


def has_dangerous_shell(text: str) -> bool:
    """Heuristic check — informational, not a security guarantee."""
    return bool(_DANGEROUS_SHELL.search(text))


def truncate_output(text: str, max_len: int = MAX_OUTPUT_CHARS) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "\n\n// ...truncated (output exceeded display limit)..."


def validate_input(code: str, source_lang: str, target_lang: str) -> Tuple[bool, str]:
    """
    Returns (is_valid, error_message).
    Call this before enqueuing a job.
    """
    if not code or not code.strip():
        return False, "Input code cannot be empty."

    if len(code) > MAX_INPUT_CHARS:
        return False, f"Input exceeds {MAX_INPUT_CHARS:,} character limit."

    if source_lang == target_lang:
        return False, "Source and target language must be different."

    return True, ""


def make_cache_key(source_lang: str, target_lang: str, code: str) -> str:
    """
    Deterministic SHA-256 cache key.
    Identical conversions hit cache regardless of whitespace normalisation.
    """
    normalised = " ".join(code.split())   # collapse whitespace
    raw = f"{source_lang}:{target_lang}:{normalised}"
    return "conv:" + hashlib.sha256(raw.encode()).hexdigest()