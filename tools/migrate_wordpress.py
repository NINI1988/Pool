#!/usr/bin/env python3
"""Migrate public WordPress content from poolbillard-ms.de into this Jekyll repo.

The script intentionally uses only Python's standard library so it can run in a
clean checkout without installing Python dependencies.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


SOURCE = "https://poolbillard-ms.de"
API = f"{SOURCE}/wp-json/wp/v2"
ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "_pages"
POSTS_DIR = ROOT / "_posts"
UPLOADS_DIR = ROOT / "assets" / "uploads"
DOWNLOADS_DIR = ROOT / "assets" / "downloads"
IMAGES_DIR = ROOT / "assets" / "images"
DATA_DIR = ROOT / "_data"

PAGE_SLUG_OVERRIDES = {
    "colibri-wp": "",
    "spielplan-2": "spielplan",
    "regeln-und-spielmodus-im-doppelpokal": "doppelpokal",
}

SKIP_PAGE_SLUGS = {"news", "spielberichte"}

NAV_ORDER = [
    ("Home", "/"),
    ("News", "/news/"),
    ("Spielplan", "/spielplan/"),
    ("Termine", "/termine/"),
    ("Einzelpokal", "/einzelpokal/"),
    ("Doppelpokal", "/doppelpokal/"),
    ("Mannschaftspokal", "/mannschaftspokal/"),
    ("Mannschaftswertung", "/mannschaftswertung/"),
    ("Einzelwertung", "/einzelwertung/"),
    ("Doppelwertung", "/doppelwertung/"),
    ("Vorstand & Vereine", "/vorstand-vereine/"),
]


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "poolbillard-ms-migration/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "poolbillard-ms-migration/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def slugify(value: str) -> str:
    value = html.unescape(value).lower()
    replacements = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "ß": "ss",
        "&": "und",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "seite"


def strip_tags(value: str) -> str:
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def yaml_quote(value: str) -> str:
    value = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{value}"'


def frontmatter(**values: str) -> str:
    lines = ["---"]
    for key, value in values.items():
        if value is None:
            continue
        lines.append(f"{key}: {yaml_quote(str(value))}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def attrs_from_tag(tag: str) -> dict[str, str]:
    attrs = {}
    for match in re.finditer(r'([:\w-]+)\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))', tag):
        attrs[match.group(1).lower()] = html.unescape(match.group(3) or match.group(4) or match.group(5) or "")
    return attrs


def asset_url_from_img_tag(tag: str) -> str | None:
    attrs = attrs_from_tag(tag)
    for key in ("data-src", "src"):
        value = attrs.get(key, "")
        if value and not value.startswith("data:"):
            return value
    srcset = attrs.get("srcset") or attrs.get("data-srcset") or ""
    if srcset:
        first = srcset.split(",")[0].strip().split(" ")[0]
        if first and not first.startswith("data:"):
            return first
    return None


def local_asset_path(url: str) -> str:
    normalized = url.replace("http://poolbillard-ms.de", SOURCE)
    parsed = urllib.parse.urlparse(normalized)
    filename = Path(urllib.parse.unquote(parsed.path)).name
    if not filename:
        filename = slugify(parsed.path) or "asset"
    if "/wp-content/uploads/" in parsed.path:
        relative = parsed.path.split("/wp-content/uploads/", 1)[1]
        return f"/assets/uploads/{relative}"
    return f"/assets/uploads/{filename}"


def download_asset(url: str, seen: set[str]) -> str | None:
    if not url or url.startswith("data:"):
        return None
    normalized = url.replace("http://poolbillard-ms.de", SOURCE)
    local = local_asset_path(normalized)
    destination = ROOT / local.lstrip("/")
    if normalized not in seen:
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            destination.write_bytes(fetch_bytes(normalized))
            seen.add(normalized)
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: could not download {normalized}: {exc}", file=sys.stderr)
            return None
    return local


class MarkdownConverter(HTMLParser):
    def __init__(self, asset_map: dict[str, str]):
        super().__init__(convert_charrefs=True)
        self.asset_map = asset_map
        self.parts: list[str] = []
        self.link_stack: list[str] = []
        self.skip_depth = 0
        self.heading_level: int | None = None
        self.in_summary = False

    def append(self, value: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(value)

    def handle_starttag(self, tag: str, attrs_list):
        attrs = dict(attrs_list)
        if tag in {"script", "style"}:
            self.skip_depth += 1
            return
        if tag in {"p", "div", "section", "article", "figure"}:
            self.append("\n\n")
        elif tag in {"br"}:
            self.append("\n")
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.heading_level = min(int(tag[1]), 3)
            self.append("\n\n" + "#" * self.heading_level + " ")
        elif tag == "a":
            href = attrs.get("href", "")
            self.link_stack.append(href)
            self.append("[")
        elif tag == "img":
            src = attrs.get("data-src") or attrs.get("src") or ""
            if src.startswith("data:") and attrs.get("srcset"):
                src = attrs["srcset"].split(",")[0].strip().split(" ")[0]
            local = self.asset_map.get(src) or self.asset_map.get(src.replace("http://poolbillard-ms.de", SOURCE))
            if local:
                alt = attrs.get("alt", "").strip()
                self.append(f"\n\n![{alt}]({local})\n\n")
        elif tag in {"strong", "b"}:
            self.append("**")
        elif tag in {"em", "i"}:
            self.append("*")
        elif tag in {"ul", "ol"}:
            self.append("\n")
        elif tag == "li":
            self.append("\n- ")
        elif tag == "hr":
            self.append("\n\n---\n\n")
        elif tag == "details":
            self.append("\n\n<details>\n")
        elif tag == "summary":
            self.in_summary = True
            self.append("<summary>")
        elif tag == "table":
            self.append('\n\n<div class="table-wrap">\n<table>\n')
        elif tag in {"thead", "tbody", "tr", "th", "td"}:
            self.append(f"<{tag}>")

    def handle_endtag(self, tag: str):
        if tag in {"script", "style"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.heading_level = None
            self.append("\n\n")
        elif tag == "a" and self.link_stack:
            href = self.link_stack.pop()
            href = href.replace(SOURCE, "")
            self.append(f"]({href})")
        elif tag in {"strong", "b"}:
            self.append("**")
        elif tag in {"em", "i"}:
            self.append("*")
        elif tag in {"p", "div", "section", "article", "figure"}:
            self.append("\n\n")
        elif tag == "summary":
            self.in_summary = False
            self.append("</summary>\n")
        elif tag == "details":
            self.append("\n</details>\n\n")
        elif tag == "table":
            self.append("\n</table>\n</div>\n\n")
        elif tag in {"thead", "tbody", "tr", "th", "td"}:
            self.append(f"</{tag}>")

    def handle_data(self, data: str):
        if self.skip_depth:
            return
        if not data:
            return
        if self.heading_level or self.in_summary:
            self.append(re.sub(r"\s+", " ", data).strip())
        else:
            self.append(data)

    def markdown(self) -> str:
        text = "".join(self.parts)
        text = html.unescape(text)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip() + "\n"


def collect_assets(raw_html: str, seen: set[str]) -> dict[str, str]:
    urls: set[str] = set()
    for tag in re.findall(r"<img\b[^>]*>", raw_html, flags=re.I):
        url = asset_url_from_img_tag(tag)
        if url:
            urls.add(url)
    for url in re.findall(r'https?://poolbillard-ms\.de/wp-content/uploads/[^"\'\s<>)]+', raw_html):
        urls.add(html.unescape(url))
    mapping: dict[str, str] = {}
    for url in sorted(urls):
        local = download_asset(url, seen)
        if local:
            mapping[url] = local
            mapping[url.replace("http://poolbillard-ms.de", SOURCE)] = local
            mapping[url.replace(SOURCE, "http://poolbillard-ms.de")] = local
    return mapping


def convert_html(raw_html: str, asset_map: dict[str, str]) -> str:
    raw_html = raw_html.replace("http://poolbillard-ms.de", SOURCE)
    converter = MarkdownConverter(asset_map)
    converter.feed(raw_html)
    md = converter.markdown()
    for source, local in asset_map.items():
        md = md.replace(source, local)
    md = re.sub(r"\((https://poolbillard-ms\.de)(/[^)]+)\)", r"(\2)", md)
    md = re.sub(r"(!\[[^\]]*\]\((/assets/[^)]+)\)\n\n)(?:!\[[^\]]*\]\(\2\)\n\n)+", r"\1", md)
    md = dedupe_adjacent_images(md)
    return liquidize_asset_links(md)


def liquidize_asset_links(markdown: str) -> str:
    return re.sub(r"\((/assets/[^)]+)\)", r"({{ '\1' | relative_url }})", markdown)


def dedupe_adjacent_images(markdown: str) -> str:
    result: list[str] = []
    last_image_target: str | None = None
    blank_since_image = False
    image_pattern = re.compile(r"!\[[^\]]*\]\((/assets/[^)]+)\)")
    for line in markdown.splitlines():
        match = image_pattern.fullmatch(line.strip())
        if match:
            target = match.group(1)
            if target == last_image_target and blank_since_image:
                continue
            last_image_target = target
            blank_since_image = False
            result.append(line)
            continue
        if not line.strip():
            if last_image_target:
                blank_since_image = True
            result.append(line)
            continue
        last_image_target = None
        blank_since_image = False
        result.append(line)
    return "\n".join(result).strip() + "\n"


def split_h2_sections(raw_html: str) -> list[tuple[str, str]]:
    pattern = re.compile(r"(<h2\b[^>]*>.*?</h2>)", re.I | re.S)
    parts = pattern.split(raw_html)
    sections: list[tuple[str, str]] = []
    current_title = ""
    current_html: list[str] = []
    for part in parts:
        if not part:
            continue
        if pattern.match(part):
            if current_title and current_html:
                sections.append((current_title, "".join(current_html)))
            current_title = strip_tags(part)
            current_html = [part]
        else:
            if current_title:
                current_html.append(part)
    if current_title and current_html:
        sections.append((current_title, "".join(current_html)))
    return sections


def write_page(filename: str, title: str, permalink: str, description: str, body: str, layout: str | None = None) -> None:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    path = PAGES_DIR / filename
    values = {"title": title, "permalink": permalink, "description": description}
    if layout:
        values["layout"] = layout
    content = frontmatter(**values) + body
    path.write_text(content, encoding="utf-8")


def write_post(date_value: str, title: str, body: str, suffix: str) -> None:
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    date = dt.datetime.fromisoformat(date_value).date()
    slug = slugify(title)
    filename = f"{date.isoformat()}-{slug}-{suffix}.md"
    path = POSTS_DIR / filename
    content = frontmatter(title=title, date=f"{date.isoformat()} 12:00:00 +0100") + body
    path.write_text(content, encoding="utf-8")


def write_yaml_list(path: Path, items: list[dict[str, str]]) -> None:
    lines = ["items:"]
    for item in items:
        lines.append(f"  - title: {yaml_quote(item['title'])}")
        if "url" in item:
            lines.append(f"    url: {yaml_quote(item['url'])}")
        if "file" in item:
            lines.append(f"    file: {yaml_quote(item['file'])}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def migrate() -> None:
    for path in (PAGES_DIR, POSTS_DIR, UPLOADS_DIR, DOWNLOADS_DIR, IMAGES_DIR, DATA_DIR):
        path.mkdir(parents=True, exist_ok=True)

    pages = fetch_json(f"{API}/pages?per_page=100")
    media = fetch_json(f"{API}/media?per_page=100&_fields=id,source_url,mime_type,title.rendered")
    seen_assets: set[str] = set()
    downloads: list[dict[str, str]] = []

    logo = download_asset(f"{SOURCE}/wp-content/uploads/2025/07/cropped-Logo-zugeschnitten-5-1.jpg", seen_assets)
    if logo:
        logo_target = IMAGES_DIR / "logo.jpg"
        shutil.copyfile(ROOT / logo.lstrip("/"), logo_target)

    for item in media:
        source_url = item.get("source_url") or ""
        mime_type = item.get("mime_type") or ""
        if mime_type == "application/pdf":
            local = download_asset(source_url, seen_assets)
            if local:
                target = DOWNLOADS_DIR / Path(local).name
                shutil.copyfile(ROOT / local.lstrip("/"), target)
                downloads.append({"title": strip_tags(item.get("title", {}).get("rendered", "")) or target.name, "file": f"/assets/downloads/{target.name}"})

    write_yaml_list(DATA_DIR / "downloads.yml", downloads)
    write_yaml_list(DATA_DIR / "navigation.yml", [{"title": title, "url": url} for title, url in NAV_ORDER])

    page_summaries: list[str] = []
    post_summaries: list[str] = []

    for page in sorted(pages, key=lambda p: p.get("menu_order", 0)):
        wp_slug = page["slug"]
        title = strip_tags(page["title"]["rendered"])
        raw_html = page["content"]["rendered"]
        asset_map = collect_assets(raw_html, seen_assets)

        if wp_slug in {"news", "spielberichte"}:
            sections = split_h2_sections(raw_html)
            if sections:
                for index, (section_title, section_html) in enumerate(sections, start=1):
                    body = convert_html(section_html, asset_map)
                    write_post(page["modified"], section_title, body, f"{wp_slug}-{index:02d}")
                    post_summaries.append(f"{title}: {section_title}")
            overview = "Hier erscheinen die aktuellen Beiträge und Spielberichte der Pool-Billard-Liga Münster.\n\n{% include post-list.html %}\n"
            write_page(f"{wp_slug}.md", title, f"/{wp_slug}/", f"Aktuelle Inhalte aus der Pool-Billard-Liga Münster.", overview)
            page_summaries.append(f"{title} -> /{wp_slug}/ plus Beiträge")
            continue

        slug = PAGE_SLUG_OVERRIDES.get(wp_slug, wp_slug)
        filename = "index.md" if slug == "" else f"{slug}.md"
        permalink = "/" if slug == "" else f"/{slug}/"
        body = convert_html(raw_html, asset_map)
        description = strip_tags(page["excerpt"]["rendered"])[:180] if page.get("excerpt") else ""
        write_page(filename, title, permalink, description, body, layout="home" if slug == "" else None)
        page_summaries.append(f"{title} -> {permalink}")

    if not (PAGES_DIR / "datenschutz.md").exists():
        write_page(
            "datenschutz.md",
            "Datenschutz",
            "/datenschutz/",
            "Datenschutzhinweise der Pool-Billard-Liga Münster.",
            (
                "Diese statische Website speichert keine Formulardaten und nutzt keine eigene Datenbank.\n\n"
                "Beim Aufruf der Website verarbeitet der Hosting-Anbieter technische Zugriffsdaten, "
                "die für den Betrieb der Website erforderlich sind. Diese Seite wurde im Rahmen der "
                "Migration neu angelegt und muss vor dem Livegang rechtlich geprüft werden.\n"
            ),
        )
        page_summaries.append("Datenschutz -> /datenschutz/ (neu angelegt, prüfen)")

    (ROOT / "MIGRATION_SUMMARY.md").write_text(
        "# Migrationsprotokoll\n\n"
        "## Automatisch migrierte Seiten\n\n"
        + "\n".join(f"- {line}" for line in page_summaries)
        + "\n\n## Automatisch erzeugte Beiträge\n\n"
        + ("\n".join(f"- {line}" for line in post_summaries) if post_summaries else "- Keine Beiträge erzeugt")
        + "\n\n## Quellen\n\n"
        f"- WordPress REST API: `{API}`\n"
        f"- WordPress Sitemap: `{SOURCE}/wp-sitemap.xml`\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    migrate()
