import sys, pathlib
backend = pathlib.Path(__file__).resolve().parents[1] / "backend"
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))
from backend.pytest import *  # noqa: F401,F403
