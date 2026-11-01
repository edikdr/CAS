#!/usr/bin/env bash
# ┌─ HYPERINA // INSTALLER ──────────────────────────────────────────────┐
# │ Превращает свежий Arch Linux в HYPERINA.                              │
# │ Запуск: ./install.sh            — всё по порядку, с продолжением      │
# │         ./install.sh --help     — все параметры                       │
# └───────────────────────────────────────────────────────────────────────┘
set -Eeuo pipefail

HY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HY_VERSION="$(cat "$HY_ROOT/VERSION" 2>/dev/null || echo dev)"
export HY_ROOT HY_VERSION

# shellcheck source=lib/ui.sh
source "$HY_ROOT/lib/ui.sh"
# shellcheck source=lib/core.sh
source "$HY_ROOT/lib/core.sh"
# shellcheck source=lib/pkg.sh
source "$HY_ROOT/lib/pkg.sh"
# shellcheck source=lib/detect.sh
source "$HY_ROOT/lib/detect.sh"

usage() {
  cat <<EOF
HYPERINA installer ${HY_VERSION}

Использование: ./install.sh [параметры]

  --dry-run          показать, что будет сделано, ничего не меняя
  --yes              не задавать вопросов (ответы по умолчанию)
  --only 15,30       выполнить только указанные модули (номера или имена)
  --skip 55,60       пропустить модули
  --force            выполнить заново даже уже сделанные модули
  --no-models        не скачивать модели ИИ (~50 ГБ), можно позже: hyperina models pull
  --list             список модулей и их состояние
  --help             эта справка

Журнал: ~/.local/state/hyperina/install-<дата>.log
EOF
}

ONLY="" SKIP="" LIST=0 NO_MODELS=0
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --only) ONLY="$2"; shift ;;
    --skip) SKIP="$2"; shift ;;
    --force) FORCE=1 ;;
    --no-models) NO_MODELS=1 ;;
    --list) LIST=1 ;;
    --help|-h) usage; exit 0 ;;
    *) ui_err "Неизвестный параметр: $1"; usage; exit 2 ;;
  esac
  shift
done
export DRY_RUN ASSUME_YES FORCE NO_MODELS

# ── базовые проверки ────────────────────────────────────────────
[[ -f /etc/arch-release ]] || die "Это не Arch Linux. HYPERINA ставится только поверх Arch."
[[ $EUID -ne 0 ]] || die "Запустите установщик от обычного пользователя (не root): sudo он попросит сам."
have sudo || die "Нужен sudo: pacman -S sudo и добавьте пользователя в группу wheel."

mapfile -t MODULE_FILES < <(find "$HY_ROOT/modules" -maxdepth 1 -name '[0-9][0-9]-*.sh' | sort)

mod_id()    { basename "$1" .sh; }
mod_title() { grep -m1 '^MOD_TITLE=' "$1" | cut -d'"' -f2; }
mod_selected() {
  local id="$1" num="${1%%-*}" item
  if [[ -n "$ONLY" ]]; then
    local hit=0
    for item in ${ONLY//,/ }; do [[ "$item" == "$num" || "$item" == "$id" || "$item" == "${id#*-}" ]] && hit=1; done
    ((hit)) || return 1
  fi
  for item in ${SKIP//,/ }; do [[ "$item" == "$num" || "$item" == "$id" || "$item" == "${id#*-}" ]] && return 1; done
  return 0
}

if ((LIST)); then
  ui_banner "$HY_VERSION"
  for f in "${MODULE_FILES[@]}"; do
    id="$(mod_id "$f")"; st="$(state_get "$id")"
    case "$st" in
      "done") color="$C_GREEN" ;; failed) color="$C_CORAL" ;; *) color="$C_DIM"; st="${st:-ожидает}" ;;
    esac
    ui_kv "$id" "$(mod_title "$f") — $st" "$color"
  done
  exit 0
fi

# ── журнал и sudo ───────────────────────────────────────────────
mkdir -p "$HY_USER_STATE"
LOG="$HY_USER_STATE/install-$HY_TS.log"
exec > >(tee -a "$LOG") 2>&1
export LOG

