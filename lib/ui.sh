#!/usr/bin/env bash
# HYPERINA installer — вывод в стиле системы (палитра MIX, truecolor).
# shellcheck disable=SC2034,SC2119,SC2120  # цвета используются в других файлах

if [[ -t 1 && "${NO_COLOR:-}" == "" ]]; then
  C_INK=$'\e[38;2;232;223;201m'
  C_DIM=$'\e[38;2;163;155;135m'
  C_LINE=$'\e[38;2;90;86;71m'
  C_AMBER=$'\e[38;2;224;162;67m'
  C_TEAL=$'\e[38;2;95;168;160m'
  C_CORAL=$'\e[38;2;224;112;90m'
  C_GREEN=$'\e[38;2;143;191;122m'
  C_VIOLET=$'\e[38;2;167;163;240m'
  C_INV=$'\e[48;2;232;223;201m\e[38;2;0;0;0m'
  C_BOLD=$'\e[1m'
  C_RST=$'\e[0m'
else
  C_INK='' C_DIM='' C_LINE='' C_AMBER='' C_TEAL='' C_CORAL='' C_GREEN='' C_VIOLET='' C_INV='' C_BOLD='' C_RST=''
fi

UI_WIDTH=72

ui_rule() {
  local ch="${1:-─}" i line=""
  for ((i = 0; i < UI_WIDTH; i++)); do line+="$ch"; done
  printf '%s%s%s\n' "$C_LINE" "$line" "$C_RST"
}

ui_banner() {
  local ver="${1:-}"
  printf '\n'
  printf '%s' "$C_INK"
  cat <<'EOF'
  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗███╗   ██╗ █████╗
  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║████╗  ██║██╔══██╗
  ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║██╔██╗ ██║███████║
  ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗██║██║╚██╗██║██╔══██║
  ██║  ██║   ██║   ██║     ███████╗██║  ██║██║██║ ╚████║██║  ██║
  ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝
EOF
  printf '%s' "$C_RST"
  printf '  %s// INSTALLER %s%s   %s[SECURE ACCESS]%s SYSTEM: %sONLINE%s\n' \
    "$C_DIM" "$ver" "$C_RST" "$C_AMBER" "$C_RST" "$C_GREEN" "$C_RST"
  ui_rule
}

