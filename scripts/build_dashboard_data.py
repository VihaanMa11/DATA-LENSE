from __future__ import annotations

import argparse
import json
from pathlib import Path

import generate_mis_dashboard as dashboard


def main() -> None:
    parser = argparse.ArgumentParser(description="Build dashboard JSON from CSV/XLSX exports.")
    parser.add_argument(
        "--source",
        default=str(dashboard.BASE),
        help="Folder containing the accounting CSV/XLSX source files.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional JSON file to write instead of printing to stdout.",
    )
    args = parser.parse_args()

    dashboard.BASE = Path(args.source)
    data = dashboard.build_data()
    data["sourceDir"] = str(dashboard.BASE)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
