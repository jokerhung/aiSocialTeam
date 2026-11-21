"""Social-media layer: campaigns (each with its own AI team of bots), posts, connected accounts and post analytics.

The AI team is made of ordinary BotTeam bots (a Master bot plus Research, Creator, Scheduler and Analytics bots), so
chat, hand-offs, approvals and routines all use the existing bot machinery. This module only adds what the bots do not
have: the campaign, the posts that go on a calendar, the accounts (connected through Composio, see composio.py) they go to and the numbers that come back.

There is no real social-network publisher here: a scheduled post whose time has passed is marked published locally
(see `_settle`). Metrics are entered or updated through the API.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

import shutil
import uuid
from pathlib import Path

from . import images
from .store import Store, data_dir, now_ms

# A post's platform is the slug Composio gives the social app (twitter, instagram, tiktok, youtube, facebook…): which ones exist is
# read from Composio's "social media accounts" category (composio.social_toolkits), nothing is listed here. These are only the
# other names people and agents use for one of them.
PLATFORM_ALIASES = {"x": "twitter", "x.com": "twitter", "x (twitter)": "twitter", "ig": "instagram", "yt": "youtube", "fb": "facebook"}
PLATFORM_SHAPE = re.compile(r"^[a-z0-9_]{2,40}$")  # what a platform name must look like when Composio's list is not known


def normalize_platform(value: str) -> str:
    v = value.strip().lower()
    return PLATFORM_ALIASES.get(v, v)
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
CREATE TABLE IF NOT EXISTS social_image_settings(
  campaign_id INTEGER PRIMARY KEY, provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '');
"""

# The team every campaign gets: (role id, bot name, title, colour, what its soul says)
TEAM: list[tuple[str, str, str, str, str]] = [
    ("master", "Master Agent", "Plans your requests, assigns the team and reports back", "purple",
     "You lead a social-media team for one campaign. Turn the person's request into small tasks and hand each one to the "
     "right teammate (Research, Creator, Scheduler, Analytics). Report back briefly when the work is done."),
    ("research", "Research Agent", "Finds trends and topics your audience cares about", "cyan",
     "You research trends, topics and hashtags for social-media campaigns. Give findings with their sources."),
    ("creator", "Creator Agent", "Writes captions and designs the posts", "pink",
     "You write captions, hooks and hashtag sets for the social platforms of the campaign (Instagram, TikTok, YouTube, X and others), matching each platform's rules."),
    ("scheduler", "Scheduler Agent", "Plans the best time to post and schedules posts", "orange",
     "You choose the best times to post and schedule posts for the campaign."),
    ("analytics", "Analytics Agent", "Reports on post performance, on request or on a schedule you set", "green",
     "You report on how posts performed: views, likes, comments, shares and saves, and what to do next."),
]


TEAM_BASE = {role: soul for role, _name, _title, _color, soul in TEAM}

# What each soul said before the notes below were added: a bot whose soul is still exactly this gets the new text
OLD_SOULS = {
    "master": ("You lead a social-media team for one campaign. Turn the person's request into small tasks and hand each one to the "
               "right teammate (Research, Creator, Scheduler, Analytics). Report back briefly when the work is done."),
    "creator": "You write captions, hooks and hashtag sets for Instagram, TikTok and YouTube, matching each platform's rules.",
    "scheduler": "You choose the best times to post and schedule posts for the campaign.",
}


PARA = chr(10) * 2  # a blank line between paragraphs
LINE = chr(10)


