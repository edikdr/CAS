#!/usr/bin/env bash
# HYPERINA installer — пакеты: pacman, AUR (paru), списки пакетов.

pkg_installed() { pacman -Qq "$1" >/dev/null 2>&1; }
pkg_in_repo()   { pacman -Si "$1" >/dev/null 2>&1; }

# Прочитать список пакетов из modules/pkglists/<имя>.txt (комментарии # разрешены)
pkglist() {
  local f="$HY_ROOT/modules/pkglists/$1.txt"
  [[ -f "$f" ]] || die "Нет списка пакетов: $f"
  sed -e 's/#.*//' "$f" | tr -s ' \t' '\n' | grep -v '^$'
}

# Установить пакеты из репозиториев (только недостающие)
pac_install() {
  local p missing=()
  for p in "$@"; do pkg_installed "$p" || missing+=("$p"); done
  ((${#missing[@]} == 0)) && return 0
  ui_info "pacman: ${missing[*]}"
  if ! retry 2 sudo_run pacman -S --needed --noconfirm "${missing[@]}"; then
    ui_warn "Обновляю базы пакетов и пробую ещё раз"
    sudo_run pacman -Syy --noconfirm
    # ставим по одному, чтобы один сбойный пакет не ломал остальные
    local failed=()
    for p in "${missing[@]}"; do
      pkg_installed "$p" && continue
      sudo_run pacman -S --needed --noconfirm "$p" || failed+=("$p")
    done
    if ((${#failed[@]})); then
      ui_err "Не установились: ${failed[*]}"
      return 1
    fi
  fi
}

pac_install_list() { local pkgs; mapfile -t pkgs < <(pkglist "$1"); pac_install "${pkgs[@]}"; }

# Удалить пакеты, если стоят (для конфликтов вроде pulseaudio ↔ pipewire-pulse)
pac_remove_if_installed() {
  local p present=()
  for p in "$@"; do pkg_installed "$p" && present+=("$p"); done
  ((${#present[@]} == 0)) && return 0
  ui_info "Убираю конфликтующие пакеты: ${present[*]}"
  sudo_run pacman -Rdd --noconfirm "${present[@]}"
}

ensure_paru() {
  have paru && return 0
  ui_info "Ставлю paru (помощник AUR)"
  pac_install base-devel git
  if [[ "$DRY_RUN" == 1 ]]; then ui_note "[dry-run] сборка paru-bin"; return 0; fi
  local tmp; tmp="$(mktemp -d)"
  if ! { git clone --depth 1 https://aur.archlinux.org/paru-bin.git "$tmp/paru-bin" &&
    (cd "$tmp/paru-bin" && makepkg -si --noconfirm --needed); }; then
    die "Не удалось собрать paru-bin"
  fi
  rm -rf "$tmp"
}

# Установить пакеты из AUR от имени пользователя
aur_install() {
  local p missing=()
  for p in "$@"; do pkg_installed "$p" || missing+=("$p"); done
  ((${#missing[@]} == 0)) && return 0
  ensure_paru
  ui_info "AUR: ${missing[*]}"
  local failed=()
  for p in "${missing[@]}"; do
    run paru -S --needed --noconfirm --skipreview --removemake --cleanafter --sudoloop "$p" || failed+=("$p")
  done
  if ((${#failed[@]})); then
    ui_warn "Из AUR не собрались: ${failed[*]}. Установка продолжается, их можно поставить позже: hyperina doctor"
    return 1
  fi
}

aur_install_list() { local pkgs; mapfile -t pkgs < <(pkglist "$1"); aur_install "${pkgs[@]}"; }

# Включить multilib в pacman.conf
ensure_multilib() {
  if grep -qE '^\[multilib\]' /etc/pacman.conf; then return 0; fi
  ui_info "Включаю репозиторий multilib (нужен Steam и 32-битным драйверам)"
  backup_root_path /etc/pacman.conf
  sudo_sh "sed -i '/^#\\[multilib\\]/{s/^#//;n;s/^#//}' /etc/pacman.conf"
  grep -qE '^\[multilib\]' /etc/pacman.conf || sudo_sh "printf '\n[multilib]\nInclude = /etc/pacman.d/mirrorlist\n' >> /etc/pacman.conf"
  sudo_run pacman -Sy --noconfirm
}

# Python-пакеты в виртуальное окружение HYPERINA
venv_pip() {
  local venv="$1"; shift
  sudo_run env UV_CACHE_DIR=/var/cache/hyperina/uv uv pip install --python "$venv/bin/python" "$@"
}
