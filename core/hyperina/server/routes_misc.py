"""Погода (Open-Meteo), календарь (vdir/ICS, совместим с vdirsyncer), заметки (~/Notes),
публичные данные стартовой страницы Chrome."""
from __future__ import annotations

import asyncio
import datetime as dt
import re
import time
import uuid

import aiohttp
from aiohttp import web

from .. import config, desktop, paths, util
from .app import json_err, json_ok

WEATHER_FILE = paths.STATE_DIR / "weather.json"
CAL_DIR = paths.DATA_DIR / "calendar"
NOTES_DIR = paths.HOME / "Notes"

# WMO-коды погоды → (подпись, пиктограмма)
WMO = {0: ("ясно", "sun"), 1: ("почти ясно", "sun"), 2: ("переменная облачность", "cloud"), 3: ("пасмурно", "cloud"),
       45: ("туман", "cloud"), 48: ("изморозь", "cloud"), 51: ("морось", "cloud"), 53: ("морось", "cloud"),
       55: ("сильная морось", "cloud"), 61: ("небольшой дождь", "cloud"), 63: ("дождь", "cloud"),
       65: ("ливень", "cloud"), 66: ("ледяной дождь", "cloud"), 67: ("ледяной дождь", "cloud"),
       71: ("небольшой снег", "cloud"), 73: ("снег", "cloud"), 75: ("сильный снег", "cloud"), 77: ("снежная крупа", "cloud"),
       80: ("ливни", "cloud"), 81: ("ливни", "cloud"), 82: ("сильные ливни", "cloud"), 85: ("снегопад", "cloud"),
       86: ("сильный снегопад", "cloud"), 95: ("гроза", "bolt"), 96: ("гроза с градом", "bolt"), 99: ("гроза с градом", "bolt")}
WMO_EN = {0: "CLEAR", 1: "MOSTLY CLEAR", 2: "PARTLY CLOUDY", 3: "OVERCAST", 45: "FOG", 48: "RIME FOG", 51: "DRIZZLE",
          53: "DRIZZLE", 55: "HEAVY DRIZZLE", 61: "LIGHT RAIN", 63: "RAIN", 65: "HEAVY RAIN", 66: "FREEZING RAIN",
          67: "FREEZING RAIN", 71: "LIGHT SNOW", 73: "SNOW", 75: "HEAVY SNOW", 77: "SNOW GRAINS", 80: "SHOWERS",
          81: "SHOWERS", 82: "VIOLENT SHOWERS", 85: "SNOW SHOWERS", 86: "SNOW SHOWERS", 95: "THUNDERSTORM",
          96: "THUNDERSTORM + HAIL", 99: "THUNDERSTORM + HAIL"}


# ── погода ───────────────────────────────────────────────────────
class Weather:
    def __init__(self, core) -> None:
        self.core = core
        self.data = util.load_json(WEATHER_FILE, None)
        self._lock = asyncio.Lock()

    async def _get(self, url: str, params: dict) -> dict:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url, params=params) as r:
                return await r.json()

    async def fetch(self, force: bool = False) -> dict | None:
        city = config.get("locale.weather_city", "Berlin")
        async with self._lock:
            if self.data and not force and self.data.get("city") == city and time.time() - self.data.get("ts", 0) < 900:
                return self.data
            try:
                lang = config.get("locale.ui_language", "ru")
                geo = await self._get("https://geocoding-api.open-meteo.com/v1/search",
                                      {"name": city, "count": 1, "language": lang, "format": "json"})
                loc = (geo.get("results") or [None])[0]
                if not loc:
                    return self.data
                fc = await self._get("https://api.open-meteo.com/v1/forecast", {
                    "latitude": loc["latitude"], "longitude": loc["longitude"], "timezone": "auto", "forecast_days": 7,
                    "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,"
                               "wind_direction_10m,is_day,precipitation,pressure_msl,uv_index",
                    "hourly": "temperature_2m,precipitation_probability,weather_code",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,"
                             "sunrise,sunset,uv_index_max",
                })
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, KeyError):
                return self.data
            cur = fc.get("current", {})
            code = int(cur.get("weather_code", 0))
            self.data = {
                "ts": int(time.time()), "city": city, "place": loc.get("name", city), "country": loc.get("country", ""),
                "lat": loc["latitude"], "lon": loc["longitude"], "timezone": fc.get("timezone", ""),
                "current": {**cur, "label": WMO.get(code, ("", ""))[0], "label_en": WMO_EN.get(code, ""),
                            "glyph": WMO.get(code, ("", "cloud"))[1]},
                "hourly": fc.get("hourly", {}), "daily": fc.get("daily", {}),
            }
            util.write_json(WEATHER_FILE, self.data)
            self.core.hub.publish("weather", self.summary())
            return self.data

    def summary(self) -> dict:
        d = self.data or {}
        c = d.get("current", {})
        return {"place": d.get("place", ""), "temp": c.get("temperature_2m"), "feels": c.get("apparent_temperature"),
                "label": c.get("label", ""), "label_en": c.get("label_en", ""), "glyph": c.get("glyph", "cloud"),
                "is_day": c.get("is_day", 1), "ts": d.get("ts", 0)}

    async def run(self) -> None:
        await asyncio.sleep(8)
        while True:
            await self.fetch()
            await asyncio.sleep(900)


