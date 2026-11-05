"""llama.cpp для Windows: готовые релизы (без сборки), закреплённый тег и SHA-256, выбор бэкенда по замеру.

    haotica llama install [vulkan|hip|cpu]   — скачать и распаковать в %LOCALAPPDATA%\\Haotica\\opt\\llama.cpp-<бэкенд>
    haotica llama bench                      — замерить скорость на быстрой модели и выбрать бэкенд
    haotica llama status

Vulkan-сборка работает на Radeon 8060S с обычным драйвером AMD. HIP-сборку для Windows проект llama.cpp
публикует не в каждом релизе: её адрес и SHA-256 можно задать в настройках (haotica.llama_hip_url /
haotica.llama_hip_sha256) — тогда `bench` сравнит обе и оставит быструю. Подписи и TLS не ослабляются:
загрузка только по HTTPS, файл принимается лишь при совпадении SHA-256.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from . import config, paths

TAG = "b12032"
RELEASES = {
    "vulkan": {"url": f"https://github.com/ggml-org/llama.cpp/releases/download/{TAG}/llama-{TAG}-bin-win-vulkan-x64.zip",
               "size": 37523450, "sha256": "19a8bbf269fa683ae7bc04f886c9c2a93e0655c2606f37d2b60069bf9e8bcc32"},
}
CHOICE = paths.STATE_DIR / "llama-backend.json"


def backend_dir(backend: str) -> Path:
    return paths.OPT / f"llama.cpp-{backend}"


def release(backend: str) -> dict | None:
    if backend == "hip":
        url, sha = config.get("haotica.llama_hip_url", ""), config.get("haotica.llama_hip_sha256", "")
        return {"url": url, "sha256": sha, "size": 0} if url and sha else None
    return RELEASES.get(backend)


def installed() -> list[str]:
    return [b for b in ("vulkan", "hip", "cpu") if (backend_dir(b) / "llama-server.exe").exists()]


def chosen() -> str:
    try:
        return json.loads(CHOICE.read_text(encoding="utf-8")).get("backend", "")
    except (OSError, ValueError):
        return ""


def server_exe() -> Path | None:
    """Какой llama-server.exe запускать: выбранный замером, иначе первый установленный."""
    order = [chosen(), "vulkan", "hip", "cpu"]
    for b in order:
        if b and (backend_dir(b) / "llama-server.exe").exists():
            return backend_dir(b) / "llama-server.exe"
    flat = paths.OPT / "llama.cpp" / "llama-server.exe"
    return flat if flat.exists() else None


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(8 * 2 ** 20):
            h.update(chunk)
    return h.hexdigest()


def install(backend: str = "vulkan") -> bool:
    rel = release(backend)
    if not rel:
        print(f"✗ нет релиза для «{backend}» (для HIP задайте haotica.llama_hip_url и haotica.llama_hip_sha256)")
        return False
    dl = paths.CACHE_DIR / "downloads"
    dl.mkdir(parents=True, exist_ok=True)
    z = dl / Path(rel["url"]).name
    if not (z.exists() and _sha256(z) == rel["sha256"]):
        curl = shutil.which("curl") or shutil.which("curl.exe")
        if not curl:
            print("✗ нет curl (в Windows 10/11 он встроен: C:\\Windows\\System32\\curl.exe)")
            return False
        print(f"↓ {z.name}")
        if subprocess.run([curl, "-L", "--fail", "--proto", "=https", "-C", "-", "--retry", "10", "-o", str(z), rel["url"]],
                          check=False).returncode != 0:
            return False
        if _sha256(z) != rel["sha256"]:
            print("✗ SHA-256 не совпала — файл удалён")
            z.unlink(missing_ok=True)
            return False
    dst = backend_dir(backend)
    tmp = dst.with_suffix(".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():                       # без выхода за каталог
            if n.startswith(("/", "\\")) or ".." in Path(n).parts:
                print(f"✗ подозрительный путь в архиве: {n}")
                return False
        zf.extractall(tmp)
    inner = next((p.parent for p in tmp.rglob("llama-server.exe")), None)
    if inner is None:
        print("✗ в архиве нет llama-server.exe")
        return False
    shutil.rmtree(dst, ignore_errors=True)
    shutil.move(str(inner), str(dst))
    shutil.rmtree(tmp, ignore_errors=True)
    (dst / "release.json").write_text(json.dumps({"tag": TAG, "backend": backend, **rel}, indent=1), encoding="utf-8")
    print(f"✓ llama.cpp {TAG} ({backend}) → {dst}")
    if not chosen():
        CHOICE.parent.mkdir(parents=True, exist_ok=True)
        CHOICE.write_text(json.dumps({"backend": backend, "reason": "единственный установленный"}), encoding="utf-8")
    return True


def bench() -> dict:
    """llama-bench на быстрой модели для каждого установленного бэкенда; лучший — по скорости генерации."""
    from . import models
    m = models.load_manifest()["models"].get("fast")
    f = models.model_file(m) if m else None
    if not f or not f.exists():
        print("✗ для замера нужна быстрая модель: haotica models download fast")
        return {}
    res = {}
    for b in installed():
        exe = backend_dir(b) / "llama-bench.exe"
        if not exe.exists():
            continue
        r = subprocess.run([str(exe), "-m", str(f), "-p", "512", "-n", "64", "-ngl", "999", "-o", "json"],
                           capture_output=True, text=True, timeout=600, check=False)
        try:
            rows = json.loads(r.stdout or "[]")
            tg = max((x.get("avg_ts", 0) for x in rows if x.get("n_gen")), default=0)
            pp = max((x.get("avg_ts", 0) for x in rows if x.get("n_prompt")), default=0)
            res[b] = {"tg": round(tg, 1), "pp": round(pp, 1)}
        except ValueError:
            res[b] = {"error": (r.stderr or "")[-300:]}
        print(f"  {b}: {res[b]}")
    good = {k: v for k, v in res.items() if v.get("tg")}
    if good:
        best = max(good, key=lambda k: (good[k]["tg"], good[k]["pp"]))
        CHOICE.parent.mkdir(parents=True, exist_ok=True)
        CHOICE.write_text(json.dumps({"backend": best, "bench": res}, ensure_ascii=False), encoding="utf-8")
        print(f"✓ выбран {best}")
    return res


def _cli(a) -> int:
    if a.action == "install":
        return 0 if install(a.backend or "vulkan") else 1
    if a.action == "bench":
        return 0 if bench() else 1
    print(f"  тег {TAG}; установлено: {', '.join(installed()) or '—'}; выбран: {chosen() or '—'}; exe: {server_exe() or '—'}")
    return 0


def register(sub) -> None:
    p = sub.add_parser("llama", help="llama.cpp для Windows: установка и выбор бэкенда")
    p.add_argument("action", choices=["install", "bench", "status"])
    p.add_argument("backend", nargs="?", default="")
    p.set_defaults(fn=_cli)


if __name__ == "__main__":
    install(sys.argv[1] if len(sys.argv) > 1 else "vulkan")
    os._exit(0)
