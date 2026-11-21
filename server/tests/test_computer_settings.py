import asyncio

import httpx
import pytest

from botteam.main import create_app


@pytest.fixture
async def computer_api(tmp_path, monkeypatch):
    for name in ("E2B_API_KEY", "E2B_API_URL", "E2B_SANDBOX_URL", "E2B_DOMAIN", "BOTTEAM_COMPUTER_TEMPLATE", "BOTTEAM_COMPUTER_IDLE_S"):
        monkeypatch.delenv(name, raising=False)
    app = create_app(str(tmp_path / "test.db"), home=tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client, app.state.computer_settings


async def test_embed_probe_uses_key_and_keeps_it_private(computer_api):
    client, settings = computer_api
    path = "/api/computer/host"
    key = "e2b_fake_embed_key"

    def provider(request):
        assert request.url == "http://e2b.test:3000/v2/templates"
        assert request.headers["X-API-Key"] == key
        return httpx.Response(200, json=[{"names": ["sandbox-team/desktop"], "buildStatus": "ready"}])

    settings.transport = httpx.MockTransport(provider)
    saved = await client.put(path, json={"source": "embed", "apiUrl": "http://e2b.test:3000", "apiKey": key})
    assert saved.status_code == 200
    assert saved.json()["sandboxUrl"] == "http://e2b.test:3002"
    assert saved.json()["status"] == "unchecked"
    response = await client.post(path + "/test")
    assert response.json()["status"] == "ready"
    assert response.json()["keySet"]
    fetched = await client.get(path)
    for result in (saved, response, fetched):
        assert result.json()["keyHint"] == "e2b…_key"
        assert key not in result.text

    rejected = await client.put(path, json={"apiKey": key * 100, "idleSeconds": 0})
    assert rejected.status_code == 422
    assert key not in rejected.text

    changed = await client.put(path, json={"apiUrl": "http://other.test:3000"})
    assert changed.json()["status"] == "unchecked"
    assert not changed.json()["keySet"]
    assert changed.json()["keyHint"] is None
    assert (await client.post(path + "/test")).json()["status"] == "unauthorized"


@pytest.mark.parametrize(("status", "rows", "expected"), [
    (403, [], "unauthorized"),
    (200, [{"aliases": ["desktop"], "buildStatus": "building"}], "no_template"),
    (200, [{"aliases": ["base"], "buildStatus": "ready"}], "no_template"),
    (500, [], "unreachable"),
])
async def test_embed_connection_failures(computer_api, status, rows, expected):
    client, settings = computer_api
    settings.transport = httpx.MockTransport(lambda _: httpx.Response(status, json=rows))
    await client.put("/api/computer/host", json={"source": "embed", "apiUrl": "http://e2b.test", "apiKey": "fake"})
    assert (await client.post("/api/computer/host/test")).json()["status"] == expected


async def test_cloud_finds_builtin_desktop_and_ignores_stale_test(computer_api):
    client, settings = computer_api
    started, proceed = asyncio.Event(), asyncio.Event()

    async def provider(request):
        assert request.url.host == "api.e2b.dev"
        if request.url.path == "/v2/templates":
            return httpx.Response(200, json=[])
        assert request.url.path == "/templates/aliases/desktop"
        started.set()
        await proceed.wait()
        return httpx.Response(403)

    settings.transport = httpx.MockTransport(provider)
    path = "/api/computer/host"
    await client.put(path, json={"apiKey": "first"})
    check = asyncio.create_task(client.post(path + "/test"))
    await asyncio.wait_for(started.wait(), 2)
    await client.put(path, json={"apiKey": "second"})
    proceed.set()
    assert (await check).json()["status"] == "unchecked"
    assert (await client.post(path + "/test")).json()["status"] == "ready"
