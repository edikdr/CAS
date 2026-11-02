#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Голос Haotica: Chatterbox (голос Сары) и запасной Piper"
MOD_CRITICAL=0

TTS_VENV="/opt/haotica/tts-venv"
VOICES_DIR="/opt/haotica/voices"
# голоса Piper (запасной движок): имя, путь в rhasspy/piper-voices, SHA-256 модели
PIPER_VOICES=(
  "ru_RU-irina-medium ru/ru_RU/irina/medium 8ff38212d23da300bbe3705c645e6e5b9475f0bfde01558eb17813e22acaaaaa"
  "en_US-amy-medium en/en_US/amy/medium b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18"
)
# PyTorch для Radeon 8060S (gfx1151): сборки AMD TheRock; если не встанут — официальный ROCm, затем CPU
TORCH_INDEXES=(
  "https://rocm.nightlies.amd.com/v2/gfx1151/"
  "https://download.pytorch.org/whl/rocm6.4"
  "https://download.pytorch.org/whl/cpu"
)

voice_piper() {
  venv_pip "$TTS_VENV" piper-tts || return 1
  sudo_run install -d -m 0755 "$VOICES_DIR"
  local v name dir sum base
  for v in "${PIPER_VOICES[@]}"; do
    read -r name dir sum <<<"$v"
    base="https://huggingface.co/rhasspy/piper-voices/resolve/main/$dir/$name"
    if [[ -f "$VOICES_DIR/$name.onnx" ]] && echo "$sum  $VOICES_DIR/$name.onnx" | sha256sum -c --status 2>/dev/null; then
      continue
    fi
    ui_info "Голос Piper: $name"
    [[ "$DRY_RUN" == 1 ]] && continue
    local tmp; tmp="$(mktemp -d)"
    if retry 3 curl -fsSL -o "$tmp/$name.onnx" "$base.onnx?download=true" &&
       retry 3 curl -fsSL -o "$tmp/$name.onnx.json" "$base.onnx.json?download=true" &&
       echo "$sum  $tmp/$name.onnx" | sha256sum -c --status; then
      sudo_run install -m 0644 "$tmp/$name.onnx" "$tmp/$name.onnx.json" "$VOICES_DIR/"
    else
      ui_warn "Голос $name не скачался или не совпала контрольная сумма"
    fi
    rm -rf "$tmp"
  done
}

voice_chatterbox() {
  local idx ok=0
  for idx in "${TORCH_INDEXES[@]}"; do
    ui_info "PyTorch: $idx"
    if sudo_run env UV_CACHE_DIR=/var/cache/haotica/uv uv pip install --python "$TTS_VENV/bin/python" \
         --index-url "$idx" torch torchaudio; then ok=1; break; fi
  done
  ((ok)) || { ui_warn "PyTorch не установился — голос будет через Piper"; return 1; }
  # chatterbox закрепляет свою версию torch: оставляем уже поставленную
  local ov; ov="$(mktemp)"; printf 'torch\ntorchaudio\n' >"$ov"
  sudo_run env UV_CACHE_DIR=/var/cache/haotica/uv uv pip install --python "$TTS_VENV/bin/python" --override "$ov" \
    chatterbox-tts || { rm -f "$ov"; ui_warn "chatterbox-tts не установился — голос будет через Piper"; return 1; }
  rm -f "$ov"
  [[ "$DRY_RUN" == 1 ]] && return 0
  "$TTS_VENV/bin/python" - <<'PY' || ui_warn "Chatterbox установлен, но не импортируется — сработает Piper"
import torch
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: F401
print("  torch", torch.__version__, "GPU" if torch.cuda.is_available() else "CPU")
PY
}

mod_run() {
  pac_install ffmpeg pipewire espeak-ng
  if [[ ! -x "$TTS_VENV/bin/python" ]]; then
    sudo_run uv venv --system-site-packages --python /usr/bin/python3 "$TTS_VENV" || { ui_err "Не создалось $TTS_VENV"; return 1; }
  fi
  local rc=0
  voice_piper || { ui_warn "Piper не установился"; rc=1; }
  if [[ "${NO_VOICE_HQ:-0}" == 1 ]]; then
    ui_note "Chatterbox пропущен (--no-voice-hq): голос — Piper (не голос Сары) или ElevenLabs по ключу"
  else
    ui_info "Chatterbox: голос Сары по образцу assets/sounds/voice/ref_sarah_1.mp3 (~6 ГБ, 5–15 минут)"
    voice_chatterbox || true
  fi
  enable_user_unit_global haotica-tts.service
  user_systemctl daemon-reload
  user_systemctl restart haotica-tts.service
  ui_note "Веса Chatterbox (~3 ГБ) скачаются при первом запуске службы haotica-tts"
  ui_note "Свой образец голоса: ~/.local/share/haotica/voice/sarah.wav (10–15 с, без музыки)"
  return $rc
}
