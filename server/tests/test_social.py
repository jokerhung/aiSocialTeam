import httpx
import pytest
from asgi_lifespan import LifespanManager

from botteam.main import create_app


@pytest.fixture
async def ctx(tmp_path):
    app = create_app(str(tmp_path / "t.db"), home=tmp_path)
    async with LifespanManager(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            yield c


async def test_campaign_gets_a_team_of_five_bots(ctx):
    c = ctx
    camp = (await c.post("/api/social/campaigns", json={"name": "Summer"})).json()
    assert set(camp["bots"]) == {"master", "research", "creator", "scheduler", "analytics"}
    ids = {b["id"] for b in (await c.get("/api/bots")).json()["bots"]}
    assert set(camp["bots"].values()) <= ids
    assert [x["id"] for x in (await c.get("/api/social/campaigns")).json()["campaigns"]] == [camp["id"]]


async def test_post_lifecycle_and_analytics(ctx):
    c = ctx
    camp = (await c.post("/api/social/campaigns", json={"name": "S"})).json()
    body = {"campaignId": camp["id"], "title": "Hi", "caption": "Hello", "hashtags": ["#a"], "platforms": ["instagram"],
            "status": "scheduled", "scheduledAt": "2020-01-01T10:00:00Z"}
    post = (await c.post("/api/social/posts", json=body)).json()
    assert post["status"] == "published"  # a time in the past settles at once
    posts = (await c.get("/api/social/posts", params={"campaignId": camp["id"]})).json()["posts"]
    assert posts[0]["status"] == "published"  # its time has passed
    await c.put(f"/api/social/posts/{post['id']}/metrics", json={"metrics": {"views": 10, "likes": 2}})
    rows = (await c.get("/api/social/analytics", params={"campaignId": camp["id"]})).json()["posts"]
    assert rows[0]["metrics"]["views"] == 10 and rows[0]["metrics"]["saves"] is None
    assert (await c.put(f"/api/social/posts/{post['id']}", json=body)).status_code == 409


async def test_scheduled_post_needs_a_time(ctx):
    camp = (await ctx.post("/api/social/campaigns", json={"name": "S"})).json()
    r = await ctx.post("/api/social/posts", json={"campaignId": camp["id"], "title": "x", "platforms": ["tiktok"], "status": "scheduled"})
    assert r.status_code == 400


async def test_x_is_written_in_any_way_and_saved_as_composios_twitter(ctx):
    camp = (await ctx.post("/api/social/campaigns", json={"name": "S"})).json()
    r = await ctx.post("/api/social/posts", json={"campaignId": camp["id"], "title": "Tweet", "caption": "Hi", "platforms": ["X", "Twitter", "twitter"], "status": "draft"})
    assert r.status_code == 201, r.text
    assert r.json()["platforms"] == ["twitter"]  # one entry, Composio's name for it


async def test_a_name_that_is_not_a_platform_is_refused_when_composios_list_is_unknown(ctx):
    camp = (await ctx.post("/api/social/campaigns", json={"name": "S"})).json()
    r = await ctx.post("/api/social/posts", json={"campaignId": camp["id"], "title": "x", "platforms": ["my space!"], "status": "draft"})
    assert r.status_code == 400


async def test_the_platforms_are_the_social_apps_composio_lists(ctx):
    app = ctx._transport.app

    async def social_toolkits():
        return [{"slug": "twitter", "label": "Twitter", "logo": None}, {"slug": "bluesky", "label": "Bluesky", "logo": "https://x/y.png"}]

    app.state.composio.social_toolkits = social_toolkits
    camp = (await ctx.post("/api/social/campaigns", json={"name": "S"})).json()
    listed = (await ctx.get("/api/social/platforms")).json()
    assert listed["source"] == "composio" and [p["id"] for p in listed["platforms"]] == ["twitter", "bluesky"]
    ok = await ctx.post("/api/social/posts", json={"campaignId": camp["id"], "title": "a", "platforms": ["bluesky", "x"], "status": "draft"})
    assert ok.status_code == 201 and ok.json()["platforms"] == ["bluesky", "twitter"]  # a new app needs no change in the code
    bad = await ctx.post("/api/social/posts", json={"campaignId": camp["id"], "title": "a", "platforms": ["myspace"], "status": "draft"})
    assert bad.status_code == 400 and "twitter" in bad.json()["detail"] and "bluesky" in bad.json()["detail"]


async def test_the_creator_is_told_how_to_save_posts(ctx):
    camp = (await ctx.post("/api/social/campaigns", json={"name": "S"})).json()
    bots = {b["id"]: b for b in (await ctx.get("/api/bots")).json()["bots"]}
    soul = bots[camp["bots"]["creator"]]["soul"]
    assert "/api/social/posts" in soul and f'"campaignId": {camp["id"]}' in soul and "/api/social/platforms" in soul
    assert "/api/social/posts" in bots[camp["bots"]["scheduler"]]["soul"]


async def test_an_old_soul_is_brought_up_to_date_and_an_edited_one_is_left_alone(tmp_path):
    from botteam.social import OLD_SOULS

    souls = {}
    app = create_app(str(tmp_path / "t.db"), home=tmp_path)
    async with LifespanManager(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            camp = (await c.post("/api/social/campaigns", json={"name": "S"})).json()
            await c.patch(f"/api/bots/{camp['bots']['creator']}", json={"soul": OLD_SOULS["creator"]})
            await c.patch(f"/api/bots/{camp['bots']['scheduler']}", json={"soul": "my own words"})
    again = create_app(str(tmp_path / "t.db"), home=tmp_path)  # a new start of the server on the same data
    async with LifespanManager(again):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=again), base_url="http://t") as c:
            await c.get("/api/social/campaigns")  # the first use of the social part refreshes the souls
            bots = {b["id"]: b for b in (await c.get("/api/bots")).json()["bots"]}
            souls = {role: bots[bot_id]["soul"] for role, bot_id in camp["bots"].items()}
    assert "/api/social/posts" in souls["creator"]
    assert souls["scheduler"] == "my own words"


