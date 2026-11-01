"""Модели Haotica: манифест, загрузка с Hugging Face (aria2c, докачка, проверка SHA-256), запуск llama-server.

Файлы проверены на Hugging Face при сборке HAOTICA (размер и SHA-256 из LFS).
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

# роль → варианты (первый — по умолчанию). Память — сколько займёт в общей памяти GPU.
CATALOG: dict[str, list[dict]] = {
    "main": [
        {"id": "qwen3-next-80b-a3b-abliterated-i1-iq4xs", "label": "Qwen3-Next-80B-A3B Instruct abliterated · i1-IQ4_XS",
         "repo": "mradermacher/Huihui-Qwen3-Next-80B-A3B-Instruct-abliterated-i1-GGUF",
         "file": "Huihui-Qwen3-Next-80B-A3B-Instruct-abliterated.i1-IQ4_XS.gguf",
         "size": 42604475360, "sha256": "cd96ac695c598e637a1eed5133940c50383ae4082b377a68ea4c449abab92aa8",
         "ctx_max": 262144},
        {"id": "qwen3-next-80b-a3b-abliterated-i1-q4ks", "label": "Qwen3-Next-80B-A3B Instruct abliterated · i1-Q4_K_S (запасной)",
         "repo": "mradermacher/Huihui-Qwen3-Next-80B-A3B-Instruct-abliterated-i1-GGUF",
         "file": "Huihui-Qwen3-Next-80B-A3B-Instruct-abliterated.i1-Q4_K_S.gguf",
         "size": 45484954592, "sha256": "d893c3ab89c263c764f50150f6cf91e393fd8d1f5903aad0de6a70bed6c5216e",
         "ctx_max": 262144},
    ],
    "fast": [
        {"id": "qwen3-1.7b-q4km", "label": "Qwen3-1.7B · Q4_K_M (подсказки в строке)", "repo": "unsloth/Qwen3-1.7B-GGUF",
         "file": "Qwen3-1.7B-Q4_K_M.gguf", "size": 1107409472,
         "sha256": "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897", "ctx_max": 32768},
    ],
    "vision": [
        {"id": "qwen3-vl-8b-q4km", "label": "Qwen3-VL-8B Instruct · Q4_K_M (зрение)", "repo": "Qwen/Qwen3-VL-8B-Instruct-GGUF",
         "file": "Qwen3VL-8B-Instruct-Q4_K_M.gguf", "size": 5027784800,
         "sha256": "67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2", "ctx_max": 32768,
         "mmproj": {"file": "mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf", "size": 752289728,
                    "sha256": "c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd"}},
    ],
}
PORTS = {"main": paths.PORT_LLM_MAIN, "fast": paths.PORT_LLM_FAST, "vision": paths.PORT_LLM_VISION}
LLAMA_SERVER_CANDIDATES = [paths.OPT / "llama.cpp/bin/llama-server", Path("/usr/bin/llama-server"),
                           Path("/usr/local/bin/llama-server")]


def manifest_path() -> Path:
    return paths.MODELS_DIR / "manifest.json"


def load_manifest() -> dict:
    m = util.load_json(manifest_path(), None)
    if m:
        return m
    return {"models": {role: dict(variants[0]) for role, variants in CATALOG.items()}}


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
    if subprocess.run(cmd).returncode != 0:
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
        if entry.get("mmproj"):
            mp = entry["mmproj"]
            ok &= download_file(entry["repo"], mp["file"], mp["size"], mp["sha256"])
    save_manifest(m)
    return ok


def status() -> dict:
    m = load_manifest()
    out = {}
    for role, e in m["models"].items():
        f = model_file(e)
        have = f.stat().st_size if f.exists() else 0
        out[role] = {"label": e["label"], "file": str(f), "size": e["size"], "have": have,
                     "ready": have == e["size"] and not (paths.MODELS_DIR / f"{e['file']}.aria2").exists(),
                     "variants": [{"id": v["id"], "label": v["label"], "size": v["size"]} for v in CATALOG.get(role, [])],
                     "id": e["id"]}
    return out


def llama_server() -> Path | None:
    for c in LLAMA_SERVER_CANDIDATES:
        if c.exists():
            return c
    return None


def server_args(role: str) -> list[str]:
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
    if role == "main":
        ctx = int(ha.get("context_size", 131072))
        ctx = max(4096, min(ctx, m.get("ctx_max", 262144)))
        args += ["-c", str(ctx), "-np", "2", "--kv-unified", "-b", "2048", "-ub", "512", "--cache-reuse", "256"]
        if ctx > 131072:                         # 256K: 8-битный кэш, чтобы осталась память модели зрения
            args += ["--cache-type-k", "q8_0", "--cache-type-v", "q8_0"]
    elif role == "fast":
        args += ["-c", "8192", "-np", "4", "--kv-unified", "-b", "512"]
    elif role == "vision":
        args += ["-c", "16384", "-np", "1", "--mmproj", str(paths.MODELS_DIR / m["mmproj"]["file"])]
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
    """haotica-llm <роль>: заменить процесс на llama-server (для systemd)."""
    args = server_args(role)
    os.execv(args[0], args)


if __name__ == "__main__":
    launch(sys.argv[1] if len(sys.argv) > 1 else "main")
    print(json.dumps(status()))
