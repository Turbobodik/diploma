"""Export validated OpenAPI 3.1 specification (YAML & JSON) from FastAPI."""

import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from openapi_spec_validator import validate  # noqa: E402
import yaml  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    spec = app.openapi()
    spec["servers"] = [
        {"url": "http://127.0.0.1:8000", "description": "Local development server"},
        {"url": "https://api.factmap-scholar.example.com", "description": "Production / cloud demo host"},
    ]
    validate(spec)

    out_dir = REPO_ROOT / "docs" / "api"
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "openapi.json"
    yaml_path = out_dir / "openapi.yaml"

    json_path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    yaml_path.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"Validated and exported OpenAPI {spec.get('openapi')} to {yaml_path} and {json_path}")


if __name__ == "__main__":
    main()
