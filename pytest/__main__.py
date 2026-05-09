import sys, pathlib
backend = pathlib.Path(__file__).resolve().parents[1] / "backend"
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))
from backend.pytest.__main__ import main
raise SystemExit(main())
