from __future__ import annotations

import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from scripts.docs.mkdocs_repo_links import on_post_page, rewrite_repo_links


class RepositoryLinkRewriteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_directory.name)
        self.docs_dir = self.repo_root / "docs"
        self.page = self.docs_dir / "developer" / "en" / "page.md"
        self.asset = self.docs_dir / "assets" / "diagram.svg"
        self.source = self.repo_root / "apps" / "api" / "src" / "server.ts"
        self.source.parent.mkdir(parents=True)
        self.page.parent.mkdir(parents=True)
        self.asset.parent.mkdir(parents=True)
        self.page.touch()
        self.asset.touch()
        self.source.touch()
        subprocess.run(["git", "init", "-q"], cwd=self.repo_root, check=True)
        subprocess.run(
            ["git", "config", "user.email", "docs-test@example.test"],
            cwd=self.repo_root,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Documentation Test"],
            cwd=self.repo_root,
            check=True,
        )
        subprocess.run(["git", "add", "."], cwd=self.repo_root, check=True)
        subprocess.run(
            ["git", "commit", "-qm", "test fixture"],
            cwd=self.repo_root,
            check=True,
        )
        self.source_ref = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def rewrite(self, markdown: str) -> str:
        return rewrite_repo_links(
            markdown,
            source_path=self.page,
            docs_dir=self.docs_dir,
            repo_root=self.repo_root,
            repo_url="https://github.com/example/project",
            source_ref=self.source_ref,
        )

    def test_rewrites_repository_source_file_and_preserves_fragment(self) -> None:
        actual = self.rewrite(
            "[server](../../../apps/api/src/server.ts#handler)"
        )
        self.assertEqual(
            actual,
            f"[server](https://github.com/example/project/blob/{self.source_ref}/"
            "apps/api/src/server.ts#handler)",
        )

    def test_preserves_document_asset_and_external_link(self) -> None:
        markdown = (
            "![diagram](../../assets/diagram.svg) "
            "[remote](https://example.com/reference)"
        )
        self.assertEqual(self.rewrite(markdown), markdown)

    def test_rewrites_repository_directory_as_tree(self) -> None:
        actual = self.rewrite("[API](../../../apps/api/)")
        self.assertEqual(
            actual,
            f"[API](https://github.com/example/project/tree/{self.source_ref}/apps/api)",
        )

    def test_rejects_missing_repository_target(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "not present at source ref"):
            self.rewrite("[missing](../../../apps/missing.ts)")

    def test_current_docs_have_no_unhandled_repo_relative_links(self) -> None:
        repository_root = Path(__file__).resolve().parents[2]
        docs_dir = repository_root / "docs"
        unresolved = []

        for source_path in sorted(docs_dir.rglob("*.md")):
            rewritten = rewrite_repo_links(
                source_path.read_text(encoding="utf-8"),
                source_path=source_path,
                docs_dir=docs_dir,
                repo_root=repository_root,
                repo_url="https://github.com/LiMingchen159/BuildingAgent",
                source_ref="af44ff1533421397eae57e0750d5b20b070576ae",
            )
            for target in re.findall(r"!?\[[^\]]*\]\(([^\s)]+)", rewritten):
                if target.startswith(("http://", "https://", "mailto:", "#", "/")):
                    continue
                candidate = (source_path.parent / url_path(target)).resolve()
                if not candidate.is_relative_to(docs_dir.resolve()):
                    unresolved.append(f"{source_path}: {target}")

        self.assertEqual(unresolved, [])

    def test_adds_social_metadata_only_to_site_root(self) -> None:
        config = SimpleNamespace(
            site_url="https://example.com/BuildingAgent/",
            site_name="BuildingAgent Developer Documentation",
            site_description="Bilingual developer documentation.",
        )
        root_page = SimpleNamespace(file=SimpleNamespace(src_path="index.md"))
        detail_page = SimpleNamespace(
            file=SimpleNamespace(src_path="developer/en/README.md")
        )
        html = "<html><head></head><body></body></html>"

        root_html = on_post_page(html, root_page, config)
        self.assertIn('property="og:image"', root_html)
        self.assertIn(
            "https://example.com/BuildingAgent/assets/social-card.png", root_html
        )
        self.assertEqual(on_post_page(html, detail_page, config), html)


def url_path(target: str) -> str:
    return target.split("#", 1)[0].split("?", 1)[0]


if __name__ == "__main__":
    unittest.main()
