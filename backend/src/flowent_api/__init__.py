from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "flowent_api.main:app",
        host=os.environ.get("HOSTNAME", "0.0.0.0"),
        port=int(os.environ.get("PORT", "6873")),
    )
