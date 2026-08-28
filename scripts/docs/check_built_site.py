"""Fail when generated documentation contains a broken local link or asset."""

from __future__ import annotations

import argparse
import posixpath
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.targets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attribute = "href" if tag in {"a", "link"} else "src" if tag in {"img", "script"} else None
        if attribute is None:
            return
        values = dict(attrs)
        if values.get(attribute):
            self.targets.append(values[attribute] or "")


def generated_url(html_path: Path, site_dir: Path, base_path: str) -> str:
    relative = html_path.relative_to(site_dir).as_posix()
    if relative == "index.html":
        return base_path
    if relative.endswith("/index.html"):
        return f"{base_path}{relative[:-10]}"
    return f"{base_path}{relative}"


def check_site(site_dir: Path, base_path: str) -> list[str]:
    site_root = site_dir.resolve()
    normalized_base = f"/{base_path.strip('/')}/"
    failures: list[str] = []
    if not site_root.is_dir():
        return [f"Site directory does not exist: {site_root}"]
    if not (site_root / "index.html").is_file():
        return [f"Generated site root is missing: {site_root / 'index.html'}"]

    html_paths = sorted(site_root.rglob("*.html"))
    if not html_paths:
        return [f"Generated site contains no HTML pages: {site_root}"]

    for html_path in html_paths:
        parser = LinkCollector()
        parser.feed(html_path.read_text(encoding="utf-8"))
        page_url = generated_url(html_path, site_root, normalized_base)

        for raw_target in parser.targets:
            parsed = urlsplit(raw_target)
            if parsed.scheme or parsed.netloc or raw_target.startswith(("#", "data:")):
                continue

            if parsed.path.startswith("/"):
                if parsed.path in {normalized_base.rstrip("/"), normalized_base}:
                    target_url = normalized_base
                elif parsed.path.startswith(normalized_base):
                    target_url = parsed.path
                else:
                    failures.append(f"{html_path}: path escapes site base: {raw_target}")
                    continue
            else:
                target_url = posixpath.normpath(
                    posixpath.join(posixpath.dirname(page_url), parsed.path)
                )
                if target_url == normalized_base.rstrip("/"):
                    target_url = normalized_base
                elif parsed.path.endswith("/"):
                    target_url = f"{target_url}/"

            if not target_url.startswith(normalized_base):
                failures.append(f"{html_path}: path escapes site base: {raw_target}")
                continue

            relative_target = unquote(target_url[len(normalized_base) :])
            candidate = site_root / relative_target
            if not relative_target or target_url.endswith("/"):
                candidate /= "index.html"
            candidate = candidate.resolve()
            try:
                candidate.relative_to(site_root)
            except ValueError:
                failures.append(f"{html_path}: path escapes site root: {raw_target}")
                continue
            if not candidate.exists():
                failures.append(f"{html_path}: missing target: {raw_target}")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("site_dir", nargs="?", default="site")
    parser.add_argument("--base-path", default="BuildingAgent")
    args = parser.parse_args()

    failures = check_site(Path(args.site_dir), args.base_path)
    if failures:
        print("\n".join(failures))
        return 1

    html_count = sum(1 for _ in Path(args.site_dir).rglob("*.html"))
    print(f"Checked {html_count} generated HTML pages; local links and assets resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
