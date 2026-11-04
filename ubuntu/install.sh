#!/usr/bin/env bash
# ┌─ HAOTICA TERMINAL // UBUNTU ─────────────────────────────────────────────┐
# │ Терминал HAOTICA и локальный ИИ Haotica на Ubuntu — без смены рабочего    │
# │ стола: всё ставится в домашнюю папку, системные пакеты — через apt.       │
# │ Запуск:  bash ubuntu/install.sh      (параметры: bash ubuntu/install.sh -h)│
# └────────────────────────────────────────────────────────────────────────────┘
set -Eeuo pipefail
trap 'printf "\n  \033[31m✗ Установщик остановился: строка %s: %s\033[0m\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${HAOTICA_TERM_HOME:-$HOME/.local/share/haotica-terminal}"
APP="$PREFIX/app"
VENV="$PREFIX/venv"
OPT="$PREFIX/opt"
BIN="$HOME/.local/bin"
UNITS="$HOME/.config/systemd/user"
LLAMA_TAG="b12032"

DRY=0 NO_APT=0 NO_LLAMA=0 NO_MODELS=0 WITH_DEEP=0 ONLY=""
usage() {
  cat <<EOF
HAOTICA Terminal для Ubuntu

  bash ubuntu/install.sh [параметры]

  --no-models     не скачивать модели ИИ (Haotica заработает после: haotica models download)
  --with-deep     скачать и большую модель deep (80B, ещё ~40 ГБ); по умолчанию — base и fast
  --no-llama      не собирать llama.cpp (если уже стоит llama-server в PATH или /usr/local/bin)
  --no-apt        не ставить пакеты через apt (если всё уже есть)
  --only ШАГИ     только указанные шаги через запятую: apt,python,files,wrappers,units,llama,models,desktop,shell,check
  --dry-run       показать шаги, ничего не меняя
  -h, --help      эта справка
EOF
}
while (($#)); do
  case "$1" in
    --no-models) NO_MODELS=1 ;;
    --with-deep) WITH_DEEP=1 ;;
    --no-llama) NO_LLAMA=1 ;;
    --no-apt) NO_APT=1 ;;
    --only) ONLY="$2"; shift ;;
    --dry-run) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный параметр: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ -t 1 ]]; then C_O=$'\033[32m' C_W=$'\033[33m' C_E=$'\033[31m' C_D=$'\033[2m' C_T=$'\033[36m' C_R=$'\033[0m'; else C_O='' C_W='' C_E='' C_D='' C_T='' C_R=''; fi
section() { printf '\n%s┌─ %s ─────────────────────────────────%s\n' "$C_T" "$1" "$C_R"; }
info() { printf '  %s>%s %s\n' "$C_T" "$C_R" "$*"; }
ok() { printf '  %s✓%s %s\n' "$C_O" "$C_R" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_W" "$C_R" "$*" >&2; }
die() { printf '  %s✗ %s%s\n' "$C_E" "$*" "$C_R" >&2; exit 1; }
run() { if ((DRY)); then printf '  %s[dry-run]%s %s\n' "$C_D" "$C_R" "$*"; else "$@"; fi; }
sudo_run() { if ((DRY)); then printf '  %s[dry-run] sudo%s %s\n' "$C_D" "$C_R" "$*"; else sudo "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }
want() { [[ -z "$ONLY" ]] && return 0; [[ ",$ONLY," == *",$1,"* ]]; }

# ── проверки ─────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] || die "Запустите от обычного пользователя, не от root (sudo спросит сам, когда понадобится)."
[[ -d "$ROOT/core/haotica" && -d "$ROOT/apps/terminal" ]] || die "Не нашёл core/ и apps/ рядом со скриптом: запускайте из клонированного репозитория."
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}${ID_LIKE:-}" in
    *ubuntu*|*debian*) ;;
    *) warn "Это не Ubuntu/Debian (${PRETTY_NAME:-?}): скрипт рассчитан на apt." ;;
  esac
