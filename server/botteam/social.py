"""Social-media layer: campaigns (each with its own AI team of bots), posts, connected accounts and post analytics.

The AI team is made of ordinary BotTeam bots (a Master bot plus Research, Creator, Scheduler and Analytics bots), so
chat, hand-offs, approvals and routines all use the existing bot machinery. This module only adds what the bots do not
have: the campaign, the posts that go on a calendar, the accounts (connected through Composio, see composio.py) they go to and the numbers that come back.

There is no real social-network publisher here: a scheduled post whose time has passed is marked published locally
(see `_settle`). Metrics are entered or updated through the API.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .store import Store, now_ms

PLATFORMS = ["instagram", "tiktok", "youtube"]
METRICS = ["views", "likes", "comments", "shares", "saves", "reach", "impressions"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS social_campaigns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT, icon_url TEXT, office_image TEXT NOT NULL,
  ended_at INTEGER, created_at INTEGER NOT NULL, bots TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS social_posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'manual', draft_id INTEGER,
  title TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', hashtags TEXT NOT NULL DEFAULT '[]', platforms TEXT NOT NULL DEFAULT '[]',
  media TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', scheduled_at INTEGER, time_zone TEXT NOT NULL DEFAULT 'UTC',
  account_ids TEXT NOT NULL DEFAULT '{}', results TEXT NOT NULL DEFAULT '{}', metrics TEXT NOT NULL DEFAULT '{}', error TEXT,
  published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS social_posts_campaign ON social_posts(campaign_id, id);
"""

# The team every campaign gets: (role id, bot name, title, colour, what its soul says)
TEAM: list[tuple[str, str, str, str, str]] = [
    ("master", "Master Agent", "Plans your requests, assigns the team and reports back", "purple",
     "You lead a social-media team for one campaign. Turn the person's request into small tasks and hand each one to the "
     "right teammate (Research, Creator, Scheduler, Analytics). Report back briefly when the work is done."),
    ("research", "Research Agent", "Finds trends and topics your audience cares about", "cyan",
     "You research trends, topics and hashtags for social-media campaigns. Give findings with their sources."),
    ("creator", "Creator Agent", "Writes captions and designs the posts", "pink",
     "You write captions, hooks and hashtag sets for Instagram, TikTok and YouTube, matching each platform's rules."),
    ("scheduler", "Scheduler Agent", "Plans the best time to post and schedules posts", "orange",
     "You choose the best times to post and schedule posts for the campaign."),
    ("analytics", "Analytics Agent", "Reports on post performance, on request or on a schedule you set", "green",
     "You report on how posts performed: views, likes, comments, shares and saves, and what to do next."),
]


def _ms(iso: Optional[str]) -> Optional[int]:
    if not iso:
        return None
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def _iso(ms: Optional[int]) -> Optional[str]:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


class CampaignBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: Optional[str] = None
    iconUrl: Optional[str] = None
    officeImage: str = "/offices/modern-office.png"


class PostBody(BaseModel):
    campaignId: int
    title: str = Field(min_length=1, max_length=200)
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    media: list[dict[str, Any]] = Field(default_factory=list)
    draftId: Optional[int] = None
    source: str = "manual"
    status: str = "draft"  # draft | scheduled
    scheduledAt: Optional[str] = None
    timeZone: str = "UTC"
    accountIds: dict[str, str] = Field(default_factory=dict)


class MetricsBody(BaseModel):
    metrics: dict[str, Optional[int]]


