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


def download_file(repo: str, file: str, size: int, sha256: str) -> bool:
    dst = paths.MODELS_DIR / file
    paths.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size == size and not (paths.MODELS_DIR / f"{file}.aria2").exists():
        return True
    free = shutil.disk_usage(paths.MODELS_DIR).free
    need = size - (dst.stat().st_size if dst.exists() else 0)
    if free < need + 2 * 1024 ** 3:
        print(f"  ✗ мало места: нужно {need / 1e9:.1f} ГБ, свободно {free / 1e9:.1f} ГБ")
        return False
    url = HF.format(repo=repo, file=file)
    if util.which("aria2c"):
        cmd = ["aria2c", "-x", "8", "-s", "8", "-k", "64M", "--continue=true", "--file-allocation=falloc",
               "--auto-file-renaming=false", "--allow-overwrite=false", "--summary-interval=0",
               "--console-log-level=warn", "--download-result=hide", f"--checksum=sha-256={sha256}",
               "--max-tries=20", "--retry-wait=5", "-d", str(paths.MODELS_DIR), "-o", file, url]
    else:
        cmd = ["curl", "-L", "--fail", "-C", "-", "--retry", "20", "--retry-delay", "5", "-o", str(dst), url]
    print(f"  ↓ {file} ({size / 1e9:.1f} ГБ)")
    if subprocess.run(cmd, check=False).returncode != 0:
        return False
    if not util.which("aria2c") and _sha256(dst, True) != sha256:
        print(f"  ✗ контрольная сумма не совпала: {file}")
        dst.unlink(missing_ok=True)
        return False
    return dst.exists() and dst.stat().st_size == size


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
    m = load_manifest()
    out = {}
    for role, e in m["models"].items():
        files = [(e["file"], e["size"])] + [(e[k]["file"], e[k]["size"]) for k in EXTRAS if e.get(k)]
        size = sum(sz for _, sz in files)
        have = 0
        ready = True
        for name, sz in files:
            f = paths.MODELS_DIR / name
            got = min(sz, f.stat().st_size) if f.exists() else 0
            have += got
            ready &= got == sz and not (paths.MODELS_DIR / f"{name}.aria2").exists()
        out[role] = {"label": e["label"], "file": str(model_file(e)), "size": size, "have": have, "ready": ready,
                     "role": role, "vision": bool(e.get("mmproj")), "draft": (e.get("draft") or {}).get("type", ""),
                     "variants": [{"id": v["id"], "label": v["label"], "size": v["size"]} for v in CATALOG.get(role, [])],
                     "id": e["id"]}
    return out


def llama_server() -> Path | None:
    for c in LLAMA_SERVER_CANDIDATES:
        if c.exists():
            return c
    return None


def _nospec_marker(role: str) -> Path:
    return paths.STATE_DIR / f"llm-{role}.nospec"


def server_args(role: str, spec: bool = True) -> list[str]:
    """Параметры llama-server под Strix Halo (Vulkan, общая память)."""
    m = load_manifest()["models"][role]
    s = config.load()
    ha = s.get("haotica", {})
    exe = llama_server()
    if exe is None:
        raise SystemExit("llama-server не установлен (модуль 50-ai)")
    f = model_file(m)
    if not f.exists():
        raise SystemExit(f"модель не загружена: {f} (haotica models download {role})")
    args = [str(exe), "-m", str(f), "--host", paths.HOST, "--port", str(PORTS[role]), "-ngl", "999",
            "--jinja", "--metrics", "--no-webui", "--flash-attn", "on", "-t", str(max(4, (os.cpu_count() or 16) // 2))]
    smp = SAMPLING.get(role, {})
    args += ["--temp", str(smp.get("temperature", 0.7)), "--top-p", str(smp.get("top_p", 0.9)),
             "--top-k", str(smp.get("top_k", 20)), "--min-p", str(smp.get("min_p", 0.0))]
    if "presence_penalty" in smp:
        args += ["--presence-penalty", str(smp["presence_penalty"])]
    if role in MAIN_ROLES:
        ctx = int(ha.get("context_size", 131072))
        ctx = max(4096, min(ctx, m.get("ctx_max", 262144)))
        args += ["-c", str(ctx), "-np", "2", "--kv-unified", "-b", "2048", "-ub", "512", "--cache-reuse", "256"]
        # 8-битный кэш: у Qwen3.8-27B 16 слоёв полного внимания (~64 КБ на токен в f16) — с 64K;
        # у Coder-Next их 12 и по 2 головы (~24 КБ на токен) — только на 256K
        if ctx > (65536 if role == "base" else 131072):
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
            mark = "✓" if st["ready"] else ("…" if st["have"] else "✗")
            print(f"  {mark} {role:<7} {st['label']}  {st['have'] / 1e9:.1f}/{st['size'] / 1e9:.1f} ГБ")
        exe = llama_server()
        print(f"  {'✓' if exe else '✗'} llama-server {exe or '— не установлен'}")
        return 0
    if a.action == "download":
        return 0 if download(a.args or None) else 1
    if a.action == "verify":
        bad = 0
        for role, e in load_manifest()["models"].items():
            f = model_file(e)
            ok = f.exists() and _sha256(f, True) == e["sha256"]
            print(f"  {'✓' if ok else '✗'} {role}: {f.name}")
            bad += 0 if ok else 1
        return 1 if bad else 0
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
