from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="autopoe",
        description="Autopoe — multi-agent collaboration framework",
    )
    subparsers = parser.add_subparsers(dest="command")
    access_parser = subparsers.add_parser("access", help="Autopoe access commands")
    access_subparsers = access_parser.add_subparsers(dest="access_command")
    access_subparsers.add_parser(
        "refresh",
        help="Generate and persist a new admin access code",
    )
    access_subparsers.add_parser("reset", help="Clear the persisted admin access code")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=6873,
        help="Bind port (default: 6873)",
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show version and exit",
    )
    args = parser.parse_args(argv)

    if args.command == "access" and args.access_command == "refresh":
        from app.access import refresh_local_access

        print(refresh_local_access())
        return

    if args.command == "access" and args.access_command == "reset":
        from app.access import reset_local_access

        print(reset_local_access())
        return

    if args.version:
        try:
            from importlib.metadata import version

            ver = version("autopoe")
        except Exception:
            from app._version import __version__ as ver

        print(f"autopoe {ver}")
        sys.exit(0)

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
