#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Рабочий стол: Hyprland, Quickshell, greetd, шрифты"
MOD_CRITICAL=1

mod_run() {
  pac_install_list desktop
  pac_install_list fonts

  # оболочка, экран входа (симлинки theme/components разворачиваются: у greeter нет доступа к репозиторию)
  install_root_tree "$HY_ROOT/shell" "$HY_PREFIX_SHARE/shell"
  sudo_run mkdir -p "$HY_PREFIX_SHARE/greeter"
  sudo_run rsync -aL --delete --exclude '__pycache__' "$HY_ROOT/greeter/" "$HY_PREFIX_SHARE/greeter/"
  install_root_tree "$HY_ROOT/assets" "$HY_PREFIX_SHARE/assets"
  # эталонный конфиг Hyprland: из него 80-user собирает ~/.config/hypr
  install_root_tree "$HY_ROOT/config/hypr" "$HY_PREFIX_SHARE/hypr"
  install_root_file "$HY_ROOT/system/usr/share/haotica/shaders/crt.frag" "$HY_PREFIX_SHARE/shaders/crt.frag"

  # greetd: пользователь greeter создаётся пакетом (sysusers); на всякий случай проверяем
  if ! getent passwd greeter >/dev/null; then
    sudo_run useradd -r -M -d /var/lib/greeter -s /usr/bin/nologin greeter
  fi
  sudo_run usermod -aG video,input greeter
  sudo_run install -d -o greeter -g greeter -m 0750 /var/lib/greeter
  install_root_file "$HY_ROOT/system/etc/greetd/config.toml" /etc/greetd/config.toml

  # другой дисплей-менеджер уступает место greetd
  local dm
  for dm in gdm sddm lightdm ly lxdm; do
    if systemctl is-enabled "$dm.service" >/dev/null 2>&1; then
      ui_note "Выключаю $dm (вход теперь через экран HAOTICA)"
      sudo_run systemctl disable "$dm.service" >/dev/null 2>&1 || true
    fi
  done
  sudo_run systemctl disable getty@tty1.service >/dev/null 2>&1 || true
  enable_system_unit greetd.service
  sudo_run systemctl set-default graphical.target >/dev/null
  mark_reboot
  ui_ok "Оболочка и экран входа на месте"
}
