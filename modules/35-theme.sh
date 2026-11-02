#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Оформление: палитра, иконки, курсор, заставка, CRT"
MOD_CRITICAL=0

mod_run() {
  have haotica || [[ "$DRY_RUN" == 1 ]] || die "Сначала модуль 32-runtime"

  # темы пользователя: GTK/Qt/Kvantum/терминал/Hyprland + иконки, курсор, обои, портрет
  run haotica theme apply --no-reload || ui_warn "theme apply завершился с ошибкой"
  run haotica theme assets || ui_warn "Иконки/курсор/обои не собрались — повторится при первом входе"

  # системные файлы темы (политики Chrome, /etc/haotica/theme.json, шейдер CRT) — генерируются от пользователя, копируются от root
  local tmp; tmp="$(mktemp -d)"
  if run haotica theme export-system "$tmp"; then
    [[ "$DRY_RUN" == 1 ]] || sudo_run rsync -a --no-owner --no-group --chmod=D0755,F0644 "$tmp/" /
  fi
  rm -rf "$tmp"

  # иконки и курсор — для всех (экран входа тоже их видит)
  local icons="$HY_HOME/.local/share/icons/HAOTICA"
  if [[ -d "$icons" ]]; then
    sudo_run rsync -a --delete "$icons/" /usr/share/icons/HAOTICA/
    sudo_run gtk-update-icon-cache -q -f /usr/share/icons/HAOTICA 2>/dev/null || true
  fi
  write_root_file /usr/share/icons/default/index.theme <<'EOF2'
[Icon Theme]
Inherits=HAOTICA
EOF2

  # заставка загрузки
  local ply="/usr/share/plymouth/themes/haotica"
  install_root_file "$HY_ROOT/system/usr/share/plymouth/themes/haotica/haotica.plymouth" "$ply/haotica.plymouth"
  install_root_file "$HY_ROOT/system/usr/share/plymouth/themes/haotica/haotica.script" "$ply/haotica.script"
  tmp="$(mktemp -d)"
  if run haotica theme plymouth "$tmp" && [[ "$DRY_RUN" != 1 ]]; then
    sudo_run rsync -a --chmod=F0644 "$tmp/" "$ply/"
  fi
  rm -rf "$tmp"
  if have plymouth-set-default-theme; then
    if [[ "$(plymouth-set-default-theme 2>/dev/null)" != haotica ]]; then
      sudo_run plymouth-set-default-theme haotica
      sudo_run mkinitcpio -P >/dev/null || ui_warn "mkinitcpio -P завершился с ошибкой — заставка появится после следующей сборки initramfs"
    fi
  fi
  ui_ok "Оформление применено"
}
