"""Server-side connection settings for E2B Cloud and E2B Embed."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field

from .config import ConfigStore

KEY = "e2b"
CLOUD_API = "https://api.e2b.dev"


class ComputerSettingsPatch(BaseModel):
    source: Literal["cloud", "embed"] | None = None
    apiUrl: str | None = None
    sandboxUrl: str | None = None
    domain: str | None = None
    apiKey: str | None = Field(default=None, max_length=512)
    template: str | None = Field(default=None, max_length=256)
    maxMachines: int | None = Field(default=None, ge=1, le=32)
    idleSeconds: int | None = Field(default=None, ge=1, le=86400)


def address(value: str) -> str:
    value = value.strip()
    try:
        url = httpx.URL(value)
    except httpx.InvalidURL:
        raise ValueError("Enter a valid E2B URL") from None
    if url.scheme not in ("https", "http") or not url.host or url.userinfo or url.query or url.fragment:
        raise ValueError("Enter an E2B URL without credentials, a query, or a fragment")
    return str(url).rstrip("/")


def env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


@dataclass(frozen=True)
class Connection:
    source: str
    api_url: str
    sandbox_url: str
    domain: str
    template: str
    key: str = field(repr=False)

    def identity(self) -> list[str]:
        return [self.source, self.api_url, self.sandbox_url, self.domain]

    def sdk_options(self) -> dict:
        return {
            "api_key": self.key,
            "api_url": self.api_url,
            **({"sandbox_url": self.sandbox_url} if self.sandbox_url else {}),
            **({"domain": self.domain} if self.domain else {}),
        }


class ComputerHostSettings:
    def __init__(self, config: ConfigStore, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.config = config
        self.transport = transport
        self.checked: Connection | None = None
        self.result: dict = {}
        self.revision = 0

    @property
    def saved(self) -> dict:
        return self.config.data.get("computerHost", {})

    def connection(self, saved: dict | None = None) -> Connection:
        saved = self.saved if saved is None else saved
        env_url = os.environ.get("E2B_API_URL", "").strip()
        source = saved.get("source", "embed" if env_url and env_url.rstrip("/") != CLOUD_API else "cloud")
        api_url = env_url or (saved.get("apiUrl", "") if source == "embed" else CLOUD_API)
        sandbox_url = os.environ.get("E2B_SANDBOX_URL", "").strip() or (saved.get("sandboxUrl", "") if source == "embed" else "")
        try:
            api_url = address(api_url) if api_url else ""
            sandbox_url = address(sandbox_url) if sandbox_url else ""
        except ValueError:
            api_url = sandbox_url = ""
        if not sandbox_url and api_url and source == "embed":
            url = httpx.URL(api_url)
            if url.port == 3000:
                sandbox_url = str(url.copy_with(port=3002, path="/")).rstrip("/")
        domain = os.environ.get("E2B_DOMAIN", "").strip() or (saved.get("domain", "") if source == "embed" else "")
        return Connection(
            source, api_url, sandbox_url, domain,
            os.environ.get("BOTTEAM_COMPUTER_TEMPLATE", "").strip() or saved.get("template", "desktop"),
            os.environ.get("E2B_API_KEY", "").strip() or self.config.secret(KEY) or "",
        )

    def public(self) -> dict:
        connection = self.connection()
        key = connection.key
        result = self.result if self.checked == connection else {"status": "unchecked"}
        return {
            "source": connection.source,
            "apiUrl": connection.api_url,
            "sandboxUrl": connection.sandbox_url,
            "domain": connection.domain,
            "template": connection.template,
            "keySet": bool(key),
            "keyHint": f"{key[:3]}…{key[-4:]}" if len(key) > 8 else None,
            "maxMachines": self.saved.get("maxMachines", 2),
            "idleSeconds": env_int("BOTTEAM_COMPUTER_IDLE_S", self.saved.get("idleSeconds", 900)),
            **result,
        }

    def update(self, patch: ComputerSettingsPatch) -> dict:
        values = patch.model_dump(exclude_unset=True, exclude_none=True)
        key = values.pop("apiKey", None)
        previous = self.saved
        for name in ("apiUrl", "sandboxUrl"):
            if name in values:
                values[name] = address(values[name]) if values[name].strip() else ""
        if "domain" in values:
            domain = values["domain"].strip()
            if any(c in domain for c in "/:@?# ") or any(ord(c) < 33 for c in domain):
                raise ValueError("Enter the E2B domain without a scheme or port")
            values["domain"] = domain
        if "template" in values:
            values["template"] = values["template"].strip() or "desktop"
        updated = {**previous, **values}
        current = self.connection()
        candidate = self.connection(updated)
        if current.identity() != candidate.identity() and self.config.data.get("computerMachines"):
            raise ValueError("Delete existing computers before changing the E2B server")
        if key is None and (
            updated.get("source", current.source) != current.source
            or candidate.api_url != current.api_url
        ):
            key = ""
        self.config.data["computerHost"] = updated
        if key is None:
            self.config.save()
        else:
            self.config.set_secret(KEY, key.strip() or None)
        self.revision += 1
        if current != self.connection():
            self.checked = None
        return self.public()

    async def test(self) -> dict:
        connection = self.connection()
        revision = self.revision
        start = time.monotonic()
        status = "unauthorized" if not connection.key else "unreachable"
        if connection.key and connection.api_url:
            try:
                async with httpx.AsyncClient(timeout=8, transport=self.transport, trust_env=False) as client:
                    status = await self._probe(client, connection)
            except (httpx.HTTPError, ValueError):
                status = "unreachable"
        if revision == self.revision and connection == self.connection():
            self.checked = connection
            self.result = {"status": status, "latencyMs": round((time.monotonic() - start) * 1000)}
        return self.public()

    async def _probe(self, client: httpx.AsyncClient, connection: Connection) -> str:
        base = address(connection.api_url)
        headers = {"X-API-Key": connection.key}
        response = await client.get(base + "/v2/templates", headers=headers)
        authenticated = response.status_code == 200
        if response.status_code in (401, 403):
            return "unauthorized"
        if response.status_code == 200:
            rows = response.json()
            if not isinstance(rows, list):
                return "unreachable"
            for row in rows:
                if not isinstance(row, dict):
                    continue
                names = [row.get("templateID"), *(row.get("names") or []), *(row.get("aliases") or [])]
                if connection.template in names or connection.template in [
                    name.rsplit("/", 1)[-1] for name in names if isinstance(name, str)
                ]:
                    return "ready" if row.get("buildStatus") == "ready" else "no_template"
        elif response.status_code != 404:
            return "unreachable"
        if connection.source == "cloud":
            # The public Cloud desktop template does not belong to the caller's team.
            response = await client.get(base + "/templates/aliases/" + quote(connection.template, safe=""), headers=headers)
            if response.status_code == 401:
                return "unauthorized"
            # E2B reports a public alias owned by another team as forbidden.
            if response.status_code == 200 or authenticated and response.status_code == 403:
                return "ready"
            if response.status_code == 403:
                return "unauthorized"
            if response.status_code != 404:
                return "unreachable"
        return "no_template"
