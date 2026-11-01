#!/usr/bin/env bash
# HAOTICA installer — ядро: выполнение команд, файлы, состояние, systemd.
# shellcheck disable=SC2034

HY_STATE_DIR="/var/lib/haotica"
HY_STATE_FILE="$HY_STATE_DIR/install.state"
HY_HW_FILE="$HY_STATE_DIR/hardware.env"
HY_PREFIX_LIB="/usr/lib/haotica"
HY_PREFIX_SHARE="/usr/share/haotica"
HY_PREFIX_OPT="/opt/haotica"
HY_ETC="/etc/haotica"
HY_TS="$(date +%Y%m%d-%H%M%S)"
HY_BACKUP_DIR="$HY_STATE_DIR/backup/$HY_TS"

HY_USER="${SUDO_USER:-$(id -un)}"
HY_HOME="$(getent passwd "$HY_USER" | cut -d: -f6)"
HY_UID="$(id -u "$HY_USER")"
HY_USER_STATE="$HY_HOME/.local/state/haotica"
HY_USER_BACKUP="$HY_USER_STATE/backup/$HY_TS"

DRY_RUN="${DRY_RUN:-0}"
ASSUME_YES="${ASSUME_YES:-0}"
FORCE="${FORCE:-0}"
NEED_REBOOT=0

die() { ui_err "$*"; exit 1; }

# Выполнить команду от пользователя (в режиме --dry-run только показать)
run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '  %s[dry-run]%s %s\n' "$C_DIM" "$C_RST" "$*"
    return 0
  fi
  "$@"
}

# Выполнить команду от root
sudo_run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '  %s[dry-run] sudo%s %s\n' "$C_DIM" "$C_RST" "$*"
    return 0
  fi
  if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

# Команда от root только для чтения/проверки: выполняется даже в режиме --dry-run
sudo_q() {
  if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

# Выполнить строку shell от root (для конвейеров и перенаправлений)
sudo_sh() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '  %s[dry-run] sudo sh -c%s %s\n' "$C_DIM" "$C_RST" "$1"
    return 0
  fi
  if [[ $EUID -eq 0 ]]; then bash -c "$1"; else sudo bash -c "$1"; fi
}

