"""Модели Haotica: манифест, загрузка с Hugging Face (aria2c, докачка, проверка SHA-256), запуск llama-server.

Файлы проверены на Hugging Face при сборке HAOTICA (размер и SHA-256 из LFS).
Роли: base (Qwen3.8-27B — терминал, команды, зрение), deep (Qwen3-Coder-Next 80B — длинные и
глубокие задачи; base и deep работают по очереди), fast (подсказки в строке).
Команды: haotica models status | download [роль…] | verify | remove <роль> | use <роль> <вариант>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import config, paths, util

HF = "https://huggingface.co/{repo}/resolve/main/{file}?download=true"

# роль → варианты (первый — по умолчанию). Размер — сколько займёт в общей памяти GPU.
# base и deep работают по очереди (systemd Conflicts=): вместе они не помещаются в 64 ГБ.
#   base — Qwen3.8-27B: терминал, команды, повседневные вопросы, инструменты и зрение (mmproj);
#          ускорение DFlash-драфтом (llama.cpp --spec-type draft-dflash, ~2 ГБ).
#   deep — Qwen3-Coder-Next 80B-A3B (IQ4): длинные и глубокие задачи, код, большие контексты.
#   fast — крошечная модель для подсказок прямо в строке терминала (всегда рядом, ~1 ГБ).
_QWEN38 = "unsloth/Qwen3.8-27B-GGUF"
_QWEN38_EXTRA = {
    "mmproj": {"repo": "ggml-org/Qwen3.8-27B-GGUF", "file": "mmproj-Qwen3.8-27B-Q8_0.gguf", "size": 629247008,
               "sha256": "2e968a6af97ce35d8971890b257b9b7edabf20ad91450501fa53162a19ee33eb"},
    "draft": {"repo": "ggml-org/Qwen3.8-27B-GGUF", "file": "dflash-Qwen3.8-27B-Q8_0.gguf", "size": 2056414560,
              "sha256": "ef6a1340ed018cc58f53efd3613312c719b9ebf72b5586a046214c7ba366b297", "type": "draft-dflash"},
}
CATALOG: dict[str, list[dict]] = {
    "base": [
        {"id": "qwen3.8-27b-ud-q4km", "label": "Qwen3.8-27B · UD-Q4_K_M", "repo": _QWEN38,
         "file": "Qwen3.8-27B-UD-Q4_K_M.gguf", "size": 16464440224,
         "sha256": "322e194ff79741c7baa497c240f677f54b201b0efab44ca8e50f122b39123482", "ctx_max": 262144, **_QWEN38_EXTRA},
        {"id": "qwen3.8-27b-ud-q5km", "label": "Qwen3.8-27B · UD-Q5_K_M (точнее, медленнее)", "repo": _QWEN38,
         "file": "Qwen3.8-27B-UD-Q5_K_M.gguf", "size": 19771509664,
         "sha256": "2de73110cb254cbf09b54b717578dadff12ef1194e7271527e68202f39ba4bfd", "ctx_max": 262144, **_QWEN38_EXTRA},
        {"id": "qwen3.8-27b-ud-iq4xs", "label": "Qwen3.8-27B · UD-IQ4_XS (легче)", "repo": _QWEN38,
         "file": "Qwen3.8-27B-UD-IQ4_XS.gguf", "size": 14252845984,
         "sha256": "40fac4050e940397dbf13087afd50f4734a11805bf9d65ef8ddd7483470e6199", "ctx_max": 262144, **_QWEN38_EXTRA},
    ],
    "deep": [
        {"id": "qwen3-coder-next-iq4xs", "label": "Qwen3-Coder-Next 80B-A3B · IQ4_XS", "repo": "unsloth/Qwen3-Coder-Next-GGUF",
         "file": "Qwen3-Coder-Next-IQ4_XS.gguf", "size": 42676135968,
         "sha256": "9039c9ebc67360f8760f32c8c72f800a74454b17c3fa287c0e2f34a55794e463", "ctx_max": 262144},
        {"id": "qwen3-coder-next-ud-iq4xs", "label": "Qwen3-Coder-Next 80B-A3B · UD-IQ4_XS (легче на 4 ГБ)",
         "repo": "unsloth/Qwen3-Coder-Next-GGUF", "file": "Qwen3-Coder-Next-UD-IQ4_XS.gguf", "size": 38429272064,
         "sha256": "abf56d7fe8a0a99c15d220c13de4aa57b69cfba6ef4c2a007b56e34d7b40cd11", "ctx_max": 262144},
    ],
    "fast": [
        {"id": "qwen3-1.7b-q4km", "label": "Qwen3-1.7B · Q4_K_M (подсказки в строке)", "repo": "unsloth/Qwen3-1.7B-GGUF",
         "file": "Qwen3-1.7B-Q4_K_M.gguf", "size": 1107409472,
         "sha256": "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897", "ctx_max": 32768},
    ],
}
EXTRAS = ("mmproj", "draft")
MAIN_ROLES = ("base", "deep")
PORTS = {"base": paths.PORT_LLM_BASE, "fast": paths.PORT_LLM_FAST, "deep": paths.PORT_LLM_DEEP}
# рекомендованные выборки (карточки моделей): Qwen3.8 — без «мыслей» / с «мыслями», Coder-Next — одна
SAMPLING = {
    "base": {"temperature": 0.7, "top_p": 0.8, "top_k": 20, "min_p": 0.0, "presence_penalty": 1.5},
    "base_think": {"temperature": 1.0, "top_p": 0.95, "top_k": 20, "min_p": 0.0, "presence_penalty": 0.0},
    "deep": {"temperature": 1.0, "top_p": 0.95, "top_k": 40, "min_p": 0.0},
    "fast": {"temperature": 0.2, "top_p": 0.9, "top_k": 20},
}
if os.name == "nt":       # готовый релиз llama.cpp для Windows распаковывается в %LOCALAPPDATA%\Haotica\opt\llama.cpp
    LLAMA_SERVER_CANDIDATES = [paths.OPT / "llama.cpp/llama-server.exe", paths.OPT / "llama.cpp/bin/llama-server.exe"]
else:
    LLAMA_SERVER_CANDIDATES = [paths.OPT / "llama.cpp/bin/llama-server", Path("/usr/bin/llama-server"),
                               Path("/usr/local/bin/llama-server")]


def manifest_path() -> Path:
    return paths.MODELS_DIR / "manifest.json"


def load_manifest() -> dict:
    """Манифест выбранных вариантов. Старые роли (main, vision) отбрасываются, новые добавляются
    с вариантом по умолчанию; выбранный вариант сохраняется, если он ещё есть в каталоге."""
    m = util.load_json(manifest_path(), None) or {}
    have = m.get("models", {}) if isinstance(m.get("models"), dict) else {}
    out = {}
    for role, variants in CATALOG.items():
        cur = have.get(role) or {}
        pick = next((v for v in variants if v["id"] == cur.get("id")), variants[0])
        out[role] = dict(pick)
    return {"models": out}


def save_manifest(m: dict) -> None:
    paths.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    util.write_json(manifest_path(), m)


def model_file(entry: dict) -> Path:
    return paths.MODELS_DIR / entry["file"]


def _sha256(path: Path, progress: bool = False) -> str:
    h = hashlib.sha256()
    total, done = path.stat().st_size, 0
    with open(path, "rb") as f:
        while chunk := f.read(16 * 1024 * 1024):
            h.update(chunk)
            done += len(chunk)
            if progress:
                print(f"\r  проверка {path.name[:48]} {done * 100 // max(1, total):3d}%", end="", flush=True)
    if progress:
        print()
    return h.hexdigest()


def _lock(file: str) -> Path | None:
    """Один писатель на файл: две загрузки, дописывающие один .part, испортили бы его."""
    lock = paths.MODELS_DIR / f"{file}.lock"
    for _ in range(2):
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return lock
        except FileExistsError:
            try:
                pid = int(lock.read_text() or 0)
                import psutil
                if pid and psutil.pid_exists(pid) and pid != os.getpid():
                    return None
            except (ValueError, OSError, ImportError):
                pass
            lock.unlink(missing_ok=True)                    # хозяин замка умер — забираем
    return None


def part_file(file: str) -> Path:
    return paths.MODELS_DIR / f"{file}.part"


def _fetch(url: str, dst: Path, size: int, sha256: str, stall: int = 60, tries: int = 40) -> bool:
    """Загрузка без внешних программ: докачка по Range в файл .part, зависание (нет данных `stall` с) — обрыв
    и повтор с паузой, сумма SHA-256 считается по ходу (без второго прохода по 20 ГБ). Готовый файл — только целиком."""
    import http.client
    import time
    import urllib.error
    import urllib.request
    part = dst.with_name(dst.name + ".part")
    if dst.exists() and dst.stat().st_size < size:        # недокачанное старой версией (curl писал прямо в файл)
        dst.replace(part)
    have = part.stat().st_size if part.exists() else 0
    if have > size:
        part.unlink()
        have = 0
    h = hashlib.sha256()
    if have:
        with open(part, "rb") as f:
            while chunk := f.read(16 * 1024 * 1024):
                h.update(chunk)
        print(f"  ↻ докачка {dst.name}: с {have * 100 // size}%", flush=True)
    fails, last = 0, 0.0
    while have < size:
        got_any = False
        try:
            req = urllib.request.Request(url, headers={"Range": f"bytes={have}-", "User-Agent": "haotica-models"})
            with urllib.request.urlopen(req, timeout=stall) as r:
                if have and r.status != 206:                 # сервер не умеет докачку — заново
                    print("  ! сервер не поддержал докачку, начинаю файл заново", flush=True)
                    have, h = 0, hashlib.sha256()
                    part.unlink(missing_ok=True)
                with open(part, "ab") as f:
                    while chunk := r.read(1024 * 1024):     # тайм-аут сокета действует на каждое чтение
                        f.write(chunk)
                        h.update(chunk)
                        have += len(chunk)
                        got_any = True
                        if time.monotonic() - last > 2:
                            last = time.monotonic()
                            print(f"  ↓ {dst.name} {have * 100 // size}% ({have / 1e9:.1f}/{size / 1e9:.1f} ГБ)", flush=True)
        except urllib.error.HTTPError as e:
            if e.code == 416 and have >= size:
                break
            if e.code in (401, 403, 404, 410):
                print(f"  ✗ {dst.name}: HTTP {e.code} — файла нет или нет доступа", flush=True)
                return False
            print(f"  ! HTTP {e.code}, повтор", flush=True)
        except (urllib.error.URLError, http.client.HTTPException, OSError, TimeoutError) as e:
            print(f"  ! обрыв ({type(e).__name__}: {e}), повтор с {have * 100 // size}%", flush=True)
        if have >= size:
            break
        fails = 0 if got_any else fails + 1
        if fails >= tries:
            print(f"  ✗ {dst.name}: сеть недоступна, попыток {tries}; продолжу при следующем запуске", flush=True)
            return False
        time.sleep(min(60, 2 ** min(fails, 6)))
    if h.hexdigest() != sha256:
        print(f"  ✗ контрольная сумма не совпала: {dst.name} — файл удалён, скачаю заново", flush=True)
        part.unlink(missing_ok=True)
        return False
    part.replace(dst)
    mark(dst.name, True)
    print(f"  ✓ {dst.name}", flush=True)
    return True


# ── проверка SHA-256: «готова» = файл целиком и сумма сошлась ─────────────
def _marks_path() -> Path:
    return paths.MODELS_DIR / "verified.json"


def marks() -> dict:
    return util.load_json(_marks_path(), {}) or {}


def mark(file: str, ok: bool) -> None:
    """Запомнить результат проверки файла (вместе с размером и временем — изменённый файл проверяется заново)."""
    f = paths.MODELS_DIR / file
    try:
        st = f.stat()
    except OSError:
        return
    m = marks()
    m[file] = {"ok": bool(ok), "size": st.st_size, "mtime": int(st.st_mtime)}
    util.write_json(_marks_path(), m)


def checked(file: str) -> bool | None:
    """True — сумма сошлась, False — не сошлась, None — не проверялся (или файл с тех пор менялся)."""
    f = paths.MODELS_DIR / file
    rec = marks().get(file)
    try:
        st = f.stat()
    except OSError:
        return None
    if not rec or rec.get("size") != st.st_size or rec.get("mtime") != int(st.st_mtime):
        return None
    return bool(rec.get("ok"))


def files_of(entry: dict) -> list[tuple[str, int, str]]:
    """(файл, размер, sha256) роли — основной и дополнительные (зрение, драфт)."""
    return [(entry["file"], entry["size"], entry["sha256"])] + \
        [(entry[k]["file"], entry[k]["size"], entry[k]["sha256"]) for k in EXTRAS if entry.get(k)]


def verify(only_unchecked: bool = False, progress: bool = True) -> int:
    """Проверить SHA-256 файлов моделей. Несовпадение — испорченный файл удаляется и скачается заново.
    Возвращает число испорченных файлов."""
    bad = 0
    for role, e in load_manifest()["models"].items():
        for name, size, sha in files_of(e):
            f = paths.MODELS_DIR / name
            if not f.exists() or f.stat().st_size != size:
                continue
            if only_unchecked and checked(name) is not None:
                continue
            ok = _sha256(f, progress) == sha
            mark(name, ok)
            print(f"  {'✓' if ok else '✗'} {role}: {name}", flush=True)
            if not ok:
                bad += 1
                try:
                    f.unlink(missing_ok=True)
                    print("    сумма не совпала — испорченный файл удалён, будет скачан заново", flush=True)
                except OSError:                     # занят llama-server: помечен испорченным, удалится при загрузке
                    print("    сумма не совпала — файл помечен испорченным (занят, удалю при загрузке)", flush=True)
    return bad


def download_file(repo: str, file: str, size: int, sha256: str) -> bool:
    dst = paths.MODELS_DIR / file
    paths.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size == size and not (paths.MODELS_DIR / f"{file}.aria2").exists():
        if checked(file) is None:                    # целый по размеру, но не проверен — проверяем сейчас
            ok = _sha256(dst, True) == sha256
            mark(file, ok)
            if ok:
                return True
            print(f"  ✗ {file}: сумма не совпала — качаю заново", flush=True)
            dst.unlink(missing_ok=True)
        elif checked(file):
            return True
        else:
            dst.unlink(missing_ok=True)                 # испорчен (проверка не прошла) — качаем заново
    free = shutil.disk_usage(paths.MODELS_DIR).free
    have = max((p.stat().st_size for p in (dst, part_file(file)) if p.exists()), default=0)
    need = size - have
    if free < need + 2 * 1024 ** 3:
        print(f"  ✗ мало места: нужно {need / 1e9:.1f} ГБ, свободно {free / 1e9:.1f} ГБ")
        return False
    url = HF.format(repo=repo, file=file)
    if not util.which("aria2c"):
        lock = _lock(file)
        if lock is None:
            print(f"  … {file} уже качается другим процессом", flush=True)
            return False
        try:
            print(f"  ↓ {file} ({size / 1e9:.1f} ГБ)", flush=True)
            return _fetch(url, dst, size, sha256)
        finally:
            lock.unlink(missing_ok=True)
    cmd = ["aria2c", "-x", "8", "-s", "8", "-k", "64M", "--continue=true", "--file-allocation=none",
           "--auto-file-renaming=false", "--allow-overwrite=false", "--summary-interval=0",
           "--console-log-level=warn", "--download-result=hide", f"--checksum=sha-256={sha256}",
           "--max-tries=20", "--retry-wait=5", "--lowest-speed-limit=10K", "-d", str(paths.MODELS_DIR), "-o", file, url]
    print(f"  ↓ {file} ({size / 1e9:.1f} ГБ)")
    if subprocess.run(cmd, check=False).returncode != 0:
        return False
    ok = dst.exists() and dst.stat().st_size == size
    if ok:
        mark(file, True)                             # aria2c сам сверил SHA-256 (--checksum)
    return ok


def unfinished() -> list[str]:
    """Роли, чья загрузка начата, но не закончена (есть .part/.aria2 или неполный файл) — их докачиваем сами."""
    out = []
    for role, st in status().items():
        if not st["ready"] and st["have"] > 0:
            out.append(role)
    return out


def download(roles: list[str] | None = None) -> bool:
    m = load_manifest()
    ok = True
    for role, entry in m["models"].items():
        if roles and role not in roles:
            continue
        ok &= download_file(entry["repo"], entry["file"], entry["size"], entry["sha256"])
        for key in EXTRAS:
            if entry.get(key):
                x = entry[key]
                ok &= download_file(x.get("repo", entry["repo"]), x["file"], x["size"], x["sha256"])
    save_manifest(m)
    return ok


def status() -> dict:
    """ready — все файлы роли на месте целиком и не помечены испорченными; verified — SHA-256 всех сошлась
    (пока проверка не прошла, модель «готова, проверяется»); state — коротко для интерфейса."""
    m = load_manifest()
    out = {}
    for role, e in m["models"].items():
        files = [(name, sz) for name, sz, _sha in files_of(e)]
        size = sum(sz for _, sz in files)
        have = 0
        ready = verified = True
        for name, sz in files:
            f = paths.MODELS_DIR / name
            pf = part_file(name)
            got = min(sz, f.stat().st_size) if f.exists() else (min(sz, pf.stat().st_size) if pf.exists() else 0)
            have += got
            whole = f.exists() and got == sz and not (paths.MODELS_DIR / f"{name}.aria2").exists()
            c = checked(name) if whole else None
            ready &= whole and c is not False
            verified &= whole and c is True
        state = "verified" if verified else ("unverified" if ready else ("partial" if have else "missing"))
        out[role] = {"label": e["label"], "file": str(model_file(e)), "size": size, "have": have, "ready": ready,
                     "verified": verified, "state": state,
                     "role": role, "vision": bool(e.get("mmproj")), "draft": (e.get("draft") or {}).get("type", ""),
                     "variants": [{"id": v["id"], "label": v["label"], "size": v["size"]} for v in CATALOG.get(role, [])],
                     "id": e["id"]}
    return out


def llama_server() -> Path | None:
    env = os.environ.get("HAOTICA_LLAMA_SERVER")
    if env and Path(env).exists():
        return Path(env)
    if os.name == "nt":
        from .llama_win import server_exe
        exe = server_exe()
        if exe:
            return exe
    for c in LLAMA_SERVER_CANDIDATES:
        if c.exists():
            return c
    w = shutil.which("llama-server")
    return Path(w) if w else None


def _nospec_marker(role: str) -> Path:
    return paths.STATE_DIR / f"llm-{role}.nospec"


def _shrink_file(role: str) -> Path:
    return paths.STATE_DIR / f"llm-{role}.ctx"


def _ctx_shrink(role: str) -> int:
    """Контекст, который поместился после нехватки памяти (0 — ограничения нет)."""
    try:
        return int(_shrink_file(role).read_text(encoding="utf-8").split()[0])
    except (OSError, ValueError, IndexError):
        return 0


def failure_reason(log_tail: str) -> str:
    """Почему llama-server не стартовал — по хвосту его журнала: 'oom', 'spec', 'file' или ''."""
    t = log_tail.lower()
    if any(k in t for k in ("outofdevicememory", "out of memory", "failed to allocate", "unable to allocate",
                            "erroroutofhostmemory")):
        return "oom"
    if any(k in t for k in ("not within the file bounds", "failed to read magic", "invalid magic", "gguf_init_from_file",
                            "corrupted", "tensor data is not")):
        return "file"
    if any(k in t for k in ("draft", "speculative", "spec-type", "spec_type")):
        return "spec"
    return ""


def on_start_failure(role: str, log_tail: str) -> str:
    """Запуск упал в первые секунды: что поменять перед следующей попыткой. Нехватка памяти — контекст вдвое
    меньше (до 16K); сбой драфта — без него. Раньше любая ошибка считалась «драфт не поддержан»."""
    why = failure_reason(log_tail)
    paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
    if why == "oom":
        cur = _ctx_shrink(role) or int(config.get("haotica.context_size", 131072))
        nxt = max(16384, cur // 2)
        if cur <= 16384:
            return "oom-final"
        _shrink_file(role).write_text(f"{nxt} — не хватило памяти видеокарты при {cur}\n", encoding="utf-8")
        return "oom"
    if why == "spec":
        _nospec_marker(role).write_text("llama-server не принял драфт\n", encoding="utf-8")
    return why


def server_args(role: str, spec: bool = True) -> list[str]:
    """Параметры llama-server под Strix Halo (Vulkan, общая память)."""
    m = load_manifest()["models"][role]
    s = config.load()
    ha = s.get("haotica", {})
    exe = llama_server()
    if exe is None:
        raise SystemExit("llama-server не установлен (" + ("haotica llama install" if os.name == "nt" else "модуль 50-ai") + ")")
    f = model_file(m)
    if not f.exists():
        raise SystemExit(f"модель не загружена: {f} (haotica models download {role})")
    args = [str(exe), "-m", str(f), "--host", paths.HOST, "--port", str(PORTS[role]),
            "--jinja", "--metrics", "--no-webui", "--flash-attn", "on", "-t", str(max(4, (os.cpu_count() or 16) // 2))]
    if os.name == "nt" and role in MAIN_ROLES:
        # Windows (Vulkan, общая память): видеокарте реально доступно меньше, чем она сообщает. --fit сам
        # переносит часть слоёв на процессор, если не хватает, и оставляет запас (быстрая модель, окно, система).
        # Раньше было -ngl 999: deep (80B, ~40 ГиБ) падала на выделении кэша и перезапускалась по кругу.
        args += ["--fit", "on", "--fit-target", str(int(ha.get("gpu_reserve_mib", 3072)))]
    else:
        args += ["-ngl", "999"]
    smp = SAMPLING.get(role, {})
    args += ["--temp", str(smp.get("temperature", 0.7)), "--top-p", str(smp.get("top_p", 0.9)),
             "--top-k", str(smp.get("top_k", 20)), "--min-p", str(smp.get("min_p", 0.0))]
    if "presence_penalty" in smp:
        args += ["--presence-penalty", str(smp["presence_penalty"])]
    if role in MAIN_ROLES:
        ctx = int(ha.get("context_size", 131072))
        ctx = max(4096, min(ctx, m.get("ctx_max", 262144)))
        shrink = _ctx_shrink(role)                 # после нехватки памяти при запуске — контекст меньше
        if shrink:
            ctx = max(16384, min(ctx, shrink))
        # deep — одна длинная задача за раз: один слот (весь контекст ей); base — два (терминал + чат)
        slots = "1" if role == "deep" else "2"
        args += ["-c", str(ctx), "-np", slots, "--kv-unified", "-b", "2048", "-ub", "512", "--cache-reuse", "256"]
        # 8-битный кэш: у Qwen3.8-27B 16 слоёв полного внимания (~64 КБ на токен в f16) — с 64K;
        # deep (~40 ГиБ весов) — всегда: на Windows f16-кэш 128K уже не помещался рядом с быстрой моделью
        if ctx > 65536 or role == "deep":
            args += ["--cache-type-k", "q8_0", "--cache-type-v", "q8_0"]
        if m.get("mmproj") and (paths.MODELS_DIR / m["mmproj"]["file"]).exists():
            args += ["--mmproj", str(paths.MODELS_DIR / m["mmproj"]["file"])]
        want = str(ha.get("speculative", "auto"))
        draft = m.get("draft")
        if spec and want != "none" and not _nospec_marker(role).exists():
            if draft and want in ("auto", "draft") and (paths.MODELS_DIR / draft["file"]).exists():
                args += ["-md", str(paths.MODELS_DIR / draft["file"]), "--spec-type", draft["type"],
                         "--spec-draft-n-max", "15", "-ngld", "all"]
            elif want in ("auto", "ngram") and role == "deep":
                args += ["--spec-type", "ngram-mod"]   # повторы в коде: правки и рефакторинг
    elif role == "fast":
        args += ["-c", "8192", "-np", "4", "--kv-unified", "-b", "512"]
    return args


# ── командная строка ─────────────────────────────────────────────
def _cli(a: argparse.Namespace) -> int:
    if a.action == "status":
        for role, st in status().items():
            sign = {"verified": "✓", "unverified": "?", "partial": "…"}.get(st["state"], "✗")
            note = {"unverified": " (SHA-256 не проверена: haotica models verify)"}.get(st["state"], "")
            print(f"  {sign} {role:<7} {st['label']}  {st['have'] / 1e9:.1f}/{st['size'] / 1e9:.1f} ГБ{note}")
        exe = llama_server()
        print(f"  {'✓' if exe else '✗'} llama-server {exe or '— не установлен'}")
        return 0
    if a.action == "download":
        return 0 if download(a.args or None) else 1
    if a.action == "verify":                    # haotica models verify [--missing]: только непроверенные
        return 1 if verify(only_unchecked=bool(getattr(a, "missing", False)) or "missing" in a.args) else 0
    if a.action == "use" and len(a.args) == 2:
        role, vid = a.args
        v = next((x for x in CATALOG.get(role, []) if x["id"] == vid), None)
        if not v:
            print("нет такого варианта")
            return 1
        m = load_manifest()
        m["models"][role] = dict(v)
        save_manifest(m)
        print(f"✓ {role} → {v['label']}. Загрузка: haotica models download {role}")
        return 0
    if a.action == "remove" and a.args:
        m = load_manifest()
        for role in a.args:
            e = m["models"].get(role)
            if e:
                model_file(e).unlink(missing_ok=True)
                print(f"✓ удалено: {e['file']}")
        return 0
    if a.action == "args" and a.args:
        print(" ".join(server_args(a.args[0])))
        return 0
    print("haotica models status | download [роль…] | verify | use <роль> <вариант> | remove <роль>")
    return 2


def register(sub) -> None:
    p = sub.add_parser("models", help="модели Haotica")
    p.add_argument("action", choices=["status", "download", "verify", "use", "remove", "args"])
    p.add_argument("args", nargs="*")
    p.add_argument("--missing", dest="missing", action="store_true", help="verify: только непроверенные")
    p.set_defaults(fn=_cli)


def launch(role: str) -> None:
    """haotica-llm <роль>: запустить llama-server (для systemd).

    Со спекулятивным декодированием (драфт DFlash у base) сервер запускается дочерним процессом:
    если он падает в первые полторы минуты — например, сборка llama.cpp не знает этот тип драфта, —
    запуск повторяется без драфта, а отметка в состоянии отключает его до следующего обновления.
    Без драфта процесс просто заменяется на llama-server.
    """
    import signal
    import time
    args = server_args(role)
    if "--spec-type" not in args:
        os.execv(args[0], args)
    t0 = time.time()
    child = subprocess.Popen(args)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, lambda n, _f: child.send_signal(n))
    rc = child.wait()
    if rc != 0 and time.time() - t0 < 90:
        paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
        _nospec_marker(role).write_text(f"llama-server завершился с кодом {rc} при запуске с драфтом\n")
        print(f"haotica-llm {role}: драфт не поддерживается ({rc}) — запуск без него", file=sys.stderr)
        args = server_args(role, spec=False)
        os.execv(args[0], args)
    sys.exit(rc)


if __name__ == "__main__":
    launch(sys.argv[1] if len(sys.argv) > 1 else "base")
    print(json.dumps(status()))
