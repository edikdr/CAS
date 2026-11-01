#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Ноутбук Legion: питание, батарея, подсветка, прошивки"
MOD_CRITICAL=0

mod_run() {
  pac_remove_if_installed tlp auto-cpufreq
  pac_install power-profiles-daemon upower brightnessctl fwupd openrgb
  enable_system_unit power-profiles-daemon.service fwupd-refresh.timer

  # OLED: экономия «panel power savings» искажает цвета — выключаем это действие PPD
  if powerprofilesctl --help 2>/dev/null | grep -q configure-action; then
    sudo_run powerprofilesctl configure-action amdgpu_panel_power --disable >/dev/null 2>&1 || true
  fi

  # Бережная зарядка (по умолчанию включена, меняется в Настройках → Питание)
  if [[ ! -f "$HY_ETC/power.conf" ]]; then
    write_root_file "$HY_ETC/power.conf" <<'CONF'
# HAOTICA: питание
CHARGE_CONSERVATION=1
CHARGE_LIMIT=80
CONF
  fi
  install_root_file "$HY_ROOT/system/usr/lib/haotica/bin/haotica-charge-limit" "$HY_PREFIX_LIB/bin/haotica-charge-limit" 0755
  install_root_file "$HY_ROOT/system/etc/systemd/system/haotica-charge-limit.service" /etc/systemd/system/haotica-charge-limit.service
  sudo_run systemctl daemon-reload
  enable_system_unit haotica-charge-limit.service
  if [[ -n "${HW_CHARGE_CTRL:-}" ]]; then
    ui_ok "Бережная зарядка: ${HW_CHARGE_CTRL}"
  else
    ui_note "Управление зарядом появится после перезагрузки на новом ядре (драйвер ideapad/lenovo-wmi)"
  fi

  if ((HW_LENOVO_WMI)); then
    ui_ok "Драйверы Lenovo WMI есть в ядре: режимы питания и лимиты будут работать"
  elif ((HW_IS_LEGION)); then
    ui_note "Драйвер lenovo-wmi появится в новом ядре. Если после перезагрузки режимы питания не работают,"
    ui_note "Haotica предложит запасной драйвер LenovoLegionLinux (DKMS)."
  fi

  # Подсветка клавиатуры (один RGB-сегмент) и кнопки питания — через OpenRGB по HID
  sudo_run udevadm control --reload-rules >/dev/null 2>&1 || true
  ui_ok "Питание, батарея и подсветка настроены"
}