# Повторить команду до N раз с паузой
retry() {
  local n="$1" i; shift
  for ((i = 1; i <= n; i++)); do
    if "$@"; then return 0; fi
    ((i < n)) && { ui_warn "Попытка $i из $n не удалась, повторяю через $((i * 3)) с…"; sleep $((i * 3)); }
  done
  return 1
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── резервные копии ─────────────────────────────────────────────
backup_root_path() {
  local p="$1"
  [[ -e "$p" ]] || return 0
  sudo_run mkdir -p "$HY_BACKUP_DIR$(dirname "$p")"
  sudo_run cp -a "$p" "$HY_BACKUP_DIR$p"
}

backup_user_path() {
  local p="$1"
  [[ -e "$p" ]] || return 0
  run mkdir -p "$HY_USER_BACKUP$(dirname "${p#"$HY_HOME"}")"
  run cp -a "$p" "$HY_USER_BACKUP${p#"$HY_HOME"}"
}

# ── установка файлов ────────────────────────────────────────────
# Записать stdin в системный файл: write_root_file /etc/x 0644
write_root_file() {
  local dst="$1" mode="${2:-0644}" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if [[ -f "$dst" ]] && cmp -s "$tmp" "$dst"; then rm -f "$tmp"; return 0; fi
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '  %s[dry-run] записать%s %s (%s строк)\n' "$C_DIM" "$C_RST" "$dst" "$(wc -l <"$tmp")"
    rm -f "$tmp"; return 0
  fi
  backup_root_path "$dst"
  sudo_run install -D -m "$mode" "$tmp" "$dst"
  rm -f "$tmp"
}

# Скопировать файл из репозитория в систему
install_root_file() {
  local src="$1" dst="$2" mode="${3:-0644}"
  if [[ -f "$dst" ]] && cmp -s "$src" "$dst"; then return 0; fi
  backup_root_path "$dst"
  sudo_run install -D -m "$mode" "$src" "$dst"
}

# Скопировать каталог целиком (с заменой содержимого)
install_root_tree() {
  local src="$1" dst="$2"
  sudo_run mkdir -p "$dst"
  sudo_run rsync -a --delete --exclude '__pycache__' --exclude '*.pyc' "$src/" "$dst/"
}

# Записать stdin в файл пользователя
write_user_file() {
  local dst="$1" mode="${2:-0644}" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if [[ -f "$dst" ]] && cmp -s "$tmp" "$dst"; then rm -f "$tmp"; return 0; fi
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '  %s[dry-run] записать%s %s\n' "$C_DIM" "$C_RST" "$dst"
    rm -f "$tmp"; return 0
  fi
  backup_user_path "$dst"
  install -D -m "$mode" "$tmp" "$dst"
  rm -f "$tmp"
}

install_user_file() {
  local src="$1" dst="$2" mode="${3:-0644}"
  if [[ -f "$dst" ]] && cmp -s "$src" "$dst"; then return 0; fi
  if [[ "$DRY_RUN" == 1 ]]; then printf '  %s[dry-run] файл%s %s\n' "$C_DIM" "$C_RST" "$dst"; return 0; fi
  backup_user_path "$dst"
  install -D -m "$mode" "$src" "$dst"
}

install_user_tree() {
  local src="$1" dst="$2"
  if [[ "$DRY_RUN" == 1 ]]; then printf '  %s[dry-run] каталог%s %s\n' "$C_DIM" "$C_RST" "$dst"; return 0; fi
  [[ -d "$dst" ]] && backup_user_path "$dst"
  mkdir -p "$dst"
  rsync -a "$src/" "$dst/"
}

# Подстановка {{ИМЯ}} значениями переменных окружения HYV_ИМЯ
render_template() {
  local src="$1" line out="" key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    while [[ "$line" =~ \{\{([A-Z0-9_]+)\}\} ]]; do
      key="${BASH_REMATCH[1]}"
      val="HYV_$key"
      line="${line//\{\{$key\}\}/${!val:-}}"
    done
    out+="$line"$'\n'
  done <"$src"
  printf '%s' "$out"
}

# Гарантировать строку в системном файле (добавить, если нет)
ensure_root_line() {
  local file="$1" line="$2"
  if [[ -f "$file" ]] && sudo_q grep -qxF -- "$line" "$file" 2>/dev/null; then return 0; fi
  backup_root_path "$file"
  sudo_sh "printf '%s\n' $(printf '%q' "$line") >> $(printf '%q' "$file")"
}

# Установить KEY=VALUE в системном файле (заменить или добавить)
set_root_kv() {
  local file="$1" key="$2" value="$3"
  if [[ -f "$file" ]] && sudo_q grep -qE "^#?[[:space:]]*${key}[[:space:]]*=" "$file"; then
    if sudo_q grep -qxF "${key}=${value}" "$file"; then return 0; fi
    backup_root_path "$file"
    sudo_run sed -i -E "s|^#?[[:space:]]*${key}[[:space:]]*=.*|${key}=${value}|" "$file"
  else
    ensure_root_line "$file" "${key}=${value}"
  fi
}

# ── systemd ─────────────────────────────────────────────────────
enable_system_unit() {
  local unit
  for unit in "$@"; do sudo_run systemctl enable "$unit" >/dev/null 2>&1 || ui_warn "Не удалось включить $unit"; done
}

enable_system_unit_now() {
  local unit
  for unit in "$@"; do sudo_run systemctl enable --now "$unit" >/dev/null 2>&1 || ui_warn "Не удалось запустить $unit"; done
}

# Пользовательские юниты включаются глобально: работают для всех сессий пользователя
enable_user_unit_global() {
  local unit
  for unit in "$@"; do sudo_run systemctl --global enable "$unit" >/dev/null 2>&1 || ui_warn "Не удалось включить пользовательский $unit"; done
}

user_session_available() { [[ -S "/run/user/$HY_UID/bus" ]]; }

user_systemctl() {
  if user_session_available; then
    run env XDG_RUNTIME_DIR="/run/user/$HY_UID" systemctl --user "$@" 2>/dev/null || true
  fi
}

# ── состояние модулей ───────────────────────────────────────────
state_init() {
  sudo_run mkdir -p "$HY_STATE_DIR"
  [[ -f "$HY_STATE_FILE" ]] || sudo_run touch "$HY_STATE_FILE"
}

state_get() {
  local mod="$1"
  [[ -f "$HY_STATE_FILE" ]] || { echo ""; return; }
  grep -E "^${mod} " "$HY_STATE_FILE" 2>/dev/null | tail -1 | awk '{print $2}'
}

state_set() {
  local mod="$1" status="$2"
  [[ "$DRY_RUN" == 1 ]] && return 0
  sudo_sh "grep -vE '^${mod} ' '$HY_STATE_FILE' > '$HY_STATE_FILE.tmp' 2>/dev/null || true; echo '${mod} ${status} $(date -Is)' >> '$HY_STATE_FILE.tmp'; mv '$HY_STATE_FILE.tmp' '$HY_STATE_FILE'"
}

mark_reboot() { NEED_REBOOT=1; [[ "$DRY_RUN" == 1 ]] || sudo_run touch "$HY_STATE_DIR/reboot-required"; }

# Сохранить переменную в /etc/haotica/install.env (её читают сервисы и последующие модули)
save_install_var() {
  local key="$1" val="$2" f="$HY_ETC/install.env" line
  line="${key}=$(printf '%q' "$val")"
  sudo_run mkdir -p "$HY_ETC"
  [[ "$DRY_RUN" == 1 ]] && return 0
  sudo_sh "touch $(printf %q "$f"); grep -v '^${key}=' $(printf %q "$f") > $(printf %q "$f.tmp") || true; printf '%s\n' $(printf %q "$line") >> $(printf %q "$f.tmp"); mv $(printf %q "$f.tmp") $(printf %q "$f")"
}
