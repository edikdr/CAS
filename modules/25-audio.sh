#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Звук: PipeWire, SOF, динамики Legion"
MOD_CRITICAL=0

mod_run() {
  pac_remove_if_installed pulseaudio pulseaudio-alsa pulseaudio-bluetooth pulseaudio-jack jack2
  pac_install_list audio
  enable_user_unit_global pipewire.socket pipewire-pulse.socket wireplumber.service
  sudo_run usermod -aG audio "$HY_USER"
  if [[ -n "${HW_AUDIO_CODEC:-}" ]]; then
    ui_ok "Кодек: ${HW_AUDIO_CODEC}"
  fi
  ui_note "Динамики проверятся после перезагрузки (haotica doctor audio)."
  ui_note "Если они молчат — это известная проблема умных усилителей Lenovo: Haotica соберёт отчёт для исправления."
}
