"""Rewrite repository-relative Markdown links for the generated documentation site."""

from __future__ import annotations

from functools import lru_cache
from html import escape
import re
from pathlib import Path
import subprocess
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


_MARKDOWN_LINK = re.compile(
    r"(?P<prefix>!?\[[^\]]*\]\()"
    r"(?P<target>[^\s)]+)"
    r"(?P<suffix>(?:\s+[\"'][^\"']*[\"'])?\))"
)
_SKIPPED_SCHEMES = {"data", "http", "https", "mailto", "tel"}


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


@lru_cache(maxsize=None)
def _git_object_kind(repo_root: Path, source_ref: str, relative_path: str) -> str:
    result = subprocess.run(
        ["git", "cat-file", "-t", f"{source_ref}:{relative_path}"],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Documentation source target is not present at source ref "
            f"{source_ref}: {relative_path}"
        )
    object_kind = result.stdout.strip()
    if object_kind not in {"blob", "tree"}:
        raise RuntimeError(
            f"Unsupported Git object at source ref {source_ref}: "
            f"{relative_path} ({object_kind})"
        )
    return object_kind


def rewrite_repo_links(
    markdown: str,
    *,
    source_path: Path,
    docs_dir: Path,
    repo_root: Path,
    repo_url: str,
    source_ref: str,
) -> str:
    """Turn links escaping ``docs_dir`` into immutable GitHub source links."""

    source_dir = source_path.resolve().parent
    docs_root = docs_dir.resolve()
    repository_root = repo_root.resolve()

    def replace(match: re.Match[str]) -> str:
        target = match.group("target")
        parsed = urlsplit(target)
        if (
            not parsed.path
            or parsed.scheme.lower() in _SKIPPED_SCHEMES
            or parsed.netloc
            or target.startswith(("#", "/"))
        ):
            return match.group(0)

        candidate = (source_dir / parsed.path).resolve()
        if _is_within(candidate, docs_root):
            return match.group(0)
        if not _is_within(candidate, repository_root):
            raise RuntimeError(
                f"Documentation link escapes the repository: {source_path}: {target}"
            )
        relative = candidate.relative_to(repository_root)
        object_kind = _git_object_kind(
            repository_root, source_ref, relative.as_posix()
        )
        github_path = quote(relative.as_posix(), safe="/")
        rewritten = f"{repo_url.rstrip('/')}/{object_kind}/{source_ref}/{github_path}"
        rewritten = urlunsplit(("https", urlsplit(rewritten).netloc, urlsplit(rewritten).path, parsed.query, parsed.fragment))
        return f"{match.group('prefix')}{rewritten}{match.group('suffix')}"

    return _MARKDOWN_LINK.sub(replace, markdown)


def on_page_markdown(markdown, page, config, files):
    """MkDocs hook entry point."""

    del files
    config_path = Path(config.config_file_path).resolve()
    return rewrite_repo_links(
        markdown,
        source_path=Path(page.file.abs_src_path),
        docs_dir=Path(config.docs_dir),
        repo_root=config_path.parent,
        repo_url=config.repo_url,
        source_ref=config.extra["source_ref"],
    )


def on_post_page(output_content, page, config):
    """Add a branded social preview to the site root without changing content pages."""

    if page.file.src_path != "index.md":
        return output_content

    image_url = urljoin(config.site_url, "assets/social-card.png")
    title = escape(config.site_name, quote=True)
    description = escape(config.site_description, quote=True)
    canonical_url = escape(config.site_url, quote=True)
    image_url = escape(image_url, quote=True)
    tags = f"""
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{title}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:url" content="{canonical_url}">
    <meta property="og:image" content="{image_url}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="BuildingAgent Developer Documentation">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{description}">
    <meta name="twitter:image" content="{image_url}">
    """.strip()
    if "</head>" not in output_content:
        raise RuntimeError("MkDocs root page has no closing head element")
    return output_content.replace("</head>", f"{tags}\n</head>", 1)
