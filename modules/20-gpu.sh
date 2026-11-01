#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Графика: Mesa и Vulkan (RADV) для Radeon 8060S"
MOD_CRITICAL=1

mod_run() {
  pac_install_list gpu
  sudo_run usermod -aG video,render "$HY_USER"
  # Vulkan RADV — драйвер по умолчанию: и для игр, и для llama.cpp.
  # ROCm для PyTorch не нужен системно: колёса AMD для gfx1151 несут свой рантайм.
  ui_ok "Mesa/RADV установлены, пользователь в группах video и render"
}