def register(app: FastAPI, store: Store, registry, turns) -> None:
    ready = {"ok": False}

    async def db():
        if not ready["ok"]:
            await store.db.executescript(SCHEMA)
            await store.db.commit()
            ready["ok"] = True
        return store.db

    def campaign_view(r) -> dict:
        return {"id": r[0], "name": r[1], "icon": r[2], "iconUrl": r[3], "officeImage": r[4], "endedAt": _iso(r[5]), "createdAt": _iso(r[6]),
                "bots": json.loads(r[7])}

    CAMPAIGN_COLS = "id,name,icon,icon_url,office_image,ended_at,created_at,bots"
    POST_COLS = ("id,campaign_id,source,draft_id,title,caption,hashtags,platforms,media,status,scheduled_at,time_zone,account_ids,results,metrics,error,"
                 "published_at,created_at")

    def post_view(r) -> dict:
        return {"id": r[0], "campaignId": r[1], "source": r[2], "draftId": r[3], "title": r[4], "caption": r[5], "hashtags": json.loads(r[6]),
                "platforms": json.loads(r[7]), "media": json.loads(r[8]), "status": r[9], "scheduledAt": _iso(r[10]), "timeZone": r[11],
                "accountIds": json.loads(r[12]), "results": json.loads(r[13]), "metrics": json.loads(r[14]), "error": r[15],
                "publishedAt": _iso(r[16]), "createdAt": _iso(r[17])}

    async def _settle(campaign_id: Optional[int] = None) -> None:
        """Nothing publishes for real: a scheduled post whose time has come is marked published here."""
        d = await db()
        now = now_ms()
        sql = f"SELECT {POST_COLS} FROM social_posts WHERE status='scheduled' AND scheduled_at<=?"
        args: list[Any] = [now]
        if campaign_id is not None:
            sql += " AND campaign_id=?"
            args.append(campaign_id)
        for r in await (await d.execute(sql, args)).fetchall():
            p = post_view(r)
            results = {pl: {"status": "published", "accountId": p["accountIds"].get(pl), "url": None, "error": None} for pl in p["platforms"]}
            await d.execute("UPDATE social_posts SET status='published', published_at=?, results=?, updated_at=? WHERE id=?",
                            (r[10], json.dumps(results), now, r[0]))
        await d.commit()

    async def need_campaign(cid: int) -> dict:
        d = await db()
        r = await (await d.execute(f"SELECT {CAMPAIGN_COLS} FROM social_campaigns WHERE id=?", (cid,))).fetchone()
        if not r:
            raise HTTPException(404, "campaign not found")
        return campaign_view(r)

    # ---- campaigns ---------------------------------------------------------------------
    @app.get("/api/social/campaigns")
    async def list_campaigns():
        d = await db()
        rows = await (await d.execute(f"SELECT {CAMPAIGN_COLS} FROM social_campaigns ORDER BY id DESC")).fetchall()
        return {"campaigns": [campaign_view(r) for r in rows]}

    @app.post("/api/social/campaigns", status_code=201)
    async def create_campaign(body: CampaignBody):
        d = await db()
        cur = await d.execute("INSERT INTO social_campaigns(name,icon,icon_url,office_image,created_at) VALUES(?,?,?,?,?)",
                              (body.name.strip(), body.icon, body.iconUrl, body.officeImage, now_ms()))
        cid = cur.lastrowid
        bots: dict[str, str] = {}
        for role, name, title, color, soul in TEAM:
            bot = await store.create_bot(f"{name} · {body.name.strip()}"[:60], title, title, color, registry.default_selection())
            bot.soul = soul
            store.assign_workspace(bot)
            await store.save_bot(bot)
            await turns.publish_bot(bot)
            bots[role] = bot.id
        await d.execute("UPDATE social_campaigns SET bots=? WHERE id=?", (json.dumps(bots), cid))
        await d.commit()
        return await need_campaign(cid)

    @app.get("/api/social/campaigns/{cid}")
    async def get_campaign(cid: int):
        return await need_campaign(cid)

    @app.post("/api/social/campaigns/{cid}/end")
    async def end_campaign(cid: int):
        await need_campaign(cid)
        d = await db()
        await d.execute("UPDATE social_campaigns SET ended_at=? WHERE id=? AND ended_at IS NULL", (now_ms(), cid))
        await d.commit()
        return await need_campaign(cid)

    @app.patch("/api/social/campaigns/{cid}")
    async def patch_campaign(cid: int, body: dict):
        await need_campaign(cid)
        d = await db()
        for key, col in (("name", "name"), ("icon", "icon"), ("iconUrl", "icon_url"), ("officeImage", "office_image")):
            if key in body:
                await d.execute(f"UPDATE social_campaigns SET {col}=? WHERE id=?", (body[key], cid))
        await d.commit()
        return await need_campaign(cid)

    @app.delete("/api/social/campaigns/{cid}")
    async def delete_campaign(cid: int):
        await need_campaign(cid)  # its bots stay in the sidebar; delete them there if wanted
        d = await db()
        await d.execute("DELETE FROM social_posts WHERE campaign_id=?", (cid,))
        await d.execute("DELETE FROM social_campaigns WHERE id=?", (cid,))
        await d.commit()
        return {"ok": True}

    # ---- posts -------------------------------------------------------------------------
    def check(body: PostBody) -> None:
        if body.status not in ("draft", "scheduled"):
            raise HTTPException(400, "status must be draft or scheduled")
        for pl in body.platforms:
            if pl not in PLATFORMS:
                raise HTTPException(400, f"unknown platform {pl}")
        if body.status == "scheduled" and (not body.scheduledAt or not body.platforms):
            raise HTTPException(400, "a scheduled post needs a time and a platform")

    @app.get("/api/social/posts")
    async def list_posts(campaignId: int, limit: int = 200):
        await _settle(campaignId)
        d = await db()
        rows = await (await d.execute(f"SELECT {POST_COLS} FROM social_posts WHERE campaign_id=? ORDER BY id DESC LIMIT ?", (campaignId, limit))).fetchall()
        return {"posts": [post_view(r) for r in rows]}

    @app.get("/api/social/posts/{pid}")
    async def get_post(pid: int):
        d = await db()
        r = await (await d.execute(f"SELECT {POST_COLS} FROM social_posts WHERE id=?", (pid,))).fetchone()
        if not r:
            raise HTTPException(404, "post not found")
        await _settle(r[1])
        r = await (await d.execute(f"SELECT {POST_COLS} FROM social_posts WHERE id=?", (pid,))).fetchone()
        return post_view(r)

    @app.post("/api/social/posts", status_code=201)
    async def create_post(body: PostBody):
        check(body)
        await need_campaign(body.campaignId)
        d = await db()
        results = {pl: {"status": "scheduled", "accountId": body.accountIds.get(pl)} for pl in body.platforms} if body.status == "scheduled" else {}
        now = now_ms()
        cur = await d.execute(
            "INSERT INTO social_posts(campaign_id,source,draft_id,title,caption,hashtags,platforms,media,status,scheduled_at,time_zone,account_ids,results,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (body.campaignId, body.source, body.draftId, body.title.strip(), body.caption, json.dumps(body.hashtags), json.dumps(body.platforms),
             json.dumps(body.media), body.status, _ms(body.scheduledAt), body.timeZone, json.dumps(body.accountIds), json.dumps(results), now, now))
        await d.commit()
        return await get_post(cur.lastrowid)

    @app.put("/api/social/posts/{pid}")
    async def update_post(pid: int, body: PostBody):
        current = await get_post(pid)
        if current["status"] not in ("draft", "scheduled", "cancelled"):
            raise HTTPException(409, "a post that has gone out can't be edited")
        check(body)
        d = await db()
        results = {pl: {"status": "scheduled", "accountId": body.accountIds.get(pl)} for pl in body.platforms} if body.status == "scheduled" else {}
        await d.execute(
            "UPDATE social_posts SET title=?,caption=?,hashtags=?,platforms=?,media=?,status=?,scheduled_at=?,time_zone=?,account_ids=?,results=?,updated_at=? WHERE id=?",
            (body.title.strip(), body.caption, json.dumps(body.hashtags), json.dumps(body.platforms), json.dumps(body.media), body.status,
             _ms(body.scheduledAt), body.timeZone, json.dumps(body.accountIds), json.dumps(results), now_ms(), pid))
        await d.commit()
        return await get_post(pid)

    @app.post("/api/social/posts/{pid}/cancel")
    async def cancel_post(pid: int):
        current = await get_post(pid)
        if current["status"] != "scheduled":
            raise HTTPException(409, "only a scheduled post can be cancelled")
        d = await db()
        await d.execute("UPDATE social_posts SET status='cancelled', results='{}', updated_at=? WHERE id=?", (now_ms(), pid))
        await d.commit()
        return await get_post(pid)

    @app.delete("/api/social/posts/{pid}")
    async def delete_post(pid: int):
        d = await db()
        await d.execute("DELETE FROM social_posts WHERE id=?", (pid,))
        await d.commit()
        return {"ok": True}

    @app.put("/api/social/posts/{pid}/metrics")
    async def set_metrics(pid: int, body: MetricsBody):
        current = await get_post(pid)
        metrics = {**current["metrics"], **{k: v for k, v in body.metrics.items() if k in METRICS}}
        d = await db()
        await d.execute("UPDATE social_posts SET metrics=?, updated_at=? WHERE id=?", (json.dumps(metrics), now_ms(), pid))
        await d.commit()
        return await get_post(pid)

    # ---- analytics: one row per published platform of a post --------------------------------------
    @app.get("/api/social/analytics")
    async def analytics(campaignId: Optional[int] = None):
        await _settle(campaignId)
        d = await db()
        sql = f"SELECT {POST_COLS} FROM social_posts WHERE status='published'"
        args: list[Any] = []
        if campaignId is not None:
            sql += " AND campaign_id=?"
            args.append(campaignId)
        rows = await (await d.execute(sql + " ORDER BY published_at DESC", args)).fetchall()
        out = []
        for r in rows:
            p = post_view(r)
            text = "\n\n".join(x for x in [p["caption"].strip(), " ".join(p["hashtags"])] if x)
            for pl in p["platforms"]:
                out.append({"id": f"{p['id']}:{pl}", "platform": pl, "state": "published", "postedAt": p["publishedAt"], "text": text,
                            "postUrl": (p["results"].get(pl) or {}).get("url"), "error": None, "campaignId": p["campaignId"], "postId": p["id"],
                            "title": p["title"], "source": p["source"],
                            "metrics": {k: p["metrics"].get(k) for k in METRICS}, "metricsAt": _iso(now_ms()) if p["metrics"] else None})
        return {"posts": out, "sync": {"connected": True, "lastSyncedAt": _iso(now_ms()), "lastAttemptAt": _iso(now_ms()), "lastError": None}}
