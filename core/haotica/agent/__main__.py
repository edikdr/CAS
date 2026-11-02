"""Запуск: python -m haotica.agent (служба haotica-agent.service)."""
from __future__ import annotations

import logging
import os
import sys

from aiohttp import web

from .. import paths
from .server import create_app


def main() -> int:
    paths.ensure_dirs()
    logging.basicConfig(
        level=logging.DEBUG if os.environ.get("HAOTICA_DEBUG") else logging.INFO,
        format="%(asctime)s %(levelname).1s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stderr),
                  logging.FileHandler(paths.LOG_DIR / "agent.log", encoding="utf-8")],
    )
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    web.run_app(create_app(), host=paths.HOST, port=int(os.environ.get("HAOTICA_AGENT_PORT", paths.PORT_HAOTICA)),
                print=None, access_log=None, handle_signals=True, shutdown_timeout=3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
