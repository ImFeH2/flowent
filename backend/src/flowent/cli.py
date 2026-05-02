from __future__ import annotations

import argparse
import os
import sys

APP_DATA_DIR_ENV_VAR = "FLOWENT_APP_DATA_DIR"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="flowent",
        description="Flowent — multi-agent collaboration framework",
    )
    subparsers = parser.add_subparsers(dest="command")
    access_parser = subparsers.add_parser("access", help="Flowent access commands")
    access_subparsers = access_parser.add_subparsers(dest="access_command")
    access_subparsers.add_parser(
        "refresh",
        help="Generate and persist a new admin access code",
    )
    access_subparsers.add_parser("reset", help="Clear the persisted admin access code")
    parser.add_argument(
        "--host",
        default=os.environ.get("HOSTNAME") or "127.0.0.1",
        help="Bind host (default: $HOSTNAME or 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT") or "6873"),
        help="Bind port (default: $PORT or 6873)",
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show version and exit",
    )
    parser.add_argument(
        "--app-data-dir",
        default="",
        help="Override the Flowent app data directory for this process",
    )
    args = parser.parse_args(argv)

    if isinstance(args.app_data_dir, str) and args.app_data_dir.strip():
        os.environ[APP_DATA_DIR_ENV_VAR] = args.app_data_dir.strip()

    if args.command == "access" and args.access_command == "refresh":
        from flowent.access import refresh_local_access

        print(refresh_local_access())
        return

    if args.command == "access" and args.access_command == "reset":
        from flowent.access import reset_local_access

        print(reset_local_access())
        return

    if args.version:
        try:
            from importlib.metadata import version

            ver = version("flowent")
        except Exception:
            from flowent._version import __version__ as ver

        print(f"flowent {ver}")
        sys.exit(0)

    import uvicorn

    uvicorn.run(
        "flowent.main:app",
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
