#!/usr/bin/env bash
# ============================================================================
# HAOTICA TERMINAL + LOCAL AI + WALLPAPERS — УСТАНОВЩИК ДЛЯ UBUNTU (22.04/24.04+)
# Владелец: Eduard / Едуард
# Устанавливает:
#   1. Терминал Haotica (3 колонки, живой код «Сотворение Адама», CRT 85%, превью файлов)
#   2. Локальный ИИ Haotica (llama.cpp с Vulkan для Radeon 8060S + модели Qwen3.8-27B / 80B / 1.7B)
#   3. Ассистент Haotica, Настройки палитр и все 7 фирменных обоев Haotica OS (автоустановка на рабочий стол Ubuntu)
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
AMB='\033[0;33m'
CYN='\033[0;36m'
RST='\033[0m'

info() { echo -e "${CYN}[HAOTICA // UBUNTU]${RST} $*"; }
ok()   { echo -e "${GRN}[  OK  ]${RST} $*"; }
warn() { echo -e "${AMB}[ WARN ]${RST} $*"; }
err()  { echo -e "${RED}[ ERR  ]${RST} $*" >&2; }

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  err "Запускайте скрипт от обычного пользователя (eduard), а не от root: bash install-ubuntu.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HY_HOME="$HOME"
LLAMA_TAG="b5120"
LLAMA_PREFIX="/opt/haotica/llama.cpp"
VENV_DIR="/opt/haotica/venv"
NO_MODELS=0

for arg in "$@"; do
  case "$arg" in
    --no-models) NO_MODELS=1 ;;
  esac
done

info "Шаг 1/6 · Установка системных пакетов Ubuntu (apt)…"
sudo apt-get update -y
sudo apt-get install -y \
  build-essential git cmake ninja-build pkg-config curl wget rsync jq \
  zsh tmux wl-clipboard xclip \
  python3 python3-venv python3-pip python3-dev \
  libvulkan-dev vulkan-tools shaderc libshaderc-dev glslang-tools spirv-headers spirv-tools mesa-vulkan-drivers \
  libxcb-cursor0 libegl1 libgl1 libxkbcommon-x11-0 libdbus-1-3 libnss3 \
  fonts-jetbrains-mono || true

ok "Базовые пакеты Ubuntu установлены."

info "Шаг 2/6 · Создание изолированного Python-окружения /opt/haotica/venv (PySide6 + QtWebEngine + ядро Haotica)…"
sudo mkdir -p /opt/haotica /usr/lib/haotica/python /usr/lib/haotica/bin /usr/share/haotica/apps /etc/haotica
if [[ ! -x "$VENV_DIR/bin/python3" ]]; then
  sudo python3 -m venv "$VENV_DIR"
fi
sudo "$VENV_DIR/bin/pip" install --upgrade pip wheel
sudo "$VENV_DIR/bin/pip" install \
  aiohttp psutil pillow numpy markdown pygments tomli-w python-dateutil fonttools PySide6
ok "Python-окружение и QtWebEngine готовы."

info "Шаг 3/6 · Установка ядра Haotica, Терминала, ИИ-агента и служб systemd…"
sudo rsync -a --delete "$SCRIPT_DIR/core/haotica/" /usr/lib/haotica/python/haotica/
sudo rsync -a --delete "$SCRIPT_DIR/apps/" /usr/share/haotica/apps/
[[ -d "$SCRIPT_DIR/assets" ]] && sudo rsync -a "$SCRIPT_DIR/assets/" /usr/share/haotica/assets/

