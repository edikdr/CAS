#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Финиш: проверка системы и итог"
MOD_CRITICAL=0

mod_run() {
  if [[ "$DRY_RUN" == 1 ]]; then ui_note "[dry-run] haotica doctor"; return 0; fi
  ui_info "haotica doctor — до перезагрузки службы сеанса ещё не запущены, это нормально"
  haotica doctor || ui_note "Предупреждения выше уйдут после перезагрузки и загрузки моделей"
  ui_kv "ВХОД" "экран HAOTICA (greetd) → ваш пароль"
  ui_kv "КЛАВИШИ" "Super+Enter терминал · Super+Space лаунчер · Super+A Haotica · Super+, настройки · Super+G игра"
  ui_kv "МОДЕЛИ" "скачиваются в фоне: haotica models status"
  ui_kv "ПРОВЕРКА" "после входа: haotica doctor"
  mark_reboot
}
