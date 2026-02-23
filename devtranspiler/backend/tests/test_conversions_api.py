"""
tests/test_conversions_api.py
Integration tests for POST /convert and GET /convert/{id}/status.
Mocks Redis and DB so tests run without real external services.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.fixture
def mock_cache_miss():
    with patch("api.routes.conversions.cache.get", new_callable=AsyncMock) as m:
        m.return_value = None
        yield m


@pytest.fixture
def mock_cache_hit():
    with patch("api.routes.conversions.cache.get", new_callable=AsyncMock) as m:
        m.return_value = "print('Hello World!')"
        yield m


@pytest.fixture
def mock_enqueue():
    with patch("api.routes.conversions.job_queue.enqueue", new_callable=AsyncMock) as m:
        m.return_value = "test-job-id"
        yield m


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


class TestSubmitConversion:
    @pytest.mark.asyncio
    async def test_cache_miss_returns_202(
        self, client, mock_cache_miss, mock_enqueue
    ):
        with patch("api.routes.conversions.repo.create", new_callable=AsyncMock):
            response = await client.post("/api/v1/convert", json={
                "source_lang": "JavaScript",
                "target_lang": "Python",
                "input_code": "console.log('hello');",
            })
        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "queued"
        assert data["cache_hit"] is False
        assert "job_id" in data

    @pytest.mark.asyncio
    async def test_cache_hit_returns_output_immediately(
        self, client, mock_cache_hit
    ):
        with patch("api.routes.conversions.repo.create", new_callable=AsyncMock):
            response = await client.post("/api/v1/convert", json={
                "source_lang": "JavaScript",
                "target_lang": "Python",
                "input_code": "console.log('hello');",
            })
        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "done"
        assert data["cache_hit"] is True
        assert data["output_code"] == "print('Hello World!')"

    @pytest.mark.asyncio
    async def test_empty_code_rejected(self, client):
        response = await client.post("/api/v1/convert", json={
            "source_lang": "JavaScript",
            "target_lang": "Python",
            "input_code": "   ",
        })
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_same_language_rejected(self, client):
        response = await client.post("/api/v1/convert", json={
            "source_lang": "Python",
            "target_lang": "Python",
            "input_code": "print('hi')",
        })
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unsupported_language_rejected(self, client):
        response = await client.post("/api/v1/convert", json={
            "source_lang": "COBOL",
            "target_lang": "Python",
            "input_code": "DISPLAY 'HI'",
        })
        assert response.status_code == 422