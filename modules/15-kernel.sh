#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Ядро и загрузчик: память GPU под LLM"
MOD_CRITICAL=1

# Сколько ГиБ отдать GPU (GTT) из общей памяти
kernel_gtt_gib() {
  local ram="${HW_RAM_GIB:-16}"
  if ((ram >= 60)); then echo 56
  elif ((ram >= 30)); then echo $((ram - 8))
  else echo $((ram * 3 / 4)); fi
}

# Слить параметры: новые заменяют старые с тем же ключом
kparams_merge() {
  local current="$1" add="$2" p key out=() k
  local -A newkeys=()
  for p in $add; do newkeys["${p%%=*}"]=1; done
  for p in $current; do
    k="${p%%=*}"
    [[ -n "${newkeys[$k]:-}" ]] && continue
    out+=("$p")
  done
  for p in $add; do out+=("$p"); done
  echo "${out[*]}"
}

kernel_params() {
  local gib pages
  gib="$(kernel_gtt_gib)"
  pages=$((gib * 262144))
  save_install_var GTT_GIB "$gib"
  echo "ttm.pages_limit=$pages ttm.page_pool_size=$pages iommu=pt amd_pstate=active amdgpu.abmlevel=0 quiet splash loglevel=3 rd.udev.log_level=3 vt.global_cursor_default=0 nowatchdog"
}

apply_systemd_boot() {
  local params="$1" esp="$HW_ESP" e opts new safe="$HW_ESP/loader/entries/haotica-safe.conf" main="" entries=()
  # ESP обычно читается только root — список записей берём через sudo
  mapfile -t entries < <(sudo_q find "$esp/loader/entries" -maxdepth 1 -name '*.conf' | sort)
  for e in "${entries[@]}"; do
    [[ "$(basename "$e")" == haotica-safe.conf ]] && continue
    sudo_q grep -qE '^linux[[:space:]]+/vmlinuz-linux' "$e" || continue
    [[ -z "$main" ]] && main="$e"
    opts="$(sudo_q sed -n -E 's/^options[[:space:]]+//p' "$e" | head -1)"
    # безопасная запись — копия исходной, без наших параметров, создаётся один раз
    if ! sudo_q test -f "$safe" && [[ "$e" == "$main" ]]; then
      sudo_sh "sed -E 's/^title.*/title   HAOTICA — безопасный режим/' '$e' > '$safe'"
      ui_ok "Создан пункт загрузки «HAOTICA — безопасный режим» (исходные параметры)"
    fi
    new="$(kparams_merge "$opts" "$params")"
    backup_root_path "$e"
    if sudo_q grep -qE '^options' "$e"; then
      sudo_run sed -i -E "s|^options[[:space:]].*|options ${new//|/\\|}|" "$e"
    else
      sudo_sh "echo 'options $new' >> '$e'"
    fi
    ui_ok "systemd-boot: $(basename "$e")"
  done
  [[ -n "$main" ]] || { ui_warn "Не нашёл записей systemd-boot для ядра linux"; return 1; }
}

apply_uki() {
  local params="$1" cur
  if [[ -f /etc/kernel/cmdline ]]; then
    cur="$(tr '\n' ' ' </etc/kernel/cmdline)"
  else
    cur="$(tr ' ' '\n' </proc/cmdline | grep -vE '^(BOOT_IMAGE|initrd)=' | tr '\n' ' ')"
  fi
  kparams_merge "$cur" "$params" | write_root_file /etc/kernel/cmdline
  ui_ok "UKI: /etc/kernel/cmdline (образы пересоберутся)"
}

apply_grub() {
  local params="$1" cur new
  cur="$(sed -n -E 's/^GRUB_CMDLINE_LINUX_DEFAULT="(.*)"/\1/p' /etc/default/grub)"
  new="$(kparams_merge "$cur" "$params")"
  backup_root_path /etc/default/grub
  if grep -q '^GRUB_CMDLINE_LINUX_DEFAULT=' /etc/default/grub; then
    sudo_run sed -i -E "s|^GRUB_CMDLINE_LINUX_DEFAULT=.*|GRUB_CMDLINE_LINUX_DEFAULT=\"${new//|/\\|}\"|" /etc/default/grub
  else
    sudo_sh "echo 'GRUB_CMDLINE_LINUX_DEFAULT=\"$new\"' >> /etc/default/grub"
  fi
  sudo_run grub-mkconfig -o /boot/grub/grub.cfg
  ui_ok "GRUB обновлён"
}

