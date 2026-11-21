"""Pictures made by a command-line tool the person already has, so no image API key is needed here:

- Codex CLI: its built-in image generation (`codex exec` with the image_generation feature, on by default)
- Gemini CLI: `gemini -p` (it makes pictures only where a Gemini extension or MCP server for images is installed)

The tool is asked to save the picture as image.png in an empty folder; the file is taken from there. One picture is made at a
time, since each run starts a whole agent and takes a minute or so.
"""
from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Optional

from .drivers.proc import kill_tree, run_text, spawn

PROVIDERS = {
    "codex": {"label": "Codex CLI", "binary": "codex"},
    "gemini": {"label": "Gemini CLI", "binary": "gemini"},
}

ASPECTS = {
    "square": "square, 1:1",
    "vertical": "vertical, 4:5 (Instagram feed)",
    "portrait": "tall portrait, 9:16 (stories, Reels, TikTok, YouTube Shorts)",
    "landscape": "wide landscape, 16:9 (YouTube, X, banners)",
}

IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
TIMEOUT_S = 300


class ImageError(Exception):
    pass


def binary_for(kind: str) -> Optional[str]:
    meta = PROVIDERS.get(kind)
    return shutil.which(meta["binary"]) if meta else None


async def status() -> list[dict]:
    """Each tool: whether it is installed, and its version."""
    out = []
    for kind, meta in PROVIDERS.items():
        binary = binary_for(kind)
        version = None
        if binary:
            code, text = await run_text([binary, "--version"], timeout=15)
            version = text.splitlines()[0] if code == 0 and text else None
        out.append({"id": kind, "label": meta["label"], "installed": bool(binary), "version": version})
    return out


def brief(prompt: str, aspect: str, source: Optional[str] = None) -> str:
    shape = ASPECTS.get(aspect, ASPECTS["square"])
    if source:
        return (
            f"Edit the picture {source} in the current directory with your image generation ability: keep what is not mentioned the same, "
            f"and apply this change:\n\n{prompt.strip()}\n\n"
            "Save the edited picture as image.png in the current directory (do not overwrite the original). "
            "Do not edit any other file. When it is saved, reply with just: image.png"
        )
    return (
        "Make exactly one image with your image generation ability, from this brief:\n\n"
        f"{prompt.strip()}\n\n"
        f"Shape: {shape}. No watermark and no text in the picture unless the brief asks for it.\n"
        "Save the finished picture as image.png in the current directory (copy it there if it was made elsewhere). "
        "Do not edit any other file. When it is saved, reply with just: image.png"
    )


def _args(kind: str, binary: str, prompt: str, model: Optional[str]) -> tuple[list[str], bool]:
    """(command line, whether the brief goes in through stdin)"""
    if kind == "codex":
        args = [binary, "exec", "--skip-git-repo-check", "--ephemeral", "-s", "workspace-write", "--json"]
        if model:
            args += ["-m", model]
        return args + ["-"], True
    args = [binary, "--yolo"]
    if model:
        args += ["-m", model]
    return args + ["-p", prompt], False


def _found_image(workdir: Path) -> Optional[Path]:
    wanted = workdir / "image.png"
    if wanted.is_file() and wanted.stat().st_size > 0:
        return wanted
    files = [p for p in workdir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES and p.stat().st_size > 0 and p.stem != "source"]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _last_words(kind: str, output: str) -> str:
    """What the tool said last, for an error message."""
    if kind == "codex":
        said = []
        for line in output.splitlines():
            try:
                item = json.loads(line).get("item") or {}
            except ValueError:
                continue
            if item.get("type") == "agent_message" and item.get("text"):
                said.append(item["text"])
        if said:
            return said[-1][:400]
    return output.strip()[-400:]


async def generate(kind: str, prompt: str, aspect: str, workdir: Path, model: Optional[str] = None, timeout: float = TIMEOUT_S, source: Optional[Path] = None) -> Path:
    """Run the tool in `workdir` and return the picture file it made there."""
    meta = PROVIDERS.get(kind)
    if not meta:
        raise ImageError(f"unknown image tool {kind!r}")
    binary = binary_for(kind)
    if not binary:
        raise ImageError(f"{meta['label']} is not installed on this computer (the command `{meta['binary']}` was not found)")
    if source:
        shutil.copyfile(source, workdir / ("source" + source.suffix.lower()))
    text = brief(prompt, aspect, ("source" + source.suffix.lower()) if source else None)
    args, via_stdin = _args(kind, binary, text, model)
    try:
        proc = await spawn(args, cwd=str(workdir), stdin=via_stdin)
    except OSError as e:
        raise ImageError(f"{meta['label']} could not start: {e}") from e
    try:
        out, err = await asyncio.wait_for(proc.communicate(text.encode("utf8") if via_stdin else None), timeout)
    except asyncio.TimeoutError:
        await kill_tree(proc)
        raise ImageError(f"{meta['label']} took longer than {int(timeout)} seconds and was stopped") from None
    output = (out + err).decode("utf8", "replace")
    found = _found_image(workdir)
    if found:
        return found
    if proc.returncode:
        raise ImageError(f"{meta['label']} stopped with code {proc.returncode}: {_last_words(kind, output)}")
    raise ImageError(f"{meta['label']} finished but made no picture: {_last_words(kind, output) or 'it said nothing'}")