# Заголовок модуля: ┌─ 15 // KERNEL ───────
ui_section() {
  local id="$1" title="$2" head pad i
  head="┌─ ${id} // ${title} "
  pad=$((UI_WIDTH - ${#head}))
  ((pad < 2)) && pad=2
  printf '\n%s┌─%s %s%s%s // %s%s%s ' "$C_LINE" "$C_RST" "$C_AMBER" "$id" "$C_RST" "$C_INK$C_BOLD" "$title" "$C_RST"
  printf '%s' "$C_LINE"
  for ((i = 0; i < pad; i++)); do printf '─'; done
  printf '%s\n' "$C_RST"
}

# Строка досье: КЛЮЧ ........ значение
ui_kv() {
  local key="$1" val="$2" color="${3:-$C_INK}" dots n i
  n=$((30 - ${#key}))
  ((n < 2)) && n=2
  dots=""
  for ((i = 0; i < n; i++)); do dots+="."; done
  printf '  %s%s %s%s%s %s%s%s\n' "$C_DIM" "$key" "$C_LINE" "$dots" "$C_RST" "$color" "$val" "$C_RST"
}

ui_log()   { printf '  %s>%s %s\n' "$C_DIM" "$C_RST" "$*"; }
ui_info()  { printf '  %s>%s %s\n' "$C_TEAL" "$C_RST" "$*"; }
ui_ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RST" "$*"; }
ui_warn()  { printf '  %s!%s %s%s%s\n' "$C_AMBER" "$C_RST" "$C_AMBER" "$*" "$C_RST" >&2; }
ui_err()   { printf '  %s✗ %s%s\n' "$C_CORAL" "$*" "$C_RST" >&2; }
ui_note()  { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RST"; }
ui_haotica() { printf '  %s◆ HAOTICA:%s %s\n' "$C_VIOLET" "$C_RST" "$*"; }

ui_plate() { printf '  %s %s %s\n' "$C_INV" "$*" "$C_RST"; }

# Сегментный прогресс: ui_progress 7 12 "загрузка"
ui_progress() {
  local cur="$1" total="$2" label="${3:-}" seg=24 filled i bar=""
  ((total <= 0)) && total=1
  filled=$((cur * seg / total))
  for ((i = 0; i < seg; i++)); do
    if ((i < filled)); then bar+="▰"; else bar+="▱"; fi
  done
  printf '\r  %s%s%s %3d%% %s%s%s' "$C_AMBER" "$bar" "$C_RST" $((cur * 100 / total)) "$C_DIM" "$label" "$C_RST"
  ((cur >= total)) && printf '\n'
  return 0
}

# Вопрос да/нет. ui_confirm "Текст" [y|n] — по умолчанию n. При ASSUME_YES=1 отвечает по умолчанию «да».
ui_confirm() {
  local prompt="$1" def="${2:-n}" ans hint
  if [[ "${ASSUME_YES:-0}" == 1 ]]; then return 0; fi
  if [[ "$def" == y ]]; then hint="[Д/н]"; else hint="[д/Н]"; fi
  while true; do
    printf '  %s?%s %s %s%s%s ' "$C_VIOLET" "$C_RST" "$prompt" "$C_DIM" "$hint" "$C_RST"
    read -r ans </dev/tty || ans=""
    ans="${ans,,}"
    [[ -z "$ans" ]] && ans="$def"
    case "$ans" in
      y|yes|д|да) return 0 ;;
      n|no|н|нет) return 1 ;;
    esac
  done
}

# Ввод строки: ui_ask VAR "Текст" "по умолчанию"
ui_ask() {
  local __var="$1" prompt="$2" def="${3:-}" ans
  if [[ "${ASSUME_YES:-0}" == 1 ]]; then printf -v "$__var" '%s' "$def"; return 0; fi
  printf '  %s?%s %s %s[%s]%s ' "$C_VIOLET" "$C_RST" "$prompt" "$C_DIM" "$def" "$C_RST"
  read -r ans </dev/tty || ans=""
  [[ -z "$ans" ]] && ans="$def"
  printf -v "$__var" '%s' "$ans"
}

# Выбор из списка: ui_choose VAR "Текст" вариант1 вариант2 ...
ui_choose() {
  local __var="$1" prompt="$2"; shift 2
  local opts=("$@") i ans
  if [[ "${ASSUME_YES:-0}" == 1 ]]; then printf -v "$__var" '%s' "${opts[0]}"; return 0; fi
  printf '  %s?%s %s\n' "$C_VIOLET" "$C_RST" "$prompt"
  for i in "${!opts[@]}"; do
    printf '    %s%d%s  %s\n' "$C_AMBER" $((i + 1)) "$C_RST" "${opts[$i]}"
  done
  while true; do
    printf '  %s▲▼ : НОМЕР   ⏎ : 1%s ' "$C_DIM" "$C_RST"
    read -r ans </dev/tty || ans=""
    [[ -z "$ans" ]] && ans=1
    if [[ "$ans" =~ ^[0-9]+$ ]] && ((ans >= 1 && ans <= ${#opts[@]})); then
      printf -v "$__var" '%s' "${opts[$((ans - 1))]}"
      return 0
    fi
  done
}

# Спиннер для долгих команд: ui_spin "текст" команда аргументы...
ui_spin() {
  local label="$1"; shift
  local frames=(▖ ▘ ▝ ▗) i=0 pid rc
  if [[ ! -t 1 ]]; then "$@"; return $?; fi
  "$@" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r  %s%s%s %s' "$C_AMBER" "${frames[i % 4]}" "$C_RST" "$label"
    i=$((i + 1))
    sleep 0.15
  done
  wait "$pid"; rc=$?
  if ((rc == 0)); then printf '\r  %s✓%s %s\n' "$C_GREEN" "$C_RST" "$label"
  else printf '\r  %s✗%s %s\n' "$C_CORAL" "$C_RST" "$label"; fi
  return "$rc"
}
