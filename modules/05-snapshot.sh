#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Точка отката"
MOD_CRITICAL=0

mod_run() {
  local bdir="$HY_STATE_DIR/backup"
  sudo_run mkdir -p "$bdir"

  ui_log "Сохраняю /etc и список пакетов"
  sudo_sh "tar --zstd -cpf '$bdir/etc-$HY_TS.tar.zst' -C / etc 2>/dev/null || tar -czpf '$bdir/etc-$HY_TS.tar.gz' -C / etc"
  sudo_sh "pacman -Qqe > '$bdir/packages-$HY_TS.txt'"
  ui_ok "Копия /etc: $bdir"

  if [[ "$HW_ROOT_FS" == btrfs ]]; then
    if have snapper && sudo_q snapper list-configs 2>/dev/null | grep -q '^root'; then
      sudo_run snapper -c root create -t single -d "HAOTICA: до установки" &&
        ui_ok "Снимок snapper создан. Откат: snapper -c root rollback"
    else
      sudo_run mkdir -p /.haotica-snapshots
      if sudo_run btrfs subvolume snapshot -r / "/.haotica-snapshots/pre-install-$HY_TS" >/dev/null; then
        ui_ok "Снимок btrfs: /.haotica-snapshots/pre-install-$HY_TS (только чтение)"
      else
        ui_warn "Снимок btrfs не создан (необычная разметка). Есть копия /etc."
      fi
    fi
  else
    ui_note "Файловая система ${HW_ROOT_FS}: снимки недоступны, сохранена копия /etc и список пакетов."
  fi
}
