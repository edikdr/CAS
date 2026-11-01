"""Запуск: python -m haotica.server (служба haotica-core.service)."""
from __future__ import annotations

import logging
import os
import sys

from aiohttp import web

from .. import paths
from .app import create_app
from .core import Core


def main() -> int:
    paths.ensure_dirs()
    logging.basicConfig(
        level=logging.DEBUG if os.environ.get("HAOTICA_DEBUG") else logging.INFO,
        format="%(asctime)s %(levelname).1s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stderr),
                  logging.FileHandler(paths.LOG_DIR / "core.log", encoding="utf-8")],
    )
    for noisy in ("aiohttp.access",):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    app = create_app(Core())
    web.run_app(app, host=paths.HOST, port=paths.PORT_CORE, print=None, access_log=None,
                handle_signals=True, shutdown_timeout=3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
