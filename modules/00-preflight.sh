#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Проверка системы"
MOD_CRITICAL=1

mod_run() {
  local free_root free_home need_gb=90

  ui_log "Проверяю интернет"
  curl -fsS --max-time 15 -o /dev/null https://archlinux.org ||
    die "Нет интернета. Подключитесь (nmtui или iwctl) и запустите установщик снова."
  ui_ok "Интернет есть"

  ((HW_UEFI)) || ui_warn "Система загружена не в режиме UEFI. Установка продолжится, но загрузчик придётся проверить вручную."

  if ! id -nG "$HY_USER" | grep -qw wheel; then
    ui_warn "Пользователь $HY_USER не в группе wheel. Добавляю."
    sudo_run usermod -aG wheel "$HY_USER"
  fi

  free_root=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  free_home=$(df -BG --output=avail "$HY_HOME" | tail -1 | tr -dc 0-9)
  ui_kv "СВОБОДНО (/)" "${free_root} ГБ"
  ui_kv "СВОБОДНО (~)" "${free_home} ГБ"
  if [[ "$NO_MODELS" != 1 ]] && ((free_home < need_gb)); then
    ui_warn "Для моделей ИИ нужно около ${need_gb} ГБ в домашнем каталоге, свободно ${free_home} ГБ."
    if ui_confirm "Продолжить без скачивания моделей (их можно скачать позже)?" y; then
      save_install_var NO_MODELS 1
    else
      die "Освободите место и запустите установщик снова."
    fi
  fi

  if ((HW_ON_AC == 0)) && [[ -n "${HW_BAT_PCT:-}" ]] && ((HW_BAT_PCT < 40)); then
    ui_warn "Ноутбук работает от батареи (${HW_BAT_PCT}%). Сборка и загрузка займут час и больше."
    ui_confirm "Подключите зарядку. Продолжить?" y || die "Остановлено по вашему решению."
  fi

  if ((HW_UMA_VRAM_MB > 4096)); then
    ui_warn "В BIOS под видеокарту зарезервировано ${HW_UMA_VRAM_MB} МиБ (UMA)."
    ui_note "Эта память навсегда отрезана от системы. HYPERINA выдаёт память видеокарте динамически (GTT ~56 ГиБ),"
    ui_note "поэтому в BIOS лучше выставить минимум: Advanced → UMA Frame Buffer Size → 512M (или Auto)."
  fi

  if [[ "$HW_SECURE_BOOT" == enabled ]]; then
    ui_warn "Включён Secure Boot. Модули ядра из AUR (если понадобятся) придётся подписать — установщик подскажет."
  fi

  local kv="${HW_KERNEL_RUNNING%%-*}" major minor
  major="${kv%%.*}"; minor="${kv#*.}"; minor="${minor%%.*}"
  if ((major < 6 || (major == 6 && minor < 18))); then
    ui_warn "Ядро $kv старее 6.18 — для Strix Halo нужно новее. Оно обновится на следующем шаге."
  fi

  if ((HW_IS_LEGION == 0)); then
    ui_warn "Это не Lenovo Legion (${HW_MODEL:-неизвестно}). Ноутбучные настройки будут применены только там, где железо совпадает."
  fi

  ui_rule
  ui_note "Будет установлено: Hyprland + оболочка HYPERINA, Haotica (локальный ИИ), приложения, темы, звуки."
  ui_note "Загрузка: ~6 ГБ пакетов и ~50 ГБ моделей ИИ (модели качаются в фоне после установки)."
  ui_note "Время: 40–90 минут в зависимости от интернета."
  ui_confirm "Начинаем?" y || die "Остановлено по вашему решению."
}
