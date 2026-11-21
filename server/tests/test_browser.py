import asyncio
import re
import shutil
import sys
from urllib.parse import urlsplit

import pytest
from playwright.async_api import Error as PlaywrightError

from botteam.browser_host import BrowserHost
from botteam.browser_mcp import compose_page
from botteam.bus import Bus
from botteam.drivers.base import SendTurnInput
from botteam.mcp_client import connect
from botteam.mcp_proxy import composio_publishes
from botteam.turns import ThreadRun

from .test_api import ctx  # noqa: F401


@pytest.fixture
async def site():
    async def serve(reader, writer):
        try:
            await reader.readuntil(b"\r\n\r\n")
            body = b'<title>Test Page</title><button onclick="this.textContent=\'Clicked\'">Approve test</button>'
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\nContent-Length: "
                         + str(len(body)).encode() + b"\r\n\r\n" + body)
            await writer.drain()
        except (OSError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    async with server:
        yield f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/"


async def test_host_keeps_sign_ins_and_closes_processes(tmp_path, site):
    host = BrowserHost(tmp_path, Bus(), allow_local=True)
    if not (await host.availability())["available"]:
        await host.shutdown()
        pytest.skip("No supported Chromium browser is installed")
    try:
        profile = await host.wake("agent")
        assert host.endpoints["agent"].startswith("http://127.0.0.1:")
        assert "endpoint" not in host.state("agent")
        assert not await host.person_input("agent", {"type": "goto", "url": site})
        await host.set_control("agent", "person")
        assert await host.person_input("agent", {"type": "goto", "url": site})
        await profile.context.add_cookies([{"name": "session", "value": "test", "url": site, "expires": 2_000_000_000}])
        image, url, title = await host.screenshot("agent")
        assert image.startswith(b"\xff\xd8") and url == site and title == "Test Page"
        async def first_frame():
            async for event in host.bus.subscribe():
                if event.get("kind") == "screen":
                    return event

        frame = asyncio.create_task(first_frame())
        await host.watch("agent", True)
        assert (await asyncio.wait_for(frame, 5))["image"]
        await host.watch("agent", False)
        process = host.processes["agent"]
        await host.sleep("agent")
        assert process.returncode is not None
        assert not host.state("agent")["running"]
        restarted = await host.wake("agent")
        assert (await restarted.context.cookies([site]))[0]["value"] == "test"
        await host.clear_profile("agent")
        assert not (tmp_path / "browser" / "agent").exists()
        host.allow_local = False
        anonymous = await host.wake("blocked")
        with pytest.raises(PlaywrightError, match="ERR_SOCKS_CONNECTION_FAILED"):
            await anonymous.page.goto(site, timeout=5000)

        async def redirect(route):
            await route.fulfill(status=302, headers={"Location": site})

        await anonymous.context.route("https://redirect.example/", redirect)
        with pytest.raises(PlaywrightError, match="ERR_SOCKS_CONNECTION_FAILED"):
            await anonymous.page.goto("https://redirect.example/", timeout=5000)
    finally:
        await host.shutdown()


async def test_campaign_settings_defaults_and_preserves_custom_instructions(ctx):
    client, app = ctx
    campaign = (await client.post("/api/social/campaigns", json={"name": "Browser test"})).json()
    for bot_id in campaign["bots"].values():
        assert (await app.state.turns.browser_settings(bot_id))["postVia"] == "composio"
    path = f"/api/social/campaigns/{campaign['id']}/browser-settings?role=research"
    assert (await client.put(path, json={"postVia": "web"})).json()["settings"]["postVia"] == "web"
    researcher = await app.state.store.get_bot(campaign["bots"]["research"])
    assert "Publish through your browser" in researcher.soul
    researcher.soul += "\nMy custom instruction"
    await app.state.store.save_bot(researcher)
    assert (await client.put(path, json={"postVia": "composio"})).status_code == 200
    assert (await app.state.store.get_bot(researcher.id)).soul == researcher.soul


async def test_mcp_lazy_profile_approval_and_human_control(ctx, site):
    client, app = ctx
    if not shutil.which("npx") or not (await app.state.browser.availability())["available"]:
        pytest.skip("Requires npx and a supported Chromium browser")
    campaign = (await client.post("/api/social/campaigns", json={"name": "Browser test"})).json()
    path = f"/api/social/campaigns/{campaign['id']}/browser-settings?role=research"
    await client.put(path, json={"allowLocal": True})
    bot_id = campaign["bots"]["research"]
    bot = await app.state.store.get_bot(bot_id)
    thread_id = bot.threadId
    turns = app.state.turns
    turns.runs[thread_id] = ThreadRun(
        bot_id=bot_id, inp=SendTurnInput(thread_id=thread_id, bot_id=bot_id, text="", cwd=bot.cwd),
        turn_id="browser-test", level="ask",
    )
    entry = app.state.mcp.browser_entry(thread_id, app.state.broker)
    conn = connect({"transport": "stdio", **entry})
    try:
        await conn.open()
        await conn.initialize()
        assert "browser_snapshot" in {tool["name"] for tool in await conn.tools()}
        assert not app.state.browser.state(bot_id)["running"]
        compose = await conn.call("browser_navigate", {"url": "https://x.com/compose/post"})
        assert compose["isError"] and "Composio" in compose["content"][0]["text"]
        loaded = await conn.call("browser_navigate", {"url": site})
        assert not loaded.get("isError"), loaded
        snapshot = await conn.call("browser_snapshot")
        assert "Untrusted webpage content" in snapshot["content"][0]["text"]
        snapshot_text = "\n".join(item.get("text", "") for item in snapshot["content"])
        reference = re.search(r'button "Approve test" \[ref=(\w+)\]', snapshot_text)
        assert reference, snapshot_text
        click_args = {"element": "Approve test", "target": reference.group(1)}
        action = asyncio.create_task(conn.call("browser_click", click_args))
        for _ in range(200):
            requests = app.state.broker.open_for(thread_id)
            if requests:
                break
            await asyncio.sleep(0.02)
        assert requests and requests[0]["tool"] == "BrowserAction"
        await app.state.broker.resolve(requests[0]["id"], "deny", "no", source="user")
        assert (await action)["isError"]
        action = asyncio.create_task(conn.call("browser_click", click_args))
        for _ in range(200):
            requests = app.state.broker.open_for(thread_id)
            if requests:
                break
            await asyncio.sleep(0.02)
        assert requests
        approved = await client.post(f"/api/bots/{bot_id}/browser/approval", json={"id": requests[0]["id"], "behavior": "allow"})
        assert approved.status_code == 200
        clicked = await action
        assert not clicked.get("isError"), clicked
        assert (await app.state.browser.browsers[bot_id].page.get_by_role("button").inner_text()) == "Clicked"
        help_request = asyncio.create_task(app.state.agents.call(thread_id, "browser_request_help", {"reason": "Sign in"}))
        for _ in range(100):
            if app.state.browser.state(bot_id)["held"]:
                break
            await asyncio.sleep(0.02)
        refused = await conn.call("browser_snapshot")
        assert refused["isError"] and "controlling" in refused["content"][0]["text"]
        assert (await client.get(f"/api/bots/{bot_id}/browser")).json()["helpReason"] == "Sign in"
        await client.post(f"/api/bots/{bot_id}/browser/control", json={"holder": "bot"})
        assert (await asyncio.wait_for(help_request, 5))["ok"]
        assert not (await conn.call("browser_snapshot")).get("isError")
        await client.put(path, json={"allowLocal": True, "postVia": "web"})
        decision = await app.state.broker.browser_call(thread_id, "composio/publish", {})
        assert not decision["allowed"]
    finally:
        await conn.close()
        turns.runs.pop(thread_id, None)
        await app.state.browser.sleep(bot_id)


def test_publishing_policy_distinguishes_reading_from_publishing():
    assert compose_page(urlsplit("https://x.com/compose/post"))
    assert not compose_page(urlsplit("https://x.com/username"))
    assert not compose_page(urlsplit("https://x.com.example.com/compose/post"))
    assert composio_publishes({"name": "TWITTER_CREATE_TWEET"})
    assert not composio_publishes({"name": "TWITTER_GET_POST"})
    assert not composio_publishes({"name": "YOUTUBE_CREATE_PLAYLIST"})
    assert composio_publishes({"name": "COMPOSIO_MULTI_EXECUTE_TOOL", "arguments": {"tools": [{"tool_slug": "YOUTUBE_UPLOAD_VIDEO"}]}})


async def test_composio_relay_obeys_publishing_settings_without_launching_a_browser(ctx):
    client, app = ctx
    campaign = (await client.post("/api/social/campaigns", json={"name": "Publishing policy"})).json()
    bot = await app.state.store.get_bot(campaign["bots"]["scheduler"])
    thread_id = bot.threadId
    app.state.turns.runs[thread_id] = ThreadRun(
        bot_id=bot.id, inp=SendTurnInput(thread_id=thread_id, bot_id=bot.id, text=""), turn_id="publishing-test",
    )
    fake_service = '''
import json, sys
for line in sys.stdin:
    request = json.loads(line)
    if "id" not in request:
        continue
    if request["method"] == "initialize":
        result = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}, "serverInfo": {"name": "fake", "version": "1"}}
    else:
        result = {"content": [{"type": "text", "text": request["params"]["name"]}]}
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
'''
    await app.state.mcp.create({
        "name": "Fake Composio", "appId": "composio", "transport": "stdio",
        "command": sys.executable, "args": ["-u", "-c", fake_service],
    })
    entries = await app.state.mcp.entries_for([], thread_id, campaign_broker=app.state.broker)
    conn = connect({"transport": "stdio", **next(iter(entries.values()))})
    try:
        await conn.open()
        await conn.initialize()
        assert (await conn.call("TWITTER_CREATE_TWEET"))["content"][0]["text"] == "TWITTER_CREATE_TWEET"
        path = f"/api/social/campaigns/{campaign['id']}/browser-settings?role=scheduler"
        assert (await client.put(path, json={"postVia": "web"})).status_code == 200
        assert (await conn.call("TWITTER_CREATE_TWEET"))["isError"]
        assert (await conn.call("TWITTER_GET_POST"))["content"][0]["text"] == "TWITTER_GET_POST"
        assert not app.state.browser.state(bot.id)["running"]
    finally:
        await conn.close()
        app.state.turns.runs.pop(thread_id, None)