# ── календарь: vdir (каталог .ics на событие) ────────────────────
def _ics_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_unescape(s: str) -> str:
    return s.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _parse_dt(value: str, params: str) -> tuple[dt.datetime, bool]:
    if "VALUE=DATE" in params or re.fullmatch(r"\d{8}", value):
        return dt.datetime.strptime(value[:8], "%Y%m%d"), True
    utc = value.endswith("Z")
    t = dt.datetime.strptime(value.rstrip("Z")[:15], "%Y%m%dT%H%M%S")
    if utc:
        t = t.replace(tzinfo=dt.timezone.utc).astimezone().replace(tzinfo=None)
    return t, False


def parse_ics(text: str) -> list[dict]:
    lines: list[str] = []
    for raw in text.splitlines():
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    events, cur = [], None
    for ln in lines:
        if ln == "BEGIN:VEVENT":
            cur = {}
        elif ln == "END:VEVENT" and cur is not None:
            events.append(cur)
            cur = None
        elif cur is not None and ":" in ln:
            key, _, val = ln.partition(":")
            name, _, params = key.partition(";")
            if name in ("DTSTART", "DTEND"):
                t, allday = _parse_dt(val, params)
                cur[name.lower()] = t
                cur["allday"] = allday
            elif name in ("SUMMARY", "LOCATION", "DESCRIPTION", "UID", "RRULE", "CATEGORIES"):
                cur[name.lower()] = _ics_unescape(val)
    return events


def expand(ev: dict, start: dt.datetime, end: dt.datetime) -> list[tuple[dt.datetime, dt.datetime]]:
    s = ev.get("dtstart")
    if not s:
        return []
    e = ev.get("dtend") or (s + (dt.timedelta(days=1) if ev.get("allday") else dt.timedelta(hours=1)))
    dur = e - s
    if not ev.get("rrule"):
        return [(s, e)] if s < end and e > start else []
    try:
        from dateutil.rrule import rrulestr
        rule = rrulestr(ev["rrule"], dtstart=s)
        return [(o, o + dur) for o in rule.between(start - dur, end, inc=True)][:500]
    except (ImportError, ValueError):
        return [(s, e)] if s < end and e > start else []


def calendars() -> list[dict]:
    CAL_DIR.mkdir(parents=True, exist_ok=True)
    if not any(CAL_DIR.iterdir()):
        (CAL_DIR / "personal").mkdir()
        (CAL_DIR / "personal/displayname").write_text("Личный")
        (CAL_DIR / "personal/color").write_text("#E0A243")
    out = []
    for d in sorted(p for p in CAL_DIR.iterdir() if p.is_dir()):
        out.append({"id": d.name, "name": util.read(d / "displayname") or d.name,
                    "color": util.read(d / "color") or "#5FA8A0", "count": len(list(d.glob("*.ics")))})
    return out


