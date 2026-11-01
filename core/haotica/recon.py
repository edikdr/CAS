"""Network Recon: устройства своей локальной сети.

Только своя подсеть (это проверяет и haotica-helper). Быстрый обход ARP по расписанию,
глубокий осмотр одного устройства по запросу (порты, службы, ОС). Новые устройства —
событие «UNKNOWN ENTITY DETECTED» и реплика Haotica.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import socket
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from . import config, helper, paths, util

log = logging.getLogger("haotica.recon")
DB = paths.STATE_DIR / "recon.json"

TYPE_RULES = [  # (регулярка по производителю/имени, тип)
    (r"avm|fritz|speedport|vodafone|tp-?link.*(archer|deco)|netgear|asus.*rt|mikrotik|keenetic|ubiquiti|zyxel|huawei.*(hg|b\d)", "router"),
    (r"apple|iphone|ipad|samsung.*(galaxy|sm-)|xiaomi|oneplus|google.*pixel|oppo|vivo|huawei|honor|motorola", "phone"),
    (r"raspberry|espressif|tuya|shelly|sonoff|philips.*hue|signify|ikea|tado|nuki|homematic", "iot"),
    (r"hp|hewlett|brother|canon|epson|kyocera|lexmark|xerox", "printer"),
    (r"sonos|bose|denon|yamaha|harman|chromecast|roku|lg.*electronics|sony|tcl|hisense|panasonic|nvidia.*shield", "media"),
    (r"nintendo|playstation|xbox|valve", "console"),
    (r"intel|realtek|liteon|azurewave|lenovo|dell|micro-star|asustek|gigabyte|framework", "computer"),
    (r"synology|qnap|western digital|seagate|buffalo", "nas"),
    (r"hikvision|dahua|reolink|axis|arlo|ring|eufy|wyze", "camera"),
]
PORT_TYPES = {9100: "printer", 631: "printer", 554: "camera", 8009: "media", 32400: "media", 1883: "iot",
              5000: "nas", 445: "computer", 3389: "computer", 22: "computer", 62078: "phone"}


def guess_type(dev: dict) -> str:
    text = " ".join(str(dev.get(k, "")) for k in ("vendor", "hostname", "os")).lower()
    for rx, kind in TYPE_RULES:
        if re.search(rx, text):
            return kind
    for p in dev.get("ports", []):
        if p.get("port") in PORT_TYPES:
            return PORT_TYPES[p["port"]]
    return "unknown"


def default_route() -> tuple[str, str]:
    """(интерфейс, шлюз)"""
    try:
        for line in Path("/proc/net/route").read_text().splitlines()[1:]:
            f = line.split()
            if len(f) > 3 and f[1] == "00000000" and int(f[3], 16) & 2:
                gw = socket.inet_ntoa(int(f[2], 16).to_bytes(4, "little"))
                return f[0], gw
    except (OSError, ValueError):
        pass
    return "", ""


def local_net(iface: str) -> tuple[str, ipaddress.IPv4Network | None]:
    r = util.run(["ip", "-j", "-4", "addr", "show", iface], 5)
    try:
        for i in json.loads(r.stdout or "[]"):
            for a in i.get("addr_info", []):
                net = ipaddress.ip_network(f"{a['local']}/{a['prefixlen']}", strict=False)
                if net.prefixlen < 22:          # большие сети — только своя /24
                    net = ipaddress.ip_network(f"{a['local']}/24", strict=False)
                return a["local"], net
    except (ValueError, KeyError):
        pass
    return "", None


def parse_nmap(xml: str) -> list[dict]:
    hosts = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return hosts
    for h in root.findall("host"):
        if h.find("status") is not None and h.find("status").get("state") != "up":
            continue
        d: dict = {"ports": []}
        for a in h.findall("address"):
            if a.get("addrtype") == "ipv4":
                d["ip"] = a.get("addr")
            elif a.get("addrtype") == "mac":
                d["mac"] = (a.get("addr") or "").lower()
                d["vendor"] = a.get("vendor", "")
        hn = h.find("hostnames/hostname")
        if hn is not None:
            d["hostname"] = hn.get("name", "")
        for p in h.findall("ports/port"):
            st = p.find("state")
            if st is None or st.get("state") != "open":
                continue
            sv = p.find("service")
            d["ports"].append({
                "port": int(p.get("portid", 0)), "proto": p.get("protocol", "tcp"),
                "service": sv.get("name", "") if sv is not None else "",
                "product": " ".join(x for x in ((sv.get("product", "") if sv is not None else ""),
                                                (sv.get("version", "") if sv is not None else "")) if x),
            })
        om = h.find("os/osmatch")
        if om is not None:
            d["os"] = om.get("name", "")
            d["os_accuracy"] = int(om.get("accuracy", 0))
        if d.get("ip"):
            hosts.append(d)
    return hosts


async def resolve_name(ip: str) -> str:
    if util.which("avahi-resolve-address"):
        rc, out, _ = await util.arun(["avahi-resolve-address", "-4", ip], 3)
        if rc == 0 and "\t" in out:
            return out.split("\t", 1)[1].strip().removesuffix(".local")
    try:
        name = await asyncio.wait_for(asyncio.to_thread(socket.gethostbyaddr, ip), 2)
        return name[0]
    except (OSError, asyncio.TimeoutError):
        return ""


async def upnp_gateway() -> dict:
    """SSDP-поиск интернет-шлюза: производитель и модель роутера из его описания UPnP."""
    msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\n"
           "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n").encode()
    loop = asyncio.get_running_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setblocking(False)
    location = ""
    try:
        sock.sendto(msg, ("239.255.255.250", 1900))
        end = time.monotonic() + 2.5
        while time.monotonic() < end and not location:
            try:
                data = await asyncio.wait_for(loop.sock_recv(sock, 4096), end - time.monotonic())
            except asyncio.TimeoutError:
                break
            m = re.search(rb"(?im)^location:\s*(\S+)", data)
            if m:
                location = m.group(1).decode()
    except OSError:
        pass
    finally:
        sock.close()
    if not location:
        return {}
    rc, out, _ = await util.arun(["curl", "-s", "--max-time", "3", location], 5)
    info = {"upnp_location": location}
    for tag in ("manufacturer", "modelName", "modelNumber", "friendlyName"):
        m = re.search(rf"<{tag}>([^<]+)</{tag}>", out or "")
        if m:
            info[tag] = m.group(1).strip()
    return info


class Recon:
    def __init__(self, core) -> None:
        self.core = core
        self.db = util.load_json(DB, None) or {"devices": {}, "last_scan": 0}
        self._wake = asyncio.Event()
        self.scanning = False

    def save(self) -> None:
        util.write_json(DB, self.db, 0o600)
        devs = self.db["devices"].values()
        fresh = [d for d in devs if d.get("last_seen", 0) >= self.db.get("last_scan", 0) - 5]
        self.core.metrics.extra["recon_devices"] = len(fresh)
        self.core.metrics.extra["recon_unknown"] = sum(1 for d in fresh if not d.get("known"))
        self.core.hub.publish("recon", self.summary())

    def summary(self) -> dict:
        return {"devices": list(self.db["devices"].values()), "last_scan": self.db.get("last_scan", 0),
                "subnet": self.db.get("subnet", ""), "gateway": self.db.get("gateway", ""),
                "self_ip": self.db.get("self_ip", ""), "scanning": self.scanning,
                "router": self.db.get("router", {})}

    def reschedule(self) -> None:
        self._wake.set()

    async def run(self) -> None:
        await asyncio.sleep(25)                  # дать сети подняться после входа
        while True:
            net = config.get("network", {}) or {}
            interval = max(5, int(net.get("recon_interval_minutes", 15))) * 60
            due = time.time() - self.db.get("last_scan", 0) >= interval
            if net.get("recon", True) and due and not self.core.recon_paused:
                try:
                    await self.sweep()
                except Exception:  # noqa: BLE001
                    log.exception("sweep")
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), 60)
            except asyncio.TimeoutError:
                pass

    async def sweep(self) -> dict:
        if self.scanning:
            return self.summary()
        iface, gw = default_route()
        own_ip, net = local_net(iface) if iface else ("", None)
        if not net:
            return {"ok": False, "error": "нет подключения к локальной сети"}
        self.scanning = True
        self.core.hub.publish("recon", self.summary())
        try:
            r = await helper.call("recon", "sweep", str(net), timeout=200)
        finally:
            self.scanning = False
        if not r.get("ok"):
            self.save()
            return {"ok": False, "error": r.get("error", "скан не удался")}
        hosts = r.get("hosts") or parse_nmap(r.get("xml", ""))
        now = int(time.time())
        devices = self.db["devices"]
        first_run = not devices
        new = []
        for h in hosts:
            key = h.get("mac") or h["ip"]
            d = devices.get(key)
            if d is None:
                d = {"mac": h.get("mac", ""), "first_seen": now, "known": first_run, "label": ""}
                devices[key] = d
                if not first_run:
                    new.append(d)
            d.update({"ip": h["ip"], "last_seen": now})
            if h.get("vendor") and h["vendor"] != "(Unknown)":
                d["vendor"] = h["vendor"]
            if not d.get("hostname"):
                d["hostname"] = await resolve_name(h["ip"])
            d["is_gateway"] = h["ip"] == gw
            d["is_self"] = h["ip"] == own_ip
            d["type"] = "router" if d["is_gateway"] else guess_type(d)
        if own_ip and not any(d.get("is_self") for d in devices.values()):
            devices["self"] = {"ip": own_ip, "mac": "", "hostname": socket.gethostname(), "vendor": "Lenovo",
                               "type": "computer", "is_self": True, "known": True, "first_seen": now,
                               "last_seen": now, "label": "этот ноутбук"}
        self.db.update({"last_scan": now, "subnet": str(net), "gateway": gw, "self_ip": own_ip})
        if not self.db.get("router"):
            self.db["router"] = await upnp_gateway()
        self.save()
        alert = config.get("network.alert_new_devices", True)
        for d in new:
            who = d.get("vendor") or d.get("hostname") or "неизвестное устройство"
            self.core.events.add("security", f"UNKNOWN ENTITY DETECTED // {d['ip']} {who}"[:150],
                                 notify=bool(alert), title="Новое устройство в сети", sound="unknown_device")
        if new:
            await self.core.haotica_call("POST", "/api/event", {"event": "unknown_device", "devices": new[:5]})
        return {"ok": True, "found": len(hosts), "new": len(new)}

    async def probe(self, ip: str) -> dict:
        r = await helper.call("recon", "probe", ip, timeout=200)
        if not r.get("ok"):
            return {"ok": False, "error": r.get("error", "осмотр не удался")}
        hosts = parse_nmap(r.get("xml", ""))
        if not hosts:
            return {"ok": False, "error": "устройство не ответило"}
        h = hosts[0]
        for d in self.db["devices"].values():
            if d.get("ip") == ip:
                d.update({"ports": h.get("ports", []), "os": h.get("os", ""), "os_accuracy": h.get("os_accuracy", 0),
                          "probed": int(time.time())})
                if h.get("vendor"):
                    d["vendor"] = h["vendor"]
                if not d.get("is_gateway"):
                    d["type"] = guess_type(d)
                self.save()
                return {"ok": True, "device": d}
        return {"ok": True, "device": h}

    def label(self, key: str, label: str | None = None, known: bool | None = None) -> dict:
        d = self.db["devices"].get(key)
        if not d:
            return {"ok": False, "error": "нет такого устройства"}
        if label is not None:
            d["label"] = label[:40]
        if known is not None:
            d["known"] = bool(known)
        self.save()
        return {"ok": True, "device": d}
