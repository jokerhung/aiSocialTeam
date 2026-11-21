"""Own E2B desktop sandboxes and preserve their state when they are idle."""
from __future__ import annotations

import asyncio
import logging
import sys
from uuid import uuid4

from .computer_settings import ComputerHostSettings, ComputerSettingsPatch, Connection

log = logging.getLogger(__name__)
PRIVATE_NETWORKS = [
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16",
    "100.64.0.0/10", "127.0.0.0/8", "::1/128", "fc00::/7", "fe80::/10",
]
METADATA_OWNER = "botteamInstance"
KEEP_AWAKE = (
    "export DISPLAY=:0; xfce4-screensaver-command --deactivate >/dev/null 2>&1; pkill -x xfce4-screensaver; "
    "xset s off s noblank >/dev/null 2>&1; true"
)
METADATA_BOT = "botteam"
DEFAULT_RESOLUTION = (1280, 800)


class ComputerUnavailable(RuntimeError):
    pass


class ComputerHost:
    def __init__(self, settings: ComputerHostSettings, bus, sdk=None) -> None:
        self.settings = settings
        self.config = settings.config
        self.bus = bus
        self._sdk = sdk
        self._lock = asyncio.Lock()
        self._live: dict[str, object] = {}
        self._idle: dict[str, asyncio.Task] = {}
        self._operations: dict[str, asyncio.Lock] = {}
        self._control: dict[str, tuple[asyncio.Event, str | None]] = {}
        self._idle_seconds: dict[str, int] = {}

    @staticmethod
    def supports(driver) -> bool:
        return bool(
            sys.version_info >= (3, 11) and driver
            and driver.provider in {"codex", "claude", "antigravity"} and driver.capabilities.images
        )

    @property
    def records(self) -> dict:
        return self.config.data.setdefault("computerMachines", {})

    def _backend(self):
        if self._sdk is None:
            try:
                from e2b_desktop import Sandbox
            except ImportError:
                raise ComputerUnavailable("Computer use requires Python 3.11 or later") from None
            self._sdk = Sandbox
        return self._sdk

    def _owner(self) -> str:
        owner = self.config.data.get("computerInstanceId")
        if not owner:
            owner = uuid4().hex
            self.config.data["computerInstanceId"] = owner
            self.config.save()
        return owner

    def state(self, bot_id: str) -> dict:
        record = self.records.get(bot_id)
        return {
            "status": record.get("status", "paused") if record else "none",
            "running": bot_id in self._live,
            "held": bot_id in self._control,
            "helpReason": self._control[bot_id][1] if bot_id in self._control else None,
            "resolution": record.get("resolution", DEFAULT_RESOLUTION) if record else DEFAULT_RESOLUTION,
        }

    def live(self, bot_id: str):
        return self._live.get(bot_id)

    def operation(self, bot_id: str) -> asyncio.Lock:
        return self._operations.setdefault(bot_id, asyncio.Lock())

    def _publish(self, bot_id: str) -> None:
        self.bus.publish({"kind": "computer-control", "botId": bot_id, **self.state(bot_id)})

    async def invoke(self, function, *args, **kwargs):
        task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            # The SDK operation has already started. Its caller will reconcile the
            # operation under the same lifecycle lock before releasing it.
            return await task

    def _connection_for(self, record: dict | None = None) -> Connection:
        connection = self.settings.connection()
        if not connection.key or not connection.api_url:
            raise ComputerUnavailable("Set up the computer host in Settings")
        if record and record["provider"] != connection.identity():
            raise ComputerUnavailable("This computer belongs to a different E2B server")
        return connection

    def _options(self, connection: Connection) -> dict:
        return {**connection.sdk_options(), "request_timeout": 30, "retries": 0}

    async def update_settings(self, patch: ComputerSettingsPatch) -> dict:
        async with self._lock:
            return self.settings.update(patch)

    async def wake(self, bot_id: str, resolution: tuple[int, int] = DEFAULT_RESOLUTION, idle_seconds: int | None = None):
        async with self._lock:
            self._idle_seconds[bot_id] = idle_seconds or self.settings.public()["idleSeconds"]
            current = self._live.get(bot_id)
            if current is not None:
                self.touch(bot_id)
                return current
            if self.settings.public()["status"] != "ready":
                raise ComputerUnavailable("Check the E2B connection in Settings")
            if len(self._live) >= self.settings.public()["maxMachines"]:
                raise ComputerUnavailable("The computer host has reached its machine limit")
            record = self.records.get(bot_id)
            connection = self._connection_for(record)
            sdk = self._backend()
            options = self._options(connection)
            timeout = 3600
            if record:
                try:
                    current = await self.invoke(sdk.connect, record["sandboxId"], timeout=timeout, **options)
                except Exception as exc:
                    from e2b.exceptions import NotFoundException

                    if not isinstance(exc, NotFoundException):
                        raise
                    self.records.pop(bot_id)
                    self.config.save()
            created = current is None
            if current is None:
                current = await self.invoke(
                    sdk.create, template=connection.template, resolution=resolution, timeout=timeout,
                    metadata={METADATA_OWNER: self._owner(), METADATA_BOT: bot_id}, secure=True,
                    lifecycle={"on_timeout": "pause"},
                    network={"allow_public_traffic": False, "deny_out": PRIVATE_NETWORKS},
                    **options,
                )
            self.records[bot_id] = {
                "sandboxId": current.sandbox_id,
                "provider": connection.identity(),
                "status": "running",
                "resolution": record.get("resolution", resolution) if record and record["sandboxId"] == current.sandbox_id else resolution,
            }
            self.config.save()
            self._live[bot_id] = current
            self.touch(bot_id)
            try:
                # The desktop's screensaver blanks the screen after five idle minutes, and then both the agent's screenshots and the
                # person's live view are black: switch it off whenever the machine is started or resumed.
                await self.invoke(current.commands.run, KEEP_AWAKE, timeout=10)
            except Exception:
                log.warning("Could not keep the E2B computer for bot %s awake", bot_id)
            if created:
                # The SDK waits for Xfce processes, then the desktop still needs to paint.
                await asyncio.sleep(2.5)
            self._publish(bot_id)
            return current

    def touch(self, bot_id: str) -> None:
        self._cancel_idle(bot_id)
        if bot_id not in self._control:
            self._idle[bot_id] = asyncio.create_task(self._pause_when_idle(bot_id))

    async def set_control(self, bot_id: str, held: bool) -> dict:
        async with self.operation(bot_id):
            if held:
                if bot_id not in self._live:
                    raise ComputerUnavailable("The computer is not running")
                self._control.setdefault(bot_id, (asyncio.Event(), None))
            else:
                self._release(bot_id)
            if bot_id in self._live:
                self.touch(bot_id)
            self._publish(bot_id)
        return self.state(bot_id)

    def _release(self, bot_id: str) -> None:
        previous = self._control.pop(bot_id, None)
        if previous:
            previous[0].set()

    async def ask_for_help(self, bot_id: str, reason: str, resolution: tuple[int, int] = DEFAULT_RESOLUTION, idle_seconds: int | None = None) -> bool:
        async with self.operation(bot_id):
            if bot_id in self._control:
                return False
            await self.wake(bot_id, resolution, idle_seconds)
            event = asyncio.Event()
            self._control[bot_id] = event, reason
            self._cancel_idle(bot_id)
            self._publish(bot_id)
        try:
            await asyncio.wait_for(event.wait(), 900)
            return bot_id in self._live
        except (TimeoutError, asyncio.CancelledError):
            async with self.operation(bot_id):
                place = self._control.get(bot_id)
                if place and place[0] is event:
                    self._release(bot_id)
                    if bot_id in self._live:
                        self.touch(bot_id)
                    self._publish(bot_id)
            return False

    def _cancel_idle(self, bot_id: str) -> None:
        timer = self._idle.pop(bot_id, None)
        if timer and timer is not asyncio.current_task():
            timer.cancel()

    async def _pause_when_idle(self, bot_id: str) -> None:
        try:
            await asyncio.sleep(min(self._idle_seconds[bot_id], 3540))
            await self.pause(bot_id)
        except Exception:
            log.warning("Could not pause idle E2B computer for bot %s", bot_id)

    async def pause(self, bot_id: str) -> dict:
        async with self.operation(bot_id), self._lock:
            current = self._live.get(bot_id)
            if current is not None:
                await self.invoke(current.pause, mode="full")
                self._live.pop(bot_id)
                self.records[bot_id]["status"] = "paused"
                self.config.save()
                self._release(bot_id)
                self._publish(bot_id)
            self._cancel_idle(bot_id)
            return self.state(bot_id)

    async def destroy(self, bot_id: str) -> None:
        async with self.operation(bot_id), self._lock:
            record = self.records.get(bot_id)
            if record:
                connection = self._connection_for(record)
                await self.invoke(self._backend().kill, record["sandboxId"], **self._options(connection))
                self.records.pop(bot_id)
                self._live.pop(bot_id, None)
                self._idle_seconds.pop(bot_id, None)
                self.config.save()
                self._release(bot_id)
                self._publish(bot_id)
            self._cancel_idle(bot_id)

    async def recover(self, active_bots: set[str] | None = None) -> None:
        if not self.settings.connection().key or (await self.settings.test())["status"] != "ready":
            return
        owner = self.config.data.get("computerInstanceId")
        if not owner:
            return
        connection = self._connection_for()
        options = self._options(connection)

        def entries():
            paginator = self._backend().list(query={"metadata": {METADATA_OWNER: owner}}, **options)
            while paginator.has_next:
                yield from paginator.next_items()

        async with self._lock:
            sandboxes = await self.invoke(lambda: list(entries()))
            tracked = {
                record["sandboxId"]: (bot_id, record) for bot_id, record in self.records.items()
                if record["provider"] == connection.identity()
            }
            for sandbox in sandboxes:
                metadata = sandbox.metadata or {}
                if metadata.get(METADATA_OWNER) != owner:
                    continue
                entry = tracked.get(sandbox.sandbox_id)
                if entry is None or metadata.get(METADATA_BOT) != entry[0] or active_bots is not None and entry[0] not in active_bots:
                    await self.invoke(self._backend().kill, sandbox.sandbox_id, **options)
                    if entry is not None:
                        self.records.pop(entry[0], None)
                else:
                    # A sandbox left running by a previous process is adopted lazily.
                    entry[1]["status"] = getattr(sandbox.state, "value", sandbox.state)
            self.config.save()

    async def shutdown(self) -> None:
        for bot_id in list(self._idle):
            self._cancel_idle(bot_id)
        for bot_id in list(self._live):
            try:
                await self.pause(bot_id)
            except Exception:
                log.warning("Could not pause E2B computer for bot %s during shutdown", bot_id)