def write_event(cal: str, data: dict) -> dict:
    d = CAL_DIR / re.sub(r"[^\w\-]", "", cal or "personal")
    d.mkdir(parents=True, exist_ok=True)
    uid = data.get("uid") or f"{uuid.uuid4()}@hyperina"
    allday = bool(data.get("allday"))
    st = dt.datetime.fromisoformat(data["start"])
    en = dt.datetime.fromisoformat(data["end"]) if data.get("end") else st + (dt.timedelta(days=1) if allday else dt.timedelta(hours=1))
    fmt = (lambda t: t.strftime("%Y%m%d")) if allday else (lambda t: t.strftime("%Y%m%dT%H%M%S"))
    p = ";VALUE=DATE" if allday else ""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HYPERINA//Calendar//RU", "BEGIN:VEVENT", f"UID:{uid}",
             f"DTSTAMP:{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
             f"DTSTART{p}:{fmt(st)}", f"DTEND{p}:{fmt(en)}", f"SUMMARY:{_ics_escape(str(data.get('summary', 'Событие')))}"]
    for k in ("location", "description"):
        if data.get(k):
            lines.append(f"{k.upper()}:{_ics_escape(str(data[k]))}")
    if data.get("rrule") and re.fullmatch(r"[A-Z0-9=;,:\-]+", str(data["rrule"])):
        lines.append(f"RRULE:{data['rrule']}")
    if data.get("alarm_minutes"):
        lines += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Напоминание",
                  f"TRIGGER:-PT{int(data['alarm_minutes'])}M", "END:VALARM"]
    lines += ["END:VEVENT", "END:VCALENDAR", ""]
    safe = re.sub(r"[^\w@.\-]", "_", uid)
    (d / f"{safe}.ics").write_text("\r\n".join(lines))
    return {"uid": uid, "calendar": d.name}


def list_events(start: dt.datetime, end: dt.datetime) -> list[dict]:
    out = []
    for cal in calendars():
        for f in (CAL_DIR / cal["id"]).glob("*.ics"):
            try:
                evs = parse_ics(f.read_text(errors="ignore"))
            except (OSError, ValueError):
                continue
            for ev in evs:
                for s, e in expand(ev, start, end):
                    out.append({"uid": ev.get("uid", f.stem), "file": f.name, "calendar": cal["id"],
                                "color": cal["color"], "summary": ev.get("summary", ""), "location": ev.get("location", ""),
                                "description": ev.get("description", ""), "allday": ev.get("allday", False),
                                "start": s.isoformat(), "end": e.isoformat(), "recurring": bool(ev.get("rrule"))})
    out.sort(key=lambda x: x["start"])
    return out


