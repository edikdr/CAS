#!/usr/bin/env bash
# shellcheck disable=SC2034
MOD_TITLE="Пользователь: zsh, Hyprland, группы, первая тема"
MOD_CRITICAL=1

user_zsh() {
  local zsh; zsh="$(command -v zsh || echo /usr/bin/zsh)"
  if [[ "$(getent passwd "$HY_USER" | cut -d: -f7)" != "$zsh" ]]; then
    sudo_run chsh -s "$zsh" "$HY_USER"
  fi
  # свой ~/.zshrc не трогаем: добавляем только подключение HAOTICA (один раз, между метками)
  local rc="$HY_HOME/.zshrc"
  if [[ ! -f "$rc" ]]; then
    write_user_file "$rc" <<'EOF2'
# ~/.zshrc — ваш файл; HAOTICA добавляет только блок ниже
HISTFILE=~/.zsh_history HISTSIZE=50000 SAVEHIST=50000
setopt share_history hist_ignore_dups hist_ignore_space autocd interactive_comments
autoload -Uz compinit && compinit -d ~/.cache/zcompdump
bindkey -e
EOF2
  fi
  if ! grep -q '>>> HAOTICA' "$rc" 2>/dev/null; then
    [[ "$DRY_RUN" == 1 ]] && { ui_note "[dry-run] блок HAOTICA в ~/.zshrc"; return 0; }
    cat >>"$rc" <<'EOF2'

# >>> HAOTICA >>>
for _p in /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh \
          /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh; do
  [[ -r $_p ]] && . $_p
done; unset _p
(( $+commands[fzf] )) && source <(fzf --zsh 2>/dev/null)
hy() { command haotica ask "$*" }          # Haotica из любой консоли: hy вопрос / ?? вопрос
alias '??'='noglob hy'
# <<< HAOTICA <<<
EOF2
  fi
}

user_hypr() {
  local dst="$HY_HOME/.config/hypr" src="$HY_PREFIX_SHARE/hypr"
  [[ -d "$src" ]] || src="$HY_ROOT/config/hypr"
  if [[ "$DRY_RUN" == 1 ]]; then ui_note "[dry-run] $src → $dst (user.lua сохраняется)"; return 0; fi
  [[ -d "$dst" ]] && backup_user_path "$dst"
  mkdir -p "$dst"
  rsync -a --exclude 'user.lua' "$src/" "$dst/"
  [[ -f "$dst/user.lua" ]] || install -m 0644 "$src/user.lua" "$dst/user.lua"
}

user_dirs() {
  run xdg-user-dirs-update || true
  run mkdir -p "$HY_HOME/.config/haotica" "$HY_HOME/.local/share/haotica" "$HY_HOME/.local/state/haotica" "$HY_HOME/Notes"
  # токен API (0600): ядро и приложения узнают друг друга
  run haotica token >/dev/null
}

user_groups() {
  local g groups=()
  for g in video input render audio lp network wheel gamemode; do
    getent group "$g" >/dev/null && ! id -nG "$HY_USER" | tr ' ' '\n' | grep -qx "$g" && groups+=("$g")
  done
  ((${#groups[@]})) && sudo_run usermod -aG "$(IFS=,; echo "${groups[*]}")" "$HY_USER"
  return 0
}

user_first_theme() {
  run haotica theme apply --no-reload >/dev/null || ui_warn "Первая тема не применилась — повторится при входе"
  # портрет Haotica для оболочки: рисуется приложением, которому нужно ядро — поднимаем его ненадолго
  [[ -f "$HY_HOME/.local/share/haotica/avatar/idle.png" ]] && return 0
  [[ "$DRY_RUN" == 1 ]] && { ui_note "[dry-run] портрет Haotica"; return 0; }
  local rt; rt="$(mktemp -d)"; chmod 700 "$rt"
  XDG_RUNTIME_DIR="$rt" PYTHONPATH="$HY_PREFIX_LIB/python" python3 -m haotica.server >/dev/null 2>&1 &
  local pid=$!
  sleep 4
  XDG_RUNTIME_DIR="$rt" timeout 120 haotica theme portrait >/dev/null 2>&1 ||
    ui_note "Портрет Haotica появится после первого входа (haotica theme portrait)"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -rf "$rt"
}

mod_run() {
  user_groups
  user_zsh
  user_hypr
  user_dirs
  user_first_theme
  # в сеансе пользователя (если установка идёт из него) — перечитать юниты
  user_systemctl daemon-reload
  ui_ok "Профиль $HY_USER готов"
}
