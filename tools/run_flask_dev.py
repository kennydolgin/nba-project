import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ROOT / ".vercel_test_packages"
sys.path.insert(0, str(ROOT))
if PACKAGES.exists():
    sys.path.insert(0, str(PACKAGES))

from app import app


if __name__ == "__main__":
    app.run(debug=False, port=5001)