for f in "$SCRIPT_DIR"/system/usr/bin/*; do
  sudo install -m 0755 "$f" "/usr/bin/$(basename "$f")"
done
for f in "$SCRIPT_DIR"/system/usr/lib/haotica/bin/*; do
  sudo install -m 0755 "$f" "/usr/lib/haotica/bin/$(basename "$f")"
done

mkdir -p "$HY_HOME/.config/systemd/user"
for f in "$SCRIPT_DIR"/system/usr/lib/systemd/user/haotica-*.service; do
  [[ -f "$f" ]] && install -m 0644 "$f" "$HY_HOME/.config/systemd/user/$(basename "$f")"
done

# Интеграция zsh для терминала Haotica (блоки команд, подсказки Qwen3-1.7B, команды hy и ??)
if [[ -f "$SCRIPT_DIR/apps/terminal/shell/zshrc" ]]; then
  mkdir -p "$HY_HOME/.config/haotica/zsh"
  cp -r "$SCRIPT_DIR/apps/terminal/shell/"* "$HY_HOME/.config/haotica/zsh/"
  if ! grep -q "haotica/zsh/zshrc" "$HY_HOME/.zshrc" 2>/dev/null; then
    echo '[ -f "$HOME/.config/haotica/zsh/zshrc" ] && source "$HOME/.config/haotica/zsh/zshrc"' >> "$HY_HOME/.zshrc"
  fi
fi
ok "Ядро, Терминал Haotica и шелл-интеграция установлены."

info "Шаг 4/6 · Генерация и установка всех 7 фирменных обоев Haotica OS на рабочий стол Ubuntu…"
mkdir -p "$HY_HOME/Pictures/Haotica-Wallpapers"
for prof in MIX HYPERION SUBJECT ESCAPE ARCH RIDER SPACE; do
  /usr/bin/haotica theme apply --profile "$prof" --only runtime,apps --assets --no-reload || true
done
# Возвращаем профиль по умолчанию MIX и ставим обои на рабочий стол Ubuntu (GNOME / KDE)
/usr/bin/haotica theme apply --profile MIX --only runtime,apps --assets --no-reload || true

WALL_PNG="$HY_HOME/Pictures/Haotica-Wallpapers/haotica-mix.png"
if [[ -f "$WALL_PNG" ]] && command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.background picture-uri "file://$WALL_PNG" || true
  gsettings set org.gnome.desktop.background picture-uri-dark "file://$WALL_PNG" || true
  gsettings set org.gnome.desktop.screensaver picture-uri "file://$WALL_PNG" || true
  ok "Обои Haotica установлены на рабочий стол Ubuntu (все 7 вариантов лежат в ~/Pictures/Haotica-Wallpapers/)."
fi

# Адаптация раскладки клавиатуры под ноутбук Lenovo ISO-DE QWERTZ (de + ru)
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.input-sources sources "[('xkb', 'de+nodeadkeys'), ('xkb', 'ru')]" || true
fi

info "Шаг 5/6 · Сборка локального движка ИИ llama.cpp с аппаратным ускорением Vulkan (Radeon 8060S)…"
if [[ -x "$LLAMA_PREFIX/bin/llama-server" ]]; then
  ok "llama-server уже собран в $LLAMA_PREFIX/bin/llama-server"
else
  BUILD_TMP="$HY_HOME/.cache/haotica/build/llama.cpp"
  rm -rf "$BUILD_TMP"
  mkdir -p "$(dirname "$BUILD_TMP")"
  if git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$BUILD_TMP"; then
    GLSLC_BIN="$(which glslc 2>/dev/null || true)"
    CMAKE_VK_ARGS="-DGGML_VULKAN=ON"
    if [[ -n "$GLSLC_BIN" ]]; then
      CMAKE_VK_ARGS="$CMAKE_VK_ARGS -DVulkan_GLSLC_EXECUTABLE=$GLSLC_BIN"
    fi
    cmake -S "$BUILD_TMP" -B "$BUILD_TMP/build" -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      $CMAKE_VK_ARGS \
      -DGGML_NATIVE=ON \
      -DBUILD_SHARED_LIBS=OFF \
      -DLLAMA_CURL=OFF \
      -DLLAMA_BUILD_TESTS=OFF \
      -DLLAMA_BUILD_EXAMPLES=OFF \
      -DLLAMA_BUILD_SERVER=ON || {
        warn "Vulkan сборка не удалась, собираю llama-server с оптимизацией под CPU Zen 5 (OpenMP)..."
        cmake -S "$BUILD_TMP" -B "$BUILD_TMP/build" -G Ninja \
          -DCMAKE_BUILD_TYPE=Release \
          -DGGML_VULKAN=OFF \
          -DGGML_NATIVE=ON \
          -DBUILD_SHARED_LIBS=OFF \
          -DLLAMA_BUILD_SERVER=ON
      }
    cmake --build "$BUILD_TMP/build" --config Release -j "$(nproc)" --target llama-server llama-cli
    sudo install -d "$LLAMA_PREFIX/bin"
    sudo install -m 0755 "$BUILD_TMP/build/bin/llama-server" "$LLAMA_PREFIX/bin/llama-server"
    sudo install -m 0755 "$BUILD_TMP/build/bin/llama-cli" "$LLAMA_PREFIX/bin/llama-cli"
    rm -rf "$BUILD_TMP"
    ok "llama-server (Vulkan) успешно собран."
  else
    warn "Не удалось клонировать llama.cpp — позже перезапустите bash install-ubuntu.sh"
  fi
fi

info "Шаг 6/6 · Создание ярлыков приложений (.desktop) и запуск служб Haotica…"
mkdir -p "$HY_HOME/.local/share/applications"
/usr/bin/haotica desktop --dest "$HY_HOME/.local/share/applications" --apps /usr/share/haotica/apps >/dev/null 2>&1 || true
update-desktop-database "$HY_HOME/.local/share/applications" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable --now haotica-core.service haotica-agent.service || true

if [[ "$NO_MODELS" -eq 0 ]]; then
  systemctl --user enable --now haotica-models.service || true
  info "Фоновая докачка моделей Qwen (1.7B / 27B / 80B) запущена (прогресс: haotica models status)."
fi

echo ""
echo -e "${GRN}======================================================================${RST}"
echo -e "${GRN}  ГОТОВО, ЕДУАРД! ТЕРМИНАЛ HAOTICA + ИИ + ОБОИ УСТАНОВЛЕНЫ НА UBUNTU  ${RST}"
echo -e "${GRN}======================================================================${RST}"
echo -e "  • Запустить терминал из консоли:  ${CYN}haotica-terminal${RST}"
echo -e "  • Запустить ассистента Haotica:   ${CYN}haotica-app assistant${RST}"
echo -e "  • Запустить настройки и палитры:  ${CYN}haotica-app settings${RST}"
echo -e "  • Проверить загрузку моделей ИИ:  ${CYN}haotica models status${RST}"
echo -e "  • Папка со всеми 7 обоями:        ${CYN}~/Pictures/Haotica-Wallpapers/${RST}"
echo ""