apply_limine() {
  local params="$1" f cur new
  if [[ -f /etc/default/limine ]] && grep -q 'KERNEL_CMDLINE' /etc/default/limine; then
    cur="$(sed -n -E 's/^KERNEL_CMDLINE\[default\]\+?="(.*)"/\1/p' /etc/default/limine | head -1)"
    new="$(kparams_merge "$cur" "$params")"
    backup_root_path /etc/default/limine
    sudo_run sed -i -E "s|^(KERNEL_CMDLINE\[default\]\+?=).*|\1\"${new//|/\\|}\"|" /etc/default/limine
    have limine-update && sudo_run limine-update
    have limine-mkinitcpio && sudo_run limine-mkinitcpio
    ui_ok "Limine: /etc/default/limine"
    return 0
  fi
  for f in /boot/limine.conf /boot/limine/limine.conf "$HW_ESP/limine.conf" "$HW_ESP/EFI/limine/limine.conf"; do
    [[ -f "$f" ]] || continue
    backup_root_path "$f"
    # каждая строка cmdline/kernel_cmdline получает наши параметры
    local tmp; tmp="$(mktemp)"
    sudo_q cat "$f" | while IFS= read -r line; do
      if [[ "$line" =~ ^([[:space:]]*(kernel_)?cmdline:[[:space:]]*)(.*)$ ]]; then
        printf '%s%s\n' "${BASH_REMATCH[1]}" "$(kparams_merge "${BASH_REMATCH[3]}" "$params")"
      else
        printf '%s\n' "$line"
      fi
    done >"$tmp"
    sudo_run install -m 0644 "$tmp" "$f"; rm -f "$tmp"
    ui_ok "Limine: $f"
    return 0
  done
  return 1
}

apply_refind() {
  local params="$1" f=/boot/refind_linux.conf tmp
  backup_root_path "$f"
  tmp="$(mktemp)"
  while IFS= read -r line; do
    if [[ "$line" =~ ^(\"[^\"]*\"[[:space:]]+\")([^\"]*)(\".*)$ ]]; then
      printf '%s%s%s\n' "${BASH_REMATCH[1]}" "$(kparams_merge "${BASH_REMATCH[2]}" "$params")" "${BASH_REMATCH[3]}"
    else
      printf '%s\n' "$line"
    fi
  done <"$f" >"$tmp"
  sudo_run install -m 0644 "$tmp" "$f"; rm -f "$tmp"
  ui_ok "rEFInd: $f"
}

mkinitcpio_setup() {
  # MODULES += amdgpu (ранний KMS для заставки), HOOKS += plymouth (до шифрования диска)
  local mods hooks out_m=() out_h=() h placed=0
  mods="$(bash -c 'source /etc/mkinitcpio.conf; for f in /etc/mkinitcpio.conf.d/*.conf; do [[ -f $f && $f != */haotica.conf ]] && source "$f"; done; echo "${MODULES[*]}"')"
  hooks="$(bash -c 'source /etc/mkinitcpio.conf; for f in /etc/mkinitcpio.conf.d/*.conf; do [[ -f $f && $f != */haotica.conf ]] && source "$f"; done; echo "${HOOKS[*]}"')"
  read -ra out_m <<<"$mods"
  [[ " ${out_m[*]} " == *" amdgpu "* ]] || out_m+=(amdgpu)
  for h in $hooks; do
    [[ "$h" == plymouth ]] && continue
    out_h+=("$h")
    if [[ "$h" == systemd || "$h" == udev ]] && ((placed == 0)); then out_h+=(plymouth); placed=1; fi
  done
  ((placed)) || out_h+=(plymouth)
  sudo_run mkdir -p /etc/mkinitcpio.conf.d
  write_root_file /etc/mkinitcpio.conf.d/haotica.conf <<EOF
# HAOTICA: ранний KMS для Radeon 8060S и заставка Plymouth
MODULES=(${out_m[*]})
HOOKS=(${out_h[*]})
EOF
}

mod_run() {
  local params gib
  pac_install linux linux-headers linux-firmware amd-ucode mkinitcpio plymouth
  params="$(kernel_params)"
  gib="$(kernel_gtt_gib)"
  ui_kv "ПАМЯТЬ ДЛЯ GPU (GTT)" "${gib} ГиБ из ${HW_RAM_GIB} ГиБ"
  ui_kv "ПАРАМЕТРЫ" "iommu=pt amd_pstate=active ttm=${gib}G"

  write_root_file /etc/modprobe.d/haotica-ttm.conf <<EOF
# HAOTICA: лимит памяти, которую GPU может занять динамически (GTT), ${gib} ГиБ
options ttm pages_limit=$((gib * 262144)) page_pool_size=$((gib * 262144))
EOF
  echo "$params" | write_root_file "$HY_ETC/kernel-params.txt"

  mkinitcpio_setup

  case "$HW_BOOTLOADER" in
    systemd-boot) apply_systemd_boot "$params" ;;
    uki) apply_uki "$params" ;;
    grub) apply_grub "$params" ;;
    limine) apply_limine "$params" || ui_warn "Не нашёл конфиг Limine" ;;
    refind) apply_refind "$params" ;;
    *)
      ui_warn "Загрузчик не распознан. Добавьте параметры ядра вручную:"
      ui_plate "$params"
      ui_note "Они сохранены в $HY_ETC/kernel-params.txt"
      ;;
  esac

  ui_log "Пересобираю initramfs"
  sudo_run mkinitcpio -P >/dev/null
  mark_reboot
}