fi
free_gb=$(df -BG --output=avail "$HOME" | tail -1 | tr -dc 0-9)
need_gb=15
((NO_MODELS)) || need_gb=$((WITH_DEEP ? 80 : 40))
if ((free_gb < need_gb)); then
  die "Мало места в домашней папке: свободно ${free_gb} ГБ, нужно около ${need_gb} ГБ (--no-models уменьшает до 15)."
fi
ok "Ubuntu ${VERSION_ID:-?}, свободно ${free_gb} ГБ"

# ── apt ─────────────────────────────────────────────────────────
# имя через «|» — варианты для разных версий Ubuntu (первый найденный)
APT_PKGS=(
  git curl ca-certificates rsync aria2 ffmpeg xdg-utils libsecret-tools gnome-keyring
  python3 python3-venv python3-pip
  fonts-ibm-plex fonts-jetbrains-mono fonts-noto-color-emoji
  libvulkan1 mesa-vulkan-drivers vulkan-tools
  libegl1 libgl1 libopengl0 libglib2.0-0t64\|libglib2.0-0 libnss3 libnspr4 libasound2t64\|libasound2
  libxcomposite1 libxdamage1 libxrandr2 libxtst6 libxkbcommon0 libxkbcommon-x11-0 libxkbfile1
  libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-render-util0 libxcb-shape0
  libxcb-xinerama0 libxcb-xkb1 libxcb-randr0 libfontconfig1 libdbus-1-3 libgbm1 libxshmfence1
  libwayland-client0 libwayland-cursor0 libwayland-egl1 libpulse0 libpulse-mainloop-glib0
)
APT_BUILD=(build-essential cmake ninja-build pkg-config libvulkan-dev glslc spirv-headers glslang-tools)

