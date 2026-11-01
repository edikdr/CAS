#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="База: pacman, зеркала, обновление, локали"
MOD_CRITICAL=1

base_pacman_conf() {
  local f=/etc/pacman.conf
  backup_root_path "$f"
  sudo_run sed -i -E \
    -e 's/^#?Color$/Color/' \
    -e 's/^#?VerbosePkgLists$/VerbosePkgLists/' \
    -e 's/^#?ParallelDownloads.*/ParallelDownloads = 10/' "$f"
  grep -q '^ILoveCandy' "$f" || sudo_run sed -i '/^Color$/a ILoveCandy' "$f"
  ensure_multilib
}

base_mirrors() {
  pac_install reflector
  install_root_file "$HY_ROOT/system/etc/xdg/reflector/reflector.conf" /etc/xdg/reflector/reflector.conf
  ui_log "Подбираю быстрые зеркала (до минуты)"
  backup_root_path /etc/pacman.d/mirrorlist
  if ! sudo_run reflector @/etc/xdg/reflector/reflector.conf 2>/dev/null; then
    ui_warn "reflector не справился — оставляю текущие зеркала"
  fi
  enable_system_unit reflector.timer
}

base_locales() {
  local loc
  for loc in en_US.UTF-8 ru_RU.UTF-8 de_DE.UTF-8; do
    sudo_run sed -i -E "s/^#[[:space:]]*(${loc//./\\.} UTF-8)/\\1/" /etc/locale.gen
  done
  sudo_run locale-gen >/dev/null
  if [[ ! -s /etc/locale.conf ]] || ! grep -q '^LANG=' /etc/locale.conf; then
    write_root_file /etc/locale.conf <<'EOF'
LANG=ru_RU.UTF-8
LC_MONETARY=de_DE.UTF-8
LC_PAPER=de_DE.UTF-8
LC_MEASUREMENT=de_DE.UTF-8
EOF
    ui_ok "Язык системы: русский; валюта, бумага и единицы — немецкие (меняется в Настройках)"
  else
    ui_note "Язык системы уже настроен: $(grep '^LANG=' /etc/locale.conf)"
  fi
  # Консоль: немецкая раскладка (физическая QWERTZ) и крупный шрифт для экрана 2560×1600
  pac_install terminus-font
  if [[ ! -f /etc/vconsole.conf ]] || ! grep -q '^KEYMAP=' /etc/vconsole.conf; then
    set_root_kv /etc/vconsole.conf KEYMAP de-latin1
  fi
  set_root_kv /etc/vconsole.conf FONT ter-v24n
}

base_time() {
  if [[ ! -L /etc/localtime ]]; then
    sudo_run ln -sf /usr/share/zoneinfo/Europe/Berlin /etc/localtime
    ui_ok "Часовой пояс: Europe/Berlin"
  fi
  sudo_run timedatectl set-ntp true 2>/dev/null || enable_system_unit systemd-timesyncd.service
}

base_tuning() {
  install_root_file "$HY_ROOT/system/etc/sysctl.d/90-haotica.conf" /etc/sysctl.d/90-haotica.conf
  install_root_file "$HY_ROOT/system/etc/systemd/zram-generator.conf" /etc/systemd/zram-generator.conf
  install_root_file "$HY_ROOT/system/etc/systemd/journald.conf.d/90-haotica.conf" /etc/systemd/journald.conf.d/90-haotica.conf
  install_root_file "$HY_ROOT/system/etc/systemd/logind.conf.d/90-haotica.conf" /etc/systemd/logind.conf.d/90-haotica.conf
  install_root_file "$HY_ROOT/system/etc/makepkg.conf.d/haotica.conf" /etc/makepkg.conf.d/haotica.conf
  install_root_file "$HY_ROOT/system/etc/modprobe.d/haotica-blacklist.conf" /etc/modprobe.d/haotica-blacklist.conf
  sudo_run sysctl --system >/dev/null 2>&1 || true
  # если раньше был swap-раздел — оставляем, zram получит приоритет 100
  enable_system_unit fstrim.timer paccache.timer
}

mod_run() {
  base_pacman_conf
  ui_log "Обновляю ключи и систему (pacman -Syu)"
  sudo_run pacman -Sy --noconfirm --needed archlinux-keyring
  retry 2 sudo_run pacman -Syu --noconfirm
  base_mirrors
  pac_install_list base
  ensure_paru
  base_locales
  base_time
  base_tuning
  sudo_run mkdir -p "$HY_ETC" /var/cache/haotica /var/log/haotica
  save_install_var HY_USER "$HY_USER"
  mark_reboot
}
