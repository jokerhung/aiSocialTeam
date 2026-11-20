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
