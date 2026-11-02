#!/usr/bin/env bash
# HAOTICA installer — определение железа и окружения.
# Результат: переменные HW_* и файл /var/lib/haotica/hardware.env
# shellcheck disable=SC2034

_rd() { if [[ -r "$1" ]]; then tr -d '\n' <"$1" 2>/dev/null || true; fi; }

detect_esp() {
  local p
  p="$(bootctl --print-esp-path 2>/dev/null || true)"
  if [[ -z "$p" ]]; then
    for p in /efi /boot/efi /boot; do
      if [[ "$(findmnt -no FSTYPE "$p" 2>/dev/null)" == vfat ]]; then echo "$p"; return; fi
    done
    echo ""
  else
    echo "$p"
  fi
}

detect_bootloader() {
  local esp="$1"
  if [[ -f /etc/kernel/cmdline ]] || grep -qsE '^[^#]*default_uki=' /etc/mkinitcpio.d/*.preset; then
    echo uki; return
  fi
  if pkg_installed limine && { [[ -f /boot/limine.conf || -f /boot/limine/limine.conf || -f /etc/default/limine ]] ||
    [[ -n "$esp" ]] && sudo_q test -f "$esp/limine.conf" -o -f "$esp/EFI/limine/limine.conf"; }; then
    echo limine; return
  fi
  if [[ -n "$esp" ]] && sudo_q find "$esp/loader/entries" -maxdepth 1 -name '*.conf' 2>/dev/null | grep -q .; then
    echo systemd-boot; return
  fi
  if [[ -f /etc/default/grub && -f /boot/grub/grub.cfg ]]; then
    echo grub; return
  fi
  if [[ -f /boot/refind_linux.conf ]]; then
    echo refind; return
  fi
  echo unknown
}

detect_secure_boot() {
  local v
  v="$(od -An -t u1 /sys/firmware/efi/efivars/SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c 2>/dev/null | awk '{print $NF}' || true)"
  case "$v" in
    1) echo enabled ;;
    0) echo disabled ;;
    *) echo unknown ;;
  esac
}

detect_cameras() {
  # Заполняет HW_CAM_RGB / HW_CAM_IR. ИК-камера отдаёт формат GREY или имеет «IR» в имени.
  HW_CAM_RGB=""; HW_CAM_IR=""
  local d dev name fmts
  for d in /sys/class/video4linux/video*; do
    [[ -e "$d" ]] || continue
    dev="/dev/$(basename "$d")"
    name="$(_rd "$d/name")"
    fmts=""
    if have v4l2-ctl; then fmts="$(v4l2-ctl -d "$dev" --list-formats 2>/dev/null || true)"; fi
    # пропускаем metadata-узлы без форматов изображения
    if [[ -n "$fmts" ]] && ! grep -qE "'(YUYV|MJPG|GREY|NV12|Y8|Y16)'" <<<"$fmts"; then continue; fi
    if grep -qiE "ir|infrared" <<<"$name" || grep -q "'GREY'" <<<"$fmts"; then
      [[ -z "$HW_CAM_IR" ]] && HW_CAM_IR="$dev"
    else
      [[ -z "$HW_CAM_RGB" ]] && HW_CAM_RGB="$dev"
    fi
  done
}

detect_all() {
  HW_VENDOR="$(_rd /sys/class/dmi/id/sys_vendor)"
  HW_PRODUCT="$(_rd /sys/class/dmi/id/product_name)"
  HW_MODEL="$(_rd /sys/class/dmi/id/product_version)"
  [[ -z "$HW_MODEL" || "$HW_MODEL" == "To be filled by O.E.M." ]] && HW_MODEL="$HW_PRODUCT"
  HW_IS_LEGION=0
  [[ "$HW_MODEL $HW_PRODUCT" == *Legion* ]] && HW_IS_LEGION=1
  HW_BIOS="$(_rd /sys/class/dmi/id/bios_version)"

  HW_CPU="$(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo)"
  HW_CORES="$(nproc 2>/dev/null || echo 4)"
  HW_RAM_KIB="$(awk '/MemTotal/{print $2}' /proc/meminfo)"
  HW_RAM_GIB=$(( (HW_RAM_KIB + 524288) / 1048576 ))

  HW_GPU="$(lspci -nn 2>/dev/null | grep -E 'VGA|Display|3D' | head -1 | sed -E 's/^[0-9a-f:.]+ [^:]+: //' || true)"
  HW_GPU_AMD=0
  [[ "$HW_GPU" == *AMD* || "$HW_GPU" == *ATI* ]] && HW_GPU_AMD=1
  HW_UMA_VRAM_MB=0; HW_GTT_MB=0
  local card
  for card in /sys/class/drm/card*/device; do
    if [[ -r "$card/mem_info_vram_total" ]]; then
      HW_UMA_VRAM_MB=$(( $(cat "$card/mem_info_vram_total") / 1048576 ))
      [[ -r "$card/mem_info_gtt_total" ]] && HW_GTT_MB=$(( $(cat "$card/mem_info_gtt_total") / 1048576 ))
      break
    fi
  done

  HW_UEFI=0; [[ -d /sys/firmware/efi ]] && HW_UEFI=1
  HW_SECURE_BOOT="$(detect_secure_boot)"
  HW_ESP="$(detect_esp)"
  HW_BOOTLOADER="$(detect_bootloader "$HW_ESP")"
  HW_ROOT_FS="$(findmnt -no FSTYPE / 2>/dev/null || echo unknown)"
  HW_ROOT_LUKS=0
  if lsblk -sno TYPE "$(findmnt -no SOURCE / 2>/dev/null | sed 's/\[.*//')" 2>/dev/null | grep -q crypt; then HW_ROOT_LUKS=1; fi
  HW_KERNELS="$(pacman -Qq linux linux-lts linux-zen linux-hardened 2>/dev/null | xargs || true)"
  HW_KERNEL_RUNNING="$(uname -r)"

  HW_WIFI="$(lspci -nnk 2>/dev/null | grep -A3 -iE 'network controller' | grep -iE 'network controller' | head -1 | sed -E 's/^[0-9a-f:.]+ [^:]+: //' || true)"
  HW_WIFI_DRIVER="$(lspci -nnk 2>/dev/null | grep -A3 -iE 'network controller' | awk -F': ' '/Kernel driver in use/{print $2; exit}' || true)"
  HW_AUDIO_CODEC="$(grep -h '^Codec:' /proc/asound/card*/codec#* 2>/dev/null | head -1 | sed 's/^Codec: //' || true)"
  detect_cameras

  HW_BATTERY="$(compgen -G '/sys/class/power_supply/BAT*' | head -1 || true)"
  HW_ON_AC=1
  local ac
  for ac in /sys/class/power_supply/{AC,ADP,ACAD}*/online; do
    [[ -r "$ac" ]] && HW_ON_AC="$(cat "$ac")" && break
  done
  HW_BAT_PCT="$(_rd "${HW_BATTERY:-/nonexistent}/capacity")"

  HW_PANEL_MODE=""
  local m
  for m in /sys/class/drm/card*-eDP-*/modes; do
    [[ -r "$m" ]] && HW_PANEL_MODE="$(head -1 "$m")" && break
  done

  HW_LENOVO_WMI=0
  modinfo lenovo_wmi_gamezone >/dev/null 2>&1 && HW_LENOVO_WMI=1
  HW_CHARGE_CTRL=""
  local c
  for c in /sys/bus/platform/drivers/ideapad_acpi/*/conservation_mode \
           "${HW_BATTERY:-/nonexistent}/charge_control_end_threshold" \
           "${HW_BATTERY:-/nonexistent}/charge_types"; do
    [[ -e "$c" ]] && { HW_CHARGE_CTRL="$c"; break; }
  done
  return 0
}

detect_save() {
  local v tmp
  tmp="$(mktemp)"
  for v in $(compgen -v HW_); do printf '%s=%q\n' "$v" "${!v}" >>"$tmp"; done
  if [[ "$DRY_RUN" == 1 ]]; then rm -f "$tmp"; return 0; fi
  sudo_run mkdir -p "$HY_STATE_DIR"
  sudo_run install -m 0644 "$tmp" "$HY_HW_FILE"
  rm -f "$tmp"
}

detect_print() {
  ui_kv "МОДЕЛЬ" "${HW_VENDOR} ${HW_MODEL}"
  ui_kv "ПРОЦЕССОР" "${HW_CPU} (${HW_CORES} потоков)"
  ui_kv "ПАМЯТЬ" "${HW_RAM_GIB} ГиБ, UMA ${HW_UMA_VRAM_MB} МиБ, GTT ${HW_GTT_MB} МиБ"
  ui_kv "ГРАФИКА" "${HW_GPU:-не найдено}"
  ui_kv "ЗАГРУЗЧИК" "${HW_BOOTLOADER} (ESP: ${HW_ESP:-нет})"
  ui_kv "SECURE BOOT" "${HW_SECURE_BOOT}"
  ui_kv "КОРЕНЬ" "${HW_ROOT_FS}$( ((HW_ROOT_LUKS)) && echo ' + LUKS')"
  ui_kv "ЯДРО" "${HW_KERNEL_RUNNING} (${HW_KERNELS:-?})"
  ui_kv "WI-FI" "${HW_WIFI:-не найдено} [${HW_WIFI_DRIVER:-нет драйвера}]"
  ui_kv "ЗВУК" "${HW_AUDIO_CODEC:-не определён}"
  ui_kv "КАМЕРЫ" "RGB ${HW_CAM_RGB:-нет} · ИК ${HW_CAM_IR:-нет}"
  ui_kv "ЭКРАН" "${HW_PANEL_MODE:-не определён}"
  ui_kv "ПИТАНИЕ" "$( ((HW_ON_AC)) && echo 'от сети' || echo 'от батареи'), заряд ${HW_BAT_PCT:-?}%"
}
