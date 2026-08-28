from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.docs.check_built_site import check_site


class BuiltSiteCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.temp_root = Path(self.temp_directory.name)
        self.site_dir = self.temp_root / "site"
        (self.site_dir / "guide").mkdir(parents=True)
        (self.site_dir / "assets").mkdir()
        (self.site_dir / "assets" / "site.css").touch()

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def test_accepts_relative_and_site_base_links(self) -> None:
        (self.site_dir / "index.html").write_text(
            '<a href="/BuildingAgent/guide/">Guide</a>', encoding="utf-8"
        )
        (self.site_dir / "guide" / "index.html").write_text(
            '<a href="..">Home</a><link href="../assets/site.css">',
            encoding="utf-8",
        )

        self.assertEqual(check_site(self.site_dir, "BuildingAgent"), [])

    def test_reports_missing_local_target(self) -> None:
        (self.site_dir / "index.html").write_text(
            '<img src="assets/missing.png">', encoding="utf-8"
        )

        failures = check_site(self.site_dir, "BuildingAgent")
        self.assertEqual(len(failures), 1)
        self.assertIn("missing target", failures[0])

    def test_reports_absolute_path_outside_site_base(self) -> None:
        (self.site_dir / "index.html").write_text(
            '<a href="/other-project/">Other</a>', encoding="utf-8"
        )

        failures = check_site(self.site_dir, "BuildingAgent")
        self.assertEqual(len(failures), 1)
        self.assertIn("escapes site base", failures[0])

    def test_rejects_missing_or_empty_site(self) -> None:
        missing = self.site_dir / "missing"
        self.assertIn("does not exist", check_site(missing, "BuildingAgent")[0])
        self.assertIn(
            "site root is missing", check_site(self.site_dir, "BuildingAgent")[0]
        )

    def test_rejects_percent_encoded_path_traversal(self) -> None:
        (self.temp_root / "outside.txt").touch()
        (self.site_dir / "index.html").write_text(
            '<a href="/BuildingAgent/%2e%2e/outside.txt">Outside</a>',
            encoding="utf-8",
        )

        failures = check_site(self.site_dir, "BuildingAgent")
        self.assertEqual(len(failures), 1)
        self.assertIn("escapes site root", failures[0])


if __name__ == "__main__":
    unittest.main()