def soul_for(role: str, base: str, campaign_id: int) -> str:
    """The soul of a team bot: its job, and how to use the campaign's Posts page through the server's HTTP API."""
    url = f"http://127.0.0.1:{os.environ.get('SERVER_PORT') or 8899}/api/social/posts"
    example = '{"campaignId": %d, "title": "...", "caption": "...", "hashtags": ["#a", "#b"], "platforms": ["x"], "status": "draft"}' % campaign_id
    if role == "master":
        return PARA.join([
            base,
            "The campaign's Posts page holds its posts (drafts, scheduled, published). Ask the Creator to save the drafts there "
            f"(platform names are Composio's social apps) and the Scheduler to schedule them; check with GET {url}?campaignId={campaign_id}.",
        ])
    if role == "creator":
        return PARA.join([
            base,
            "Save every finished post on the campaign's Posts page so the person can review and schedule it. Send it to the server "
            "with an HTTP request (for example curl):",
            f"POST {url}  (Content-Type: application/json)" + LINE + example,
            LINE.join([
                '- platforms: one or more Composio social apps by slug, for example instagram, tiktok, youtube, twitter ("x" means twitter), facebook, linkedin. GET ' + url.replace("/posts", "/platforms") + ' lists the valid ones. One post can go to several platforms.',
                '- status "draft" keeps it as a draft. caption is the text without the hashtags; hashtags is a list.',
                "- An X post is at most 280 characters with its hashtags; for a thread save one post per tweet.",
                "- Instagram needs an image or video; TikTok needs a video or images; YouTube needs a video. A draft may still lack media.",
            ]),
            "To make a picture for a post, send the brief to the image tool chosen in your Settings (it takes a minute or so, so wait for the reply):",
            f"POST {url.replace('/posts', '/images')}  (Content-Type: application/json)" + LINE
            + '{"campaignId": %d, "prompt": "what the picture shows, in detail", "aspect": "square"}' % campaign_id,
            'aspect is square, vertical (4:5), portrait (9:16) or landscape (16:9). The reply has "url" (for example /api/media/file/abc.png): '
            'put it in the post as media: [{"url": "<that url>", "fileId": null, "name": "<short title>", "mimeType": "image/png", "origin": "agent"}]. '
            "Make the picture first, then save the post with it.",
            "The reply has the post's id. Report the ids you saved. If the request fails, read the error in the reply and fix the request "
            "instead of giving up.",
        ])
    if role == "scheduler":
        return PARA.join([
            base,
            f"Posts live on the campaign's Posts page. List them with GET {url}?campaignId={campaign_id}. To schedule one, send PUT {url}/<id> "
            'with the whole post as JSON (as returned by GET), change "status" to "scheduled" and set "scheduledAt" (ISO time in UTC, for '
            'example 2026-11-24T02:00:00Z) and "timeZone". To take one off the schedule set "status" back to "draft". Report what you '
            "scheduled and when.",
        ])
    return base


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
    @field_validator("platforms", mode="before")
    @classmethod
    def _platforms(cls, value):
        """Names are lower-cased, "twitter" means x, and a platform appears once."""
        if not isinstance(value, list):
            return value
        seen: list[str] = []
        for item in value:
            name = normalize_platform(item) if isinstance(item, str) else item
            if name not in seen:
                seen.append(name)
        return seen

    @field_validator("accountIds", mode="before")
    @classmethod
    def _account_ids(cls, value):
        return {normalize_platform(k): v for k, v in value.items()} if isinstance(value, dict) else value

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