def setup(app: web.Application) -> None:
    r = app.router
    core = app["core"]
    weather = Weather(core)
    app["weather"] = weather

    async def on_start(_app):
        asyncio.create_task(weather.run())
        asyncio.create_task(reminders())

    app.on_startup.append(on_start)

    async def body(req) -> dict:
        try:
            b = await req.json()
            return b if isinstance(b, dict) else {}
        except ValueError:
            return {}

    async def weather_get(req):
        d = await weather.fetch(force=req.query.get("refresh") == "1")
        return json_ok({"weather": d}) if d else json_err("нет данных о погоде (нет сети?)", 503)

    async def weather_public(_req):
        if not weather.data:
            await weather.fetch()
        return web.json_response(weather.summary())

    r.add_get("/api/weather", weather_get)
    r.add_get("/api/public/weather", weather_public)

    # ── календарь ──────────────────────────────────────────────
    async def cal_list(_req):
        return json_ok({"calendars": await asyncio.to_thread(calendars)})

    async def cal_events(req):
        try:
            start = dt.datetime.fromisoformat(req.query["from"])
            end = dt.datetime.fromisoformat(req.query["to"])
        except (KeyError, ValueError):
            today = dt.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            start, end = today, today + dt.timedelta(days=31)
        return json_ok({"events": await asyncio.to_thread(list_events, start, end)})

    async def cal_write(req):
        b = await body(req)
        if not b.get("start"):
            return json_err("нужно начало события (start)")
        res = await asyncio.to_thread(write_event, str(b.get("calendar", "personal")), b)
        core.events.add("info", f"CALENDAR // {str(b.get('summary', 'EVENT'))[:40].upper()} SCHEDULED")
        return json_ok(res)

    async def cal_delete(req):
        cal = re.sub(r"[^\w\-]", "", req.query.get("calendar", "personal"))
        name = re.sub(r"[^\w@.\-]", "_", req.query.get("file", ""))
        f = CAL_DIR / cal / name
        if f.suffix == ".ics" and f.exists():
            f.unlink()
            return json_ok()
        return json_err("событие не найдено", 404)

    async def cal_sync(_req):
        if not util.which("vdirsyncer"):
            return json_err("vdirsyncer не установлен")
        rc, out, err = await util.arun(["vdirsyncer", "sync"], 180)
        return json_ok({"log": (out + err)[-2000:]}) if rc == 0 else json_err((err or out)[-500:])

    async def reminders() -> None:
        """Напоминания о событиях за 10 минут (и по VALARM в будущем)."""
        warned: set[str] = set()
        while True:
            now = dt.datetime.now()
            try:
                for e in await asyncio.to_thread(list_events, now, now + dt.timedelta(minutes=11)):
                    key = e["uid"] + e["start"]
                    if e["allday"] or key in warned:
                        continue
                    if dt.datetime.fromisoformat(e["start"]) - now <= dt.timedelta(minutes=10):
                        warned.add(key)
                        util.notify(f"Скоро: {e['summary']}", f"{e['start'][11:16]} {e['location']}".strip(),
                                    icon="hyperina-calendar")
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(60)

    r.add_get("/api/calendar/list", cal_list)
    r.add_get("/api/calendar", cal_events)
    r.add_post("/api/calendar", cal_write)
    r.add_delete("/api/calendar", cal_delete)
    r.add_post("/api/calendar/sync", cal_sync)

    # ── заметки: обычные .md в ~/Notes (совместимо с Obsidian) ───
    async def notes_list(_req):
        NOTES_DIR.mkdir(parents=True, exist_ok=True)
        items = []
        for f in sorted(NOTES_DIR.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:500]:
            if any(part.startswith(".") for part in f.relative_to(NOTES_DIR).parts):
                continue
            head = f.read_text(errors="ignore")[:600]
            title = next((ln.lstrip("# ").strip() for ln in head.splitlines() if ln.strip()), f.stem)
            items.append({"path": str(f), "name": str(f.relative_to(NOTES_DIR)), "title": title[:80],
                          "preview": re.sub(r"\s+", " ", head)[:160], "mtime": int(f.stat().st_mtime)})
        return json_ok({"notes": items, "dir": str(NOTES_DIR)})

    async def notes_quick(req):
        b = await body(req)
        text = str(b.get("text", "")).strip()
        if not text:
            return json_err("пустая заметка")
        NOTES_DIR.mkdir(parents=True, exist_ok=True)
        inbox = NOTES_DIR / "Входящие.md"
        stamp = time.strftime("%Y-%m-%d %H:%M")
        with open(inbox, "a", encoding="utf-8") as f:
            if inbox.stat().st_size == 0:
                f.write("# Входящие\n")
            f.write(f"\n- [{stamp}] {text}\n")
        return json_ok({"path": str(inbox)})

    r.add_get("/api/notes", notes_list)
    r.add_post("/api/notes/quick", notes_quick)

    # ── стартовая страница Chrome ───────────────────────────────
    async def newtab_data(_req):
        apps = [a for a in await asyncio.to_thread(desktop.entries, True) if a["web"] and "sparkasse" not in a["id"]]
        tiles = []
        for a in apps:
            m = re.search(r"--app=(\S+)", a["exec"])
            if m:
                tiles.append({"name": a["name"], "url": m.group(1), "icon": f"/newtab/icon/{a['id']}.svg"})
        lang = config.get("locale.ui_language", "ru")
        return web.json_response({"tiles": tiles[:16], "lang": lang, "weather": weather.summary(),
                                  "theme": util.load_json(paths.RUNTIME_DIR / "theme.json", {}).get("colors", {})})

    async def newtab_icon(req):
        name = re.sub(r"[^\w.\-]", "", req.match_info["name"])
        f = paths.XDG_DATA / "icons/HYPERINA/scalable/apps" / name
        if not f.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(f)

    r.add_get("/api/public/newtab", newtab_data)
    r.add_get("/newtab/icon/{name}", newtab_icon)