step_apt() {
  section "01 // ПАКЕТЫ (apt)"
  if ((NO_APT)); then info "пропуск (--no-apt)"; return 0; fi
  have sudo || die "Нужен sudo."
  local want_list=("${APT_PKGS[@]}") alt p pick pkgs=() missing=()
  ((NO_LLAMA)) || want_list+=("${APT_BUILD[@]}")
  sudo_run apt-get update -qq
  for alt in "${want_list[@]}"; do
    pick=""
    IFS='|' read -ra opts <<<"$alt"
    for p in "${opts[@]}"; do
      if apt-cache show "$p" >/dev/null 2>&1; then pick="$p"; break; fi
    done
    if [[ -n "$pick" ]]; then pkgs+=("$pick"); else missing+=("$alt"); fi
  done
  ((${#missing[@]})) && warn "Нет в репозиториях (пропускаю): ${missing[*]}"
  info "ставлю ${#pkgs[@]} пакетов"
  sudo_run env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${pkgs[@]}"
  ok "пакеты установлены"
}

# ── Python ──────────────────────────────────────────────────────
step_python() {
  section "02 // PYTHON И PYSIDE6"
  have python3 || die "Нет python3 (запустите шаг apt)."
  run mkdir -p "$PREFIX"
  if [[ ! -x "$VENV/bin/python" ]]; then
    info "создаю окружение $VENV"
    run python3 -m venv "$VENV"
  fi
  info "ставлю библиотеки (PySide6 около 600 МБ, 3–10 минут)"
  run "$VENV/bin/python" -m pip install -q --upgrade pip
  run "$VENV/bin/python" -m pip install -q aiohttp psutil pillow numpy markdown pygments tomli_w python-dateutil fonttools PySide6
  if ((!DRY)); then
    "$VENV/bin/python" -I -c "import PySide6.QtWebEngineWidgets, PySide6.QtWebChannel, aiohttp, psutil, PIL, numpy, markdown, pygments, tomli_w, dateutil, fontTools; print('  импорт библиотек: ок')" ||
      die "Библиотеки не импортируются (чаще всего не хватает системных библиотек Qt: запустите шаг apt)."
  fi
  ok "Python готов"
}

# ── файлы ───────────────────────────────────────────────────────
step_files() {
  section "03 // ФАЙЛЫ HAOTICA"
  run rm -rf "$APP/core" "$APP/apps" "$APP/assets"
  run mkdir -p "$APP"
  if ((!DRY)); then
    tar -C "$ROOT" --exclude='__pycache__' --exclude='*.pyc' -cf - core/haotica apps assets | tar -C "$APP" -xf -
    echo "$LLAMA_TAG" >"$PREFIX/llama.tag.wanted"
    git -C "$ROOT" rev-parse --short HEAD >"$PREFIX/version" 2>/dev/null || echo dev >"$PREFIX/version"
  fi
  ok "скопировано в $APP"
}

# ── запускалки ──────────────────────────────────────────────────
write_exec() { # write_exec ИМЯ ТЕЛО…  (stdin — тело скрипта)
  local f="$BIN/$1"
  if ((DRY)); then printf '  %s[dry-run]%s записать %s\n' "$C_D" "$C_R" "$f"; cat >/dev/null; return 0; fi
  cat >"$f"
  chmod 0755 "$f"
}

step_wrappers() {
  section "04 // КОМАНДЫ (~/.local/bin)"
  run mkdir -p "$BIN"
  local common
  common=$(cat <<EOF
export HAOTICA_DEV_ROOT="$APP"
export HAOTICA_OPT="$OPT"
export PYTHONPATH="$APP/core"
export PATH="$BIN:\$PATH"
# QtWebEngine внутри venv не знает профиль AppArmor Ubuntu (запрет пользовательских пространств имён):
# песочницу Chromium отключаем — окно открывает только локальные страницы 127.0.0.1
export QTWEBENGINE_DISABLE_SANDBOX=1
EOF
)
  local name mod
  for pair in "haotica:haotica.cli" "haotica-core:haotica.server" "haotica-agent:haotica.agent" "haotica-app:haotica.apps" "haotica-tts:haotica.tts"; do
    name="${pair%%:*}"; mod="${pair##*:}"
    write_exec "$name" <<EOF
#!/bin/sh
# HAOTICA Terminal: $mod
$common
exec "$VENV/bin/python" -m $mod "\$@"
EOF
  done
  write_exec haotica-llm <<EOF
#!/bin/sh
# HAOTICA Terminal: llama-server для роли base | deep | fast
$common
exec "$VENV/bin/python" -c 'import sys; from haotica.models import launch; launch(sys.argv[1])' "\${1:-base}"
EOF
  write_exec haotica-term <<EOF
#!/bin/bash
# HAOTICA Terminal: поднять службы (если не запущены) и открыть окно терминала
$common
systemctl --user start haotica-core.service haotica-agent.service 2>/dev/null || {
  (setsid "$BIN/haotica-core" >/dev/null 2>&1 &)
  (setsid "$BIN/haotica-agent" >/dev/null 2>&1 &)
}
for _ in \$(seq 1 40); do
  (exec 3<>/dev/tcp/127.0.0.1/47800) 2>/dev/null && break
  sleep 0.5
done
exec "$BIN/haotica-app" terminal "\$@"
EOF
  ok "команды: haotica, haotica-term, haotica-app, haotica-core, haotica-agent, haotica-llm"
}

# ── службы systemd --user ───────────────────────────────────────
write_unit() { # write_unit ИМЯ  (stdin — тело)
  local f="$UNITS/$1"
  if ((DRY)); then printf '  %s[dry-run]%s записать %s\n' "$C_D" "$C_R" "$f"; cat >/dev/null; return 0; fi
  cat >"$f"
}

step_units() {
  section "05 // СЛУЖБЫ (systemd --user)"
  run mkdir -p "$UNITS"
  write_unit haotica-core.service <<EOF
[Unit]
Description=HAOTICA: ядро (настройки, метрики, API приложений)

[Service]
ExecStart=$BIN/haotica-core
Restart=on-failure
RestartSec=2
Environment=PYTHONUNBUFFERED=1
Nice=2

[Install]
WantedBy=default.target
EOF
  write_unit haotica-agent.service <<EOF
[Unit]
Description=HAOTICA: Haotica (чат, инструменты, память, облачный канал)
After=haotica-core.service

[Service]
ExecStart=$BIN/haotica-agent
Restart=on-failure
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF
  local role conflicts
  for role in base deep fast; do
    conflicts=""
    [[ $role == base ]] && conflicts="Conflicts=haotica-llm-deep.service"
    [[ $role == deep ]] && conflicts="Conflicts=haotica-llm-base.service"
    write_unit "haotica-llm-$role.service" <<EOF
[Unit]
Description=HAOTICA: модель $role — llama.cpp (Vulkan)
$conflicts

[Service]
ExecStart=$BIN/haotica-llm $role
Restart=on-failure
RestartSec=5
TimeoutStartSec=300
Nice=5
EOF
  done
  local roles="fast base"
  ((WITH_DEEP)) && roles="fast base deep"
  write_unit haotica-models.service <<EOF
[Unit]
Description=HAOTICA: загрузка моделей Haotica (докачка, проверка SHA-256)
After=network-online.target

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=infinity
ExecStart=-$BIN/haotica models download $roles
EOF
  run systemctl --user daemon-reload || warn "systemd --user недоступен (нет сессии): службы поднимет haotica-term"
  run systemctl --user enable haotica-core.service haotica-agent.service || true
  ok "службы: core и agent запускаются при входе; модели Haotica включает сама"
}

# ── llama.cpp ───────────────────────────────────────────────────
step_llama() {
  section "06 // LLAMA.CPP (Vulkan)"
  if ((NO_LLAMA)); then info "пропуск (--no-llama)"; return 0; fi
  if [[ -x "$OPT/llama.cpp/bin/llama-server" && "$(cat "$OPT/llama.cpp/.version" 2>/dev/null)" == "$LLAMA_TAG" ]]; then
    ok "llama.cpp $LLAMA_TAG уже собран"; return 0
  fi
  local src="$HOME/.cache/haotica-terminal/llama.cpp" b
  info "собираю llama.cpp $LLAMA_TAG с Vulkan (5–15 минут)"
  if ((DRY)); then info "[dry-run] git clone --branch $LLAMA_TAG → cmake -DGGML_VULKAN=ON → $OPT/llama.cpp"; return 0; fi
  rm -rf "$src"
  mkdir -p "$(dirname "$src")" "$OPT/llama.cpp/bin"
  git clone --depth 1 --branch "$LLAMA_TAG" https://github.com/ggml-org/llama.cpp.git "$src"
  cmake -S "$src" -B "$src/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON -DGGML_NATIVE=ON \
    -DBUILD_SHARED_LIBS=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON >/dev/null
  cmake --build "$src/build" --config Release -j "$(nproc)" --target llama-server llama-cli llama-bench
  for b in llama-server llama-cli llama-bench; do
    if [[ -x "$src/build/bin/$b" ]]; then install -m 0755 "$src/build/bin/$b" "$OPT/llama.cpp/bin/$b"; fi
  done
  echo "$LLAMA_TAG" >"$OPT/llama.cpp/.version"
  rm -rf "$src"
  rm -f "$HOME"/.local/state/haotica/llm-*.nospec
  "$OPT/llama.cpp/bin/llama-server" --version >/dev/null 2>&1 && ok "llama-server $LLAMA_TAG (Vulkan) готов" ||
    warn "llama-server собран, но не запускается: проверьте драйвер Vulkan (vulkaninfo --summary)"
}

# ── модели ──────────────────────────────────────────────────────
step_models() {
  section "07 // МОДЕЛИ ИИ"
  if ((NO_MODELS)); then
    info "пропуск (--no-models). Позже: haotica models download fast base"
    return 0
  fi
  info "загрузка идёт в фоне (прогресс: haotica models status); можно пользоваться терминалом"
  run systemctl --user start --no-block haotica-models.service || warn "не удалось запустить загрузку: haotica models download fast base"
  ok "загрузка моделей запущена"
}

# ── ярлыки ──────────────────────────────────────────────────────
step_desktop() {
  section "08 // ЯРЛЫКИ И ИКОНКИ"
  local apps="$HOME/.local/share/applications" icons="$HOME/.local/share/icons/hicolor/scalable/apps"
  run mkdir -p "$apps" "$icons"
  if ((!DRY)); then
    HAOTICA_DEV_ROOT="$APP" PYTHONPATH="$APP/core" "$VENV/bin/python" -I - "$icons" <<'PY' || warn "иконки не создались (ярлык будет с общим значком)"
import sys
from pathlib import Path
from haotica import icons, theme
p = theme.current_palette()
out = Path(sys.argv[1])
for name, glyph, cat in (("haotica-terminal", "terminal", "dev"), ("haotica-settings", "settings", "system"),
                         ("haotica-assistant", "haotica", "ai"), ("haotica-files", "folder", "system"),
                         ("haotica-sysmon", "sysmon", "system")):
    (out / f"{name}.svg").write_text(icons.tile_svg(p, glyph, cat))
PY
  fi
  local name title comment exec_ extra
  for entry in \
    "haotica-terminal|HAOTICA Терминал|Терминал HAOTICA с блоками команд и Haotica|haotica-term %U|TerminalEmulator" \
    "haotica-assistant|Haotica|Локальный ИИ-ассистент Haotica|haotica-app assistant|" \
    "haotica-settings|HAOTICA Настройки|Настройки HAOTICA и Haotica|haotica-app settings|" \
    "haotica-sysmon|HAOTICA Монитор системы|Процессы, CPU, GPU, память|haotica-app sysmon|" \
    "haotica-files|HAOTICA Файлы|Файлы с превью|haotica-app files|"; do
    IFS='|' read -r name title comment exec_ extra <<<"$entry"
    if ((DRY)); then info "[dry-run] ярлык $name"; continue; fi
    cat >"$apps/$name.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$title
Comment=$comment
Exec=$BIN/$exec_
Icon=$name
Terminal=false
StartupWMClass=$name
Categories=System;${extra:+$extra;}
EOF
  done
  run update-desktop-database "$apps" 2>/dev/null || true
  run gtk-update-icon-cache -q -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  ok "ярлыки в меню приложений: «HAOTICA Терминал», «Haotica», «HAOTICA Настройки»…"
}

# ── bash ────────────────────────────────────────────────────────
step_shell() {
  section "09 // КОМАНДЫ В ОБЫЧНОМ ТЕРМИНАЛЕ"
  local rc="$HOME/.bashrc"
  if ((DRY)); then info "[dry-run] блок HAOTICA в ~/.bashrc"; return 0; fi
  touch "$rc"
  if ! grep -q '>>> HAOTICA TERMINAL' "$rc"; then
    cat >>"$rc" <<'EOF'

# >>> HAOTICA TERMINAL >>>
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) PATH="$HOME/.local/bin:$PATH" ;; esac
hy() { command haotica ask "$*"; }   # Haotica из любой консоли: hy вопрос
# <<< HAOTICA TERMINAL <<<
EOF
  fi
  ok "команда hy и PATH добавлены в ~/.bashrc"
}

# ── проверка ────────────────────────────────────────────────────
step_check() {
  section "10 // ПРОВЕРКА"
  if ((DRY)); then info "[dry-run] запуск служб и haotica doctor"; return 0; fi
  systemctl --user start haotica-core.service haotica-agent.service 2>/dev/null || warn "systemd --user недоступен: службы поднимет haotica-term"
  for _ in $(seq 1 30); do (exec 3<>/dev/tcp/127.0.0.1/47800) 2>/dev/null && break; sleep 1; done
  "$BIN/haotica" doctor || true
}

# ── порядок ─────────────────────────────────────────────────────
for s in apt python files wrappers units llama models desktop shell check; do
  if want "$s"; then "step_$s"; fi
done

section "ГОТОВО"
cat <<EOF
  Запуск:   меню приложений → «HAOTICA Терминал»   или в консоли:  haotica-term
  Haotica:  в терминале строка «Ask Haotica» либо команда  hy привет
  Модели:   haotica models status       Ключи:  haotica key set openrouter
  Если «haotica» не находится в этой консоли: откройте новую (PATH обновится) или выполните  source ~/.bashrc
EOF