ui_banner "$HY_VERSION"
((DRY_RUN)) && ui_plate "РЕЖИМ ПРОСМОТРА: изменения не вносятся"
ui_note "Журнал установки: $LOG"

if ! sudo -n true 2>/dev/null; then
  ui_info "Нужен пароль администратора (один раз на всю установку)"
  sudo -v || die "Без sudo установка невозможна"
fi
( while true; do sudo -n true 2>/dev/null; sleep 50; kill -0 "$$" 2>/dev/null || exit 0; done ) &
SUDO_KEEPALIVE=$!
trap 'kill "$SUDO_KEEPALIVE" 2>/dev/null || true' EXIT

state_init
detect_all
detect_save

ui_section "00" "SUBJECT SCAN"
detect_print

# ── выполнение модулей ──────────────────────────────────────────
declare -A RESULT=()
TOTAL=0
for f in "${MODULE_FILES[@]}"; do mod_selected "$(mod_id "$f")" && TOTAL=$((TOTAL + 1)); done
N=0

run_module() {
  local f="$1" id="$2"
  (
    set -Eeuo pipefail
    trap 'ui_err "Сбой в модуле '"$id"', строка $LINENO: $BASH_COMMAND"' ERR
    # shellcheck source=/dev/null
    source "$HY_HW_FILE" 2>/dev/null || true
    # shellcheck source=/dev/null
    source "$f"
    mod_run
  )
}

for f in "${MODULE_FILES[@]}"; do
  id="$(mod_id "$f")"
  mod_selected "$id" || continue
  N=$((N + 1))
  title="$(mod_title "$f")"
  ui_section "$(printf '%02d/%02d' "$N" "$TOTAL")" "${title^^}"

  if [[ "$(state_get "$id")" == "done" && "$FORCE" != 1 ]]; then
    ui_ok "Уже выполнено раньше — пропускаю (повторить: --force --only ${id%%-*})"
    RESULT[$id]="skip"
    continue
  fi

  critical="$(grep -m1 '^MOD_CRITICAL=' "$f" | cut -d= -f2 || true)"
  while true; do
    if run_module "$f" "$id"; then
      state_set "$id" "done"
      RESULT[$id]="ok"
      ui_ok "Модуль ${id} готов"
      break
    fi
    state_set "$id" failed
    RESULT[$id]="fail"
    ui_err "Модуль ${id} завершился с ошибкой. Подробности в журнале: $LOG"
    if [[ "$ASSUME_YES" == 1 ]]; then
      [[ "$critical" == 1 ]] && die "Критичный модуль не выполнен — дальше идти нельзя. Исправьте причину и запустите ./install.sh ещё раз: он продолжит с этого места."
      break
    fi
    action=""
    ui_choose action "Что делаем?" "Повторить" "Пропустить и продолжить" "Остановить установку"
    case "$action" in
      Повторить) continue ;;
      Пропустить*) break ;;
      *) ui_note "Установку можно продолжить позже той же командой: ./install.sh"; exit 1 ;;
    esac
  done
done

# ── итог ────────────────────────────────────────────────────────
ui_section "OK" "SCAN COMPLETE"
fails=0
for f in "${MODULE_FILES[@]}"; do
  id="$(mod_id "$f")"
  [[ -n "${RESULT[$id]:-}" ]] || continue
  case "${RESULT[$id]}" in
    ok) ui_kv "$id" "OK" "$C_GREEN" ;;
    skip) ui_kv "$id" "ранее" "$C_DIM" ;;
    fail) ui_kv "$id" "ОШИБКА" "$C_CORAL"; fails=$((fails + 1)) ;;
  esac
done

if ((fails)); then
  ui_warn "Модулей с ошибками: $fails. Запустите ./install.sh ещё раз — выполнятся только они."
  ui_note "Если ошибка повторяется, пришлите журнал: $LOG"
else
  ui_haotica "Всё на месте. Перезагрузись — и познакомимся нормально."
fi

if [[ -f "$HY_STATE_DIR/reboot-required" && "$DRY_RUN" != 1 ]]; then
  if ui_confirm "Перезагрузить сейчас?" y; then
    sudo rm -f "$HY_STATE_DIR/reboot-required"
    sudo systemctl reboot
  fi
fi
