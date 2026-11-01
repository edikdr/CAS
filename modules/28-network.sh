#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Сеть: NetworkManager, Bluetooth, mDNS, файрвол"
MOD_CRITICAL=1

mod_run() {
  pac_install_list network

  # Переход на NetworkManager без обрыва связи посреди установки: старое выключается со следующей загрузки
  if systemctl is-enabled systemd-networkd.service >/dev/null 2>&1 && ! systemctl is-enabled NetworkManager.service >/dev/null 2>&1; then
    ui_note "Сейчас сеть ведёт systemd-networkd. После перезагрузки её примет NetworkManager."
    sudo_run systemctl disable systemd-networkd.service systemd-networkd.socket >/dev/null 2>&1 || true
    sudo_run systemctl disable iwd.service >/dev/null 2>&1 || true
    mark_reboot
  fi
  enable_system_unit NetworkManager.service bluetooth.service avahi-daemon.service
  write_root_file /etc/NetworkManager/conf.d/90-hyperina.conf <<'CONF'
[device]
wifi.scan-rand-mac-address=yes

[connection]
wifi.powersave=2
connection.mdns=2
CONF

  # mDNS (.local) для разведки устройств в сети
  if ! grep -q mdns_minimal /etc/nsswitch.conf; then
    backup_root_path /etc/nsswitch.conf
    sudo_run sed -i -E 's/^(hosts:.*)(resolve|dns)/\1mdns_minimal [NOTFOUND=return] \2/' /etc/nsswitch.conf
  fi

  # Файрвол: входящие закрыты, кроме mDNS из локальной сети
  sudo_run ufw --force reset >/dev/null 2>&1 || true
  sudo_run ufw default deny incoming >/dev/null
  sudo_run ufw default allow outgoing >/dev/null
  sudo_run ufw allow in proto udp to 224.0.0.251 port 5353 comment 'mDNS' >/dev/null
  sudo_run ufw --force enable >/dev/null
  enable_system_unit ufw.service
  ui_ok "Сеть и файрвол готовы"
}
