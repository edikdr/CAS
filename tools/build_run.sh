#!/usr/bin/env bash
# Сборка одного файла установщика: dist/haotica-installer.run (заголовок sh + tar.gz, проверка SHA-256).
# Запуск на целевой машине: sh haotica-installer.run [параметры install.sh]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist/haotica-installer.run"
VER="$(cat "$ROOT/VERSION" 2>/dev/null || echo dev)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$ROOT/dist"
# симлинки greeter разворачиваются, служебное не попадает
tar -C "$ROOT" --exclude-vcs --exclude='./dist' --exclude='__pycache__' --exclude='*.pyc' --exclude='./docs/preview' \
    --transform 's,^\.,haotica,S' -czf "$tmp/payload.tar.gz" .
sum="$(sha256sum "$tmp/payload.tar.gz" | cut -d' ' -f1)"
cat >"$OUT" <<HDR
#!/bin/sh
# HAOTICA installer ${VER} — самораспаковывающийся архив. Запуск: sh \$0 [--yes] [--dry-run] [--no-models] …
set -eu
SUM=${sum}
DIR="\${XDG_CACHE_HOME:-\$HOME/.cache}/haotica-installer"
LINE=\$(awk '/^__PAYLOAD__\$/{print NR + 1; exit}' "\$0")
rm -rf "\$DIR"; mkdir -p "\$DIR"
tail -n +"\$LINE" "\$0" > "\$DIR/payload.tar.gz"
echo "\$SUM  \$DIR/payload.tar.gz" | sha256sum -c --status || { echo "Архив повреждён (SHA-256 не совпал)"; exit 1; }
tar -C "\$DIR" -xzf "\$DIR/payload.tar.gz" && rm -f "\$DIR/payload.tar.gz"
cd "\$DIR/haotica" && exec bash ./install.sh "\$@"
__PAYLOAD__
HDR
cat "$tmp/payload.tar.gz" >>"$OUT"
chmod +x "$OUT"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1), sha256 payload $sum)"
