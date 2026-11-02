#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Haotica: llama.cpp (Vulkan) и модели"
MOD_CRITICAL=0

LLAMA_TAG="b12032"
LLAMA_PREFIX="/opt/haotica/llama.cpp"

ai_build_llama() {
  local stamp="$LLAMA_PREFIX/.version"
  if [[ -x "$LLAMA_PREFIX/bin/llama-server" && "$(cat "$stamp" 2>/dev/null)" == "$LLAMA_TAG" ]]; then
    ui_ok "llama.cpp $LLAMA_TAG уже собран"
    return 0
  fi
  pac_install base-devel git cmake ninja vulkan-headers vulkan-icd-loader shaderc glslang
  local src="$HY_HOME/.cache/haotica/build/llama.cpp"
  ui_info "Собираю llama.cpp $LLAMA_TAG с Vulkan (5–10 минут)"
  if [[ "$DRY_RUN" == 1 ]]; then
    ui_note "[dry-run] git clone --branch $LLAMA_TAG llama.cpp → cmake -DGGML_VULKAN=ON → $LLAMA_PREFIX"
    return 0
  fi
  rm -rf "$src"
  mkdir -p "$(dirname "$src")"
  retry 3 git clone --depth 1 --branch "$LLAMA_TAG" https://github.com/ggml-org/llama.cpp.git "$src" ||
    { ui_err "Не удалось скачать llama.cpp $LLAMA_TAG"; return 1; }
  cmake -S "$src" -B "$src/build" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON -DGGML_NATIVE=ON -DBUILD_SHARED_LIBS=OFF \
    -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON \
    -DCMAKE_INSTALL_PREFIX="$LLAMA_PREFIX" >/dev/null || { ui_err "cmake не настроил сборку"; return 1; }
  cmake --build "$src/build" --config Release -j "$(nproc)" --target llama-server llama-cli llama-bench ||
    { ui_err "Сборка llama.cpp не удалась"; return 1; }
  sudo_run install -d "$LLAMA_PREFIX/bin"
  local b
  for b in llama-server llama-cli llama-bench; do
    [[ -x "$src/build/bin/$b" ]] && sudo_run install -m 0755 "$src/build/bin/$b" "$LLAMA_PREFIX/bin/$b"
  done
  sudo_sh "echo $LLAMA_TAG > $LLAMA_PREFIX/.version"
  rm -rf "$src"
  # сборка обновилась — драфт DFlash снова пробуем (отметка «без драфта» сбрасывается)
  rm -f "$HY_HOME"/.local/state/haotica/llm-*.nospec 2>/dev/null || true
  "$LLAMA_PREFIX/bin/llama-server" --version >/dev/null 2>&1 && ui_ok "llama-server $LLAMA_TAG (Vulkan) готов"
}

mod_run() {
  local rc=0
  ai_build_llama || rc=1

  # модели (~70 ГБ): загрузка идёт в фоне службой haotica-models (докачка после перезагрузки сама)
  if [[ "${NO_MODELS:-0}" == 1 ]]; then
    ui_note "Модели не скачиваются (--no-models). Позже: Настройки → Haotica → Файлы моделей или haotica models download"
    run mkdir -p "$HY_HOME/.config/haotica"
    run touch "$HY_HOME/.config/haotica/no-models"
  else
    run rm -f "$HY_HOME/.config/haotica/no-models"
    enable_user_unit_global haotica-models.service
    if user_session_available; then
      user_systemctl daemon-reload
      user_systemctl start --no-block haotica-models.service
      ui_info "Загрузка моделей началась в фоне (прогресс: haotica models status)"
    else
      ui_note "Модели начнут скачиваться при первом входе в систему"
    fi
  fi
  ui_note "Синтез речи и SearXNG пока не ставятся: Haotica работает молча, поиск — через облачных помощников"
  return $rc
}