async def test_pictures_are_made_by_the_chosen_cli_tool(ctx, monkeypatch, tmp_path):
    from botteam import images

    monkeypatch.setenv("BOTTEAM_DATA_DIR", str(tmp_path / "data"))
    seen = {}

    async def fake_status():
        return [{"id": "codex", "label": "Codex CLI", "installed": True, "version": "x"},
                {"id": "gemini", "label": "Gemini CLI", "installed": False, "version": None}]

    async def fake_generate(kind, prompt, aspect, workdir, model=None, timeout=0):
        seen.update(kind=kind, prompt=prompt, aspect=aspect, model=model)
        out = workdir / "image.png"
        out.write_bytes(b"\x89PNG fake")
        return out

    monkeypatch.setattr(images, "status", fake_status)
    monkeypatch.setattr(images, "generate", fake_generate)
    c = ctx
    cid = (await c.post("/api/social/campaigns", json={"name": "Pics"})).json()["id"]
    first = (await c.get(f"/api/social/campaigns/{cid}/image-settings")).json()
    assert first["provider"] == "codex" and first["tools"][1]["installed"] is False  # the first installed tool is the default
    assert (await c.put(f"/api/social/campaigns/{cid}/image-settings", json={"provider": "nope"})).status_code == 400
    saved = (await c.put(f"/api/social/campaigns/{cid}/image-settings", json={"provider": "codex", "model": "m1"})).json()
    assert saved["model"] == "m1"
    r = await c.post("/api/social/images", json={"campaignId": cid, "prompt": "a cup", "aspect": "portrait"})
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert url.startswith("/api/media/file/") and (tmp_path / "data" / "social-media" / url.rsplit("/", 1)[1]).read_bytes().startswith(b"\x89PNG")
    assert seen == {"kind": "codex", "prompt": "a cup", "aspect": "portrait", "model": "m1"}
    await c.put(f"/api/social/campaigns/{cid}/image-settings", json={"provider": ""})
    assert (await c.post("/api/social/images", json={"campaignId": cid, "prompt": "a cup"})).status_code == 409


async def test_a_post_without_a_picture_gets_one_from_its_title(ctx, monkeypatch, tmp_path):
    from botteam import images

    monkeypatch.setenv("BOTTEAM_DATA_DIR", str(tmp_path / "data"))
    seen = {}

    async def fake_status():
        return [{"id": "codex", "label": "Codex CLI", "installed": True, "version": "x"}]

    async def fake_generate(kind, prompt, aspect, workdir, model=None, timeout=0):
        seen.update(prompt=prompt, aspect=aspect)
        out = workdir / "image.png"
        out.write_bytes(b"\x89PNG fake")
        return out

    monkeypatch.setattr(images, "status", fake_status)
    monkeypatch.setattr(images, "generate", fake_generate)
    c = ctx
    cid = (await c.post("/api/social/campaigns", json={"name": "P"})).json()["id"]
    post = (await c.post("/api/social/posts", json={"campaignId": cid, "title": "Nvidia has a new CEO", "caption": "Big news", "platforms": ["instagram"]})).json()
    r = await c.post(f"/api/social/posts/{post['id']}/image", json={})
    assert r.status_code == 200, r.text
    media = r.json()["media"]
    assert len(media) == 1 and media[0]["url"].startswith("/api/media/file/") and media[0]["origin"] == "generated"
    assert "Nvidia has a new CEO" in seen["prompt"] and seen["aspect"] == "landscape"
    assert (await c.get(f"/api/social/posts/{post['id']}")).json()["media"] == media
    assert (await c.post("/api/social/posts/999/image", json={})).status_code == 404


async def test_a_picture_can_be_changed_and_the_original_stays(ctx, monkeypatch, tmp_path):
    from botteam import images

    monkeypatch.setenv("BOTTEAM_DATA_DIR", str(tmp_path / "data"))
    media = tmp_path / "data" / "social-media"
    media.mkdir(parents=True)
    (media / "orig.png").write_bytes(b"\x89PNG original")
    seen = {}

    async def fake_status():
        return [{"id": "codex", "label": "Codex CLI", "installed": True, "version": "x"}]

    async def fake_generate(kind, prompt, aspect, workdir, model=None, timeout=0, source=None):
        seen.update(prompt=prompt, source=source.read_bytes() if source else None)
        out = workdir / "image.png"
        out.write_bytes(b"\x89PNG changed")
        return out

    monkeypatch.setattr(images, "status", fake_status)
    monkeypatch.setattr(images, "generate", fake_generate)
    c = ctx
    cid = (await c.post("/api/social/campaigns", json={"name": "E"})).json()["id"]
    r = await c.post("/api/social/images/edit", json={"campaignId": cid, "url": "/api/media/file/orig.png", "prompt": "warmer colours"})
    assert r.status_code == 200, r.text
    assert seen["source"].endswith(b"original") and (media / "orig.png").read_bytes().endswith(b"original")
    assert (media / r.json()["url"].rsplit("/", 1)[1]).read_bytes().endswith(b"changed")
    assert (await c.post("/api/social/images/edit", json={"campaignId": cid, "url": "/api/media/file/none.png", "prompt": "x"})).status_code == 404
