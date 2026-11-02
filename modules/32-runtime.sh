#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Ядро HAOTICA: Python, службы, приложения, polkit"
MOD_CRITICAL=1

mod_run() {
  pac_install_list runtime

  # код Python, приложения, исполняемые файлы
  install_root_tree "$HY_ROOT/core/haotica" "$HY_PREFIX_LIB/python/haotica"
  install_root_tree "$HY_ROOT/apps" "$HY_PREFIX_SHARE/apps"
  local f
  for f in "$HY_ROOT"/system/usr/bin/*; do
    install_root_file "$f" "/usr/bin/$(basename "$f")" 0755
  done
  for f in "$HY_ROOT"/system/usr/lib/haotica/bin/*; do
    install_root_file "$f" "$HY_PREFIX_LIB/bin/$(basename "$f")" 0755
  done
  for f in "$HY_ROOT"/system/usr/lib/systemd/user/*; do
    install_root_file "$f" "/usr/lib/systemd/user/$(basename "$f")"
  done
  install_root_file "$HY_ROOT/system/usr/share/polkit-1/actions/org.haotica.helper.policy" \
    /usr/share/polkit-1/actions/org.haotica.helper.policy
  install_root_file "$HY_ROOT/system/usr/share/sounds/haotica/index.theme" /usr/share/sounds/haotica/index.theme
  install_root_file "$HY_ROOT/system/etc/pam.d/haotica-lock" /etc/pam.d/haotica-lock
  [[ -d "$HY_ROOT/assets/sounds" ]] && install_root_tree "$HY_ROOT/assets/sounds" /usr/share/sounds/haotica/stereo
  [[ -f "$HY_ROOT/docs/README.md" ]] && install_root_file "$HY_ROOT/docs/README.md" /usr/share/doc/haotica/README.md
  sudo_run install -d -m 0755 "$HY_ETC" "$HY_PREFIX_OPT"
  sudo_run python3 -m compileall -q "$HY_PREFIX_LIB/python" >/dev/null 2>&1 || true

  # все зависимости Python должны прийти из репозиториев; иначе — отдельное окружение /opt/haotica/venv
  if [[ "$DRY_RUN" != 1 ]]; then
    local missing
    missing=$(python3 - <<'PY'
import importlib
mods = {"aiohttp": "aiohttp", "psutil": "psutil", "PIL": "pillow", "numpy": "numpy", "markdown": "markdown",
        "pygments": "pygments", "tomli_w": "tomli-w", "dateutil": "python-dateutil", "fontTools": "fonttools",
        "PySide6.QtWebEngineWidgets": "PySide6"}
out = []
for m, pip in mods.items():
    try:
        importlib.import_module(m)
    except Exception:
        out.append(pip)
print(" ".join(out))
PY
)
    if [[ -n "$missing" ]]; then
      ui_warn "Python-модулей нет в системе: $missing — ставлю в $HY_PREFIX_OPT/venv"
      [[ -x "$HY_PREFIX_OPT/venv/bin/python" ]] || sudo_run uv venv --system-site-packages "$HY_PREFIX_OPT/venv"
      # shellcheck disable=SC2086
      venv_pip "$HY_PREFIX_OPT/venv" $missing
      local site; site=$("$HY_PREFIX_OPT/venv/bin/python" -c 'import site; print(site.getsitepackages()[0])')
      local purelib; purelib=$(python3 -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')
      write_root_file "$purelib/haotica-venv.pth" <<<"$site"
    fi
  fi

  sudo_run systemctl daemon-reload
  # ядро и оболочку поднимает haotica-session.target (его стартует Hyprland); Haotica — вместе с ним.
  # Модели (haotica-llm-*) запускает сама Haotica, когда файлы скачаны.
  enable_user_unit_global haotica-agent.service
  sudo_run systemctl --global disable haotica-llm-base.service haotica-llm-fast.service haotica-llm-deep.service \
    haotica-tts.service haotica-gestures.service >/dev/null 2>&1 || true
  if [[ "$DRY_RUN" != 1 ]] && ! /usr/bin/haotica --version >/dev/null 2>&1; then
    die "haotica не запускается: python3 -m haotica.cli — проверьте журнал"
  fi
  ui_ok "Ядро, Haotica и приложения установлены"
}
