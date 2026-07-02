#!/usr/bin/env python3
"""Lightweight pre-build checks for local markdown links and assets."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {".md", ".html", ".yml", ".css"}
IGNORE_PREFIXES = (
    "http://",
    "https://",
    "mailto:",
    "#",
    "{{",
    "{%",
)


def text_files() -> list[Path]:
    ignored = {".git", "_site", ".jekyll-cache", "vendor"}
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part in ignored for part in path.parts):
            continue
        if path.is_file() and path.suffix in TEXT_EXTENSIONS:
            files.append(path)
    return files


def target_exists(link: str) -> bool:
    link = link.split("#", 1)[0].split("?", 1)[0]
    if not link or link.startswith(IGNORE_PREFIXES):
        return True
    if link.startswith("/assets/"):
        return (ROOT / link.lstrip("/")).exists()
    if link.startswith("/"):
        if link == "/":
            return (ROOT / "_pages" / "index.md").exists()
        slug = link.strip("/")
        candidates = [
            ROOT / "_pages" / f"{slug}.md",
            ROOT / slug / "index.md",
            ROOT / f"{slug}.md",
        ]
        return any(candidate.exists() for candidate in candidates)
    return True


def main() -> int:
    failures: list[str] = []
    markdown_link = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    html_link = re.compile(r"""(?:href|src)=["']([^"']+)["']""")
    for path in text_files():
        content = path.read_text(encoding="utf-8")
        links = markdown_link.findall(content) + html_link.findall(content)
        for link in links:
            if not target_exists(link):
                failures.append(f"{path.relative_to(ROOT)}: missing target {link}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("internal link check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

