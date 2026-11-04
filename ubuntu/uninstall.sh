#!/usr/bin/env bash
# Удаление HAOTICA Терминала (Ubuntu). --purge — ещё и модели, память и настройки.
set -Eeuo pipefail
PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1
PREFIX="${HAOTICA_TERM_HOME:-$HOME/.local/share/haotica-terminal}"
systemctl --user disable --now haotica-core.service haotica-agent.service 2>/dev/null || true
systemctl --user stop haotica-llm-base.service haotica-llm-deep.service haotica-llm-fast.service haotica-models.service 2>/dev/null || true
rm -f "$HOME"/.config/systemd/user/haotica-*.service
systemctl --user daemon-reload 2>/dev/null || true
rm -f "$HOME"/.local/bin/haotica "$HOME"/.local/bin/haotica-{core,agent,app,tts,llm,term}
rm -f "$HOME"/.local/share/applications/haotica-*.desktop "$HOME"/.local/share/icons/hicolor/scalable/apps/haotica-*.svg
rm -rf "$PREFIX" "$HOME/.cache/haotica-terminal"
if [[ -f "$HOME/.bashrc" ]]; then
  sed -i '/# >>> HAOTICA TERMINAL >>>/,/# <<< HAOTICA TERMINAL <<</d' "$HOME/.bashrc"
fi
if ((PURGE)); then
  rm -rf "$HOME/.config/haotica" "$HOME/.local/share/haotica" "$HOME/.local/state/haotica" "$HOME/.cache/haotica"
  echo "Удалено вместе с моделями, памятью и настройками."
else
  echo "Удалено. Модели и память Haotica остались в ~/.local/share/haotica (удалить: --purge)."
fi