def register(app: FastAPI, store: Store, registry, turns, composio=None) -> None:
    ready = {"ok": False}

    async def db():
        if not ready["ok"]:
            await store.db.executescript(SCHEMA)
            await store.db.commit()
            ready["ok"] = True
            await refresh_souls()
        return store.db

    async def refresh_souls() -> None:
        """A team bot whose soul still starts with its original text (and has not been rewritten by the person) is given the
        current notes on the Posts page; that also brings along a campaign made by an earlier version."""
        rows = await (await store.db.execute("SELECT id,bots FROM social_campaigns")).fetchall()
        for cid, bots_json in rows:
            for role, bot_id in json.loads(bots_json).items():
                if role not in TEAM_BASE or role in ("research", "analytics"):
                    continue
                bot = await store.get_bot(bot_id)
                current = (bot.soul or "").strip() if bot else ""
                bases = [b for b in (OLD_SOULS.get(role), TEAM_BASE[role]) if b]
                fresh = soul_for(role, TEAM_BASE[role], cid)
                if bot and current != fresh and any(current.startswith(b) for b in bases):
                    bot.soul = fresh
                    await store.save_bot(bot)
                    await turns.publish_bot(bot)

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
            bot.soul = soul_for(role, soul, cid)
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

    # ---- pictures made by Codex CLI or Gemini CLI --------------------------------------
    one_at_a_time = asyncio.Lock()

    async def image_settings(cid: int) -> dict:
        d = await db()
        r = await (await d.execute("SELECT provider,model FROM social_image_settings WHERE campaign_id=?", (cid,))).fetchone()
        tools = await images.status()
        if r is None:  # never chosen: the first tool that is installed
            provider = next((t["id"] for t in tools if t["installed"]), "")
            return {"provider": provider, "model": "", "tools": tools}
        return {"provider": r[0], "model": r[1], "tools": tools}

    @app.get("/api/social/campaigns/{cid}/image-settings")
    async def get_image_settings(cid: int):
        await need_campaign(cid)
        return await image_settings(cid)

    @app.put("/api/social/campaigns/{cid}/image-settings")
    async def put_image_settings(cid: int, body: dict):
        await need_campaign(cid)
        provider = str(body.get("provider") or "")
        if provider and provider not in images.PROVIDERS:
            raise HTTPException(400, f"provider must be one of: {', '.join(images.PROVIDERS)}, or empty for none")
        model = str(body.get("model") or "").strip()[:100]
        d = await db()
        await d.execute("INSERT INTO social_image_settings(campaign_id,provider,model) VALUES(?,?,?) "
                        "ON CONFLICT(campaign_id) DO UPDATE SET provider=excluded.provider, model=excluded.model", (cid, provider, model))
        await d.commit()
        return await image_settings(cid)

    async def make_picture(cid: int, prompt: str, aspect: str, source: Optional[Path] = None) -> tuple[str, str]:
        """Makes one picture with the campaign's chosen tool and keeps it with the uploaded media: (its url, the tool)."""
        settings = await image_settings(cid)
        if not settings["provider"]:
            raise HTTPException(409, "no image tool is chosen: pick Codex CLI or Gemini CLI in the Creator agent's Settings")
        media_dir = data_dir() / "social-media"
        media_dir.mkdir(parents=True, exist_ok=True)
        async with one_at_a_time:
            # A plain folder, not tempfile's: Python 3.13+ makes those readable by their owner only, and then the picture a
            # sandboxed Codex writes into it cannot be read back here
            work = data_dir() / "image-work" / uuid.uuid4().hex
            work.mkdir(parents=True)
            try:
                try:
                    extra = {"source": source} if source else {}
                    made = await images.generate(settings["provider"], prompt, aspect, work, settings["model"] or None, **extra)
                except images.ImageError as e:
                    raise HTTPException(502, str(e))
                name = f"{uuid.uuid4().hex}{made.suffix.lower()}"
                (media_dir / name).write_bytes(made.read_bytes())
            finally:
                shutil.rmtree(work, ignore_errors=True)
        return f"/api/media/file/{name}", settings["provider"]

    @app.post("/api/social/images")
    async def make_image(body: dict):
        try:
            cid = int(body.get("campaignId"))
        except (TypeError, ValueError):
            raise HTTPException(400, "campaignId is required")
        prompt = str(body.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(400, "prompt is required: describe the picture")
        await need_campaign(cid)
        url, provider = await make_picture(cid, prompt, str(body.get("aspect") or "square"))
        return {"url": url, "provider": provider}

    @app.post("/api/social/images/edit")
    async def edit_image(body: dict):
        """Changes a picture kept with the uploaded media as the person says; the original stays, the new one is returned."""
        try:
            cid = int(body.get("campaignId"))
        except (TypeError, ValueError):
            raise HTTPException(400, "campaignId is required")
        prompt = str(body.get("prompt") or "").strip()
        name = str(body.get("url") or "").rsplit("/", 1)[-1]
        if not prompt:
            raise HTTPException(400, "prompt is required: say what to change")
        source = data_dir() / "social-media" / Path(name).name
        if not name or not source.is_file():
            raise HTTPException(404, "that picture is not among the uploaded media")
        await need_campaign(cid)
        url, provider = await make_picture(cid, prompt, "square", source)
        return {"url": url, "provider": provider}

    @app.post("/api/social/posts/{pid}/image")
    async def make_post_image(pid: int, body: Optional[dict] = None):
        """A picture for a post that has none, made from its title and text, added to the post's media."""
        d = await db()
        r = await (await d.execute(f"SELECT {POST_COLS} FROM social_posts WHERE id=?", (pid,))).fetchone()
        if not r:
            raise HTTPException(404, "post not found")
        post = post_view(r)
        if post["status"] not in ("draft", "scheduled"):
            raise HTTPException(409, "a post that has gone out cannot be changed")
        prompt = str((body or {}).get("prompt") or "").strip() or (
            f"An eye-catching picture for a social-media post. Title: {post['title']}. Text: {post['caption'][:600]}. "
            "A clean, modern, editorial look that fits the topic; no logos of real companies and no text in the picture.")
        url, _ = await make_picture(post["campaignId"], prompt, str((body or {}).get("aspect") or "landscape"))
        name = url.rsplit("/", 1)[1]
        media = post["media"] + [{"url": url, "fileId": name, "name": post["title"][:40], "mimeType": "image/png" if name.endswith(".png") else "image/jpeg", "origin": "generated", "prompt": prompt[:900]}]
        await d.execute("UPDATE social_posts SET media=?, updated_at=? WHERE id=?", (json.dumps(media), now_ms(), pid))
        await d.commit()
        r = await (await d.execute(f"SELECT {POST_COLS} FROM social_posts WHERE id=?", (pid,))).fetchone()
        return post_view(r)

    # ---- posts -------------------------------------------------------------------------
    async def known_platforms() -> Optional[dict[str, dict]]:
        """slug -> Composio's card for every social app, or None when Composio's catalog is not known."""
        if composio is None:
            return None
        try:
            toolkits = await composio.social_toolkits()
        except Exception:  # an unreachable Composio must not stop a post being saved
            return None
        return {t["slug"]: t for t in toolkits} if toolkits else None

    async def check(body: PostBody) -> None:
        if body.status not in ("draft", "scheduled"):
            raise HTTPException(400, "status must be draft or scheduled")
        known = await known_platforms()
        for pl in body.platforms:
            if known is not None and pl not in known:
                raise HTTPException(400, f"unknown platform {pl!r}; the social apps in Composio are: {', '.join(sorted(known)[:25])}"
                                         " (GET /api/social/platforms lists them)")
            if known is None and not PLATFORM_SHAPE.match(pl):
                raise HTTPException(400, f"{pl!r} is not a platform name (a Composio app slug such as instagram, tiktok, youtube, twitter)")
        if body.status == "scheduled" and (not body.scheduledAt or not body.platforms):
            raise HTTPException(400, "a scheduled post needs a time and a platform")

    @app.get("/api/social/platforms")
    async def list_platforms():
        """The platforms a post can go to: Composio's social apps (in its order of popularity), with the logo and the name."""
        known = await known_platforms()
        if known is None:
            return {"source": "unavailable", "platforms": []}
        return {"source": "composio", "platforms": [{"id": slug, "label": t.get("label") or slug, "logo": t.get("logo")} for slug, t in known.items()]}

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
        await check(body)
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
        await check(body)
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
