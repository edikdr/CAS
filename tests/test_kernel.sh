#!/usr/bin/env bash
# Тест: слияние параметров ядра и правка конфигов загрузчиков (без root)
set -euo pipefail
HY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$HY_ROOT/lib/ui.sh"; source "$HY_ROOT/lib/core.sh"
sudo_q() { "$@"; }; sudo_run() { "$@"; }; sudo_sh() { bash -c "$1"; }
backup_root_path() { :; }
source "$HY_ROOT/modules/15-kernel.sh"
fail=0
check() { if [[ "$1" == "$2" ]]; then echo "ok   $3"; else echo "FAIL $3"; echo "  got: $1"; echo "  exp: $2"; fail=1; fi; }

check "$(kparams_merge "root=UUID=1 rw quiet iommu=on" "iommu=pt splash")" "root=UUID=1 rw quiet iommu=pt splash" "merge replaces same key"
check "$(kparams_merge "" "a=1 b")" "a=1 b" "merge into empty"

HW_RAM_GIB=63; check "$(kernel_gtt_gib)" "56" "gtt for 64GB"
HW_RAM_GIB=31; check "$(kernel_gtt_gib)" "23" "gtt for 32GB"

T="$(mktemp -d)"
HW_ESP="$T/esp"; mkdir -p "$HW_ESP/loader/entries"
cat > "$HW_ESP/loader/entries/arch.conf" <<'C'
title   Arch Linux
linux   /vmlinuz-linux
initrd  /initramfs-linux.img
options root=UUID=abc rw rootflags=subvol=@ iommu=on
C
cat > "$HW_ESP/loader/entries/memtest.conf" <<'C'
title memtest
efi /memtest.efi
C
DRY_RUN=0 apply_systemd_boot "iommu=pt quiet splash" >/dev/null
check "$(grep '^options' "$HW_ESP/loader/entries/arch.conf")" "options root=UUID=abc rw rootflags=subvol=@ iommu=pt quiet splash" "systemd-boot options updated"
check "$(grep '^options' "$HW_ESP/loader/entries/hyperina-safe.conf")" "options root=UUID=abc rw rootflags=subvol=@ iommu=on" "safe entry keeps original"
check "$(grep -c '^options' "$HW_ESP/loader/entries/memtest.conf" || true)" "0" "non-linux entry untouched"

cat > "$T/limine.conf" <<'C'
/Arch Linux
    protocol: linux
    path: boot():/vmlinuz-linux
    cmdline: root=UUID=abc rw iommu=on
C
HW_ESP="$T"; DRY_RUN=0 apply_limine "iommu=pt splash" >/dev/null
check "$(grep 'cmdline' "$T/limine.conf")" "    cmdline: root=UUID=abc rw iommu=pt splash" "limine cmdline updated"
rm -rf "$T"
exit $fail
