"""Адаптеры роутера (FRITZ!Box TR-064, OpenWrt ubus, MikroTik REST) — пока заглушка.

Изменения роутера всегда идут через карточку подтверждения и после резервной копии конфигурации
(см. tools.t_router_action). Пока адаптер не настроен, инструменты честно отвечают «не подключён».
"""
from __future__ import annotations

from .. import config


class Adapter:
    kind = "none"

    async def status(self) -> dict:
        return {"error": "адаптер роутера ещё не реализован"}

    async def backup(self):
        return None

    async def action(self, name: str, params: dict) -> dict:
        return {"ok": False, "error": "адаптер роутера ещё не реализован"}


async def adapter() -> Adapter | None:
    r = config.get("network.router", {}) or {}
    if not r.get("kind") or r.get("kind") == "none":
        return None
    return Adapter()
