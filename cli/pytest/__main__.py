import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
repo = root.parent
for path in (repo, repo / "backend", root):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from backend.pytest.__main__ import main

raise SystemExit(main())
