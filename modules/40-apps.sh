#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Приложения: Chrome, запасной набор KDE, меню и ассоциации"
MOD_CRITICAL=0

mod_run() {
  local rc=0
  pac_install_list apps || rc=1
  aur_install_list apps-aur || ui_warn "Часть программ из AUR не собралась — Магазин или paru поставят их позже"
  if [[ "${HW_GAMING:-1}" != 0 ]] && grep -qE '^\[multilib\]' /etc/pacman.conf; then
    pac_install_list gaming || ui_warn "Игровые пакеты не установились"
  fi

  # .desktop только для приложений HAOTICA, которые уже есть; ассоциации — запасные программы
  if [[ "$DRY_RUN" == 1 ]]; then
    ui_note "[dry-run] haotica desktop --dest /usr/share/applications --mimeapps /etc/xdg/mimeapps.list"
  else
    local tmp; tmp="$(mktemp -d)"
    haotica desktop --dest "$tmp/applications" --apps "$HY_PREFIX_SHARE/apps" --mimeapps "$tmp/mimeapps.list" >/dev/null
    sudo_run find /usr/share/applications -maxdepth 1 -name 'haotica-*.desktop' ! -name 'haotica-web-*' -delete
    sudo_run install -m 0644 "$tmp"/applications/*.desktop /usr/share/applications/
    install_root_file "$tmp/mimeapps.list" /etc/xdg/mimeapps.list
    rm -rf "$tmp"
    sudo_run update-desktop-database -q /usr/share/applications 2>/dev/null || true
  fi
  return $rc
}
