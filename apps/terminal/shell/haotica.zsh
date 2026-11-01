# HAOTICA terminal ⇄ zsh
#   OSC 133 A/B/C/D — границы приглашения, команды и вывода (блоки команд)
#   OSC 7           — текущая папка (файловая панель следует за cd)
#   OSC 7777        — текст команды и служебные события для блоков
[[ -o interactive ]] || return 0
[[ $TERM_PROGRAM == haotica ]] || return 0
autoload -Uz add-zsh-hook add-zle-hook-widget

_hy_osc() { printf '\e]%s\a' "$1" }
_hy_b64() { printf '%s' "$1" | base64 -w0 2>/dev/null || printf '%s' "$1" | base64 | tr -d '\n' }
_hy_cwd() {
  local p=${PWD//\%/%25}; p=${p// /%20}; p=${p//#/%23}
  _hy_osc "7;file://${HOST}${p}"
}
_hy_precmd() {
  local ret=$?
  [[ -n $_hy_running ]] && _hy_osc "133;D;$ret"
  _hy_running=
  _hy_cwd
  _hy_osc "133;A"
  # маркер конца приглашения добавляем в конец PS1 (темы вроде starship пересобирают PS1 каждый раз)
  [[ $PS1 == *$'\e]133;B'* ]] || PS1+=$'%{\e]133;B\a%}'
}
_hy_preexec() {
  _hy_osc "7777;cmd=$(_hy_b64 "$1")"
  _hy_osc "133;C"
  _hy_running=1
}
add-zsh-hook precmd _hy_precmd
add-zsh-hook preexec _hy_preexec
add-zsh-hook chpwd _hy_cwd

# команда, переданная терминалу при запуске (`haotica open terminal --run "…"`)
if [[ -n $HAOTICA_RUN ]]; then
  _hy_pending=$HAOTICA_RUN; unset HAOTICA_RUN
  _hy_autorun() { [[ -n $_hy_pending ]] || return; BUFFER=$_hy_pending; _hy_pending=; zle accept-line }
  add-zle-hook-widget line-init _hy_autorun
fi

# ссылки на файлы в выводе (клик — превью, двойной клик — открыть)
(( $+aliases[ls] )) || alias ls='ls --color=auto --hyperlink=auto'
(( $+commands[eza] )) && ! (( $+aliases[ll] )) && alias ll='eza -l --icons=auto --git --hyperlink --group-directories-first'
(( $+commands[fd] )) && ! (( $+aliases[fd] )) && alias fd='fd --hyperlink=auto'
(( $+commands[rg] )) && ! (( $+aliases[rg] )) && alias rg='rg --hyperlink-format=default'

# подсказки в строке: сначала история, затем быстрая локальная модель Haotica (асинхронно)
_zsh_autosuggest_strategy_haotica() {
  emulate -L zsh
  local prefix=$1
  (( ${#prefix} >= 3 )) || return
  local tok; tok=$(<"${XDG_STATE_HOME:-$HOME/.local/state}/haotica/token" 2>/dev/null) || return
  local s; s=$(curl -s -m 0.8 -G -H "X-Haotica-Token: $tok" --data-urlencode "q=$prefix" \
               --data-urlencode "cwd=$PWD" http://127.0.0.1:47810/api/complete/shell 2>/dev/null)
  [[ -n $s && $s == "$prefix"* ]] && typeset -g suggestion=$s
}
if (( $+functions[_zsh_autosuggest_start] )); then
  ZSH_AUTOSUGGEST_STRATEGY=(history haotica)
  ZSH_AUTOSUGGEST_USE_ASYNC=1
fi

# Haotica прямо из строки: «?? вопрос» или «hy вопрос»
hy() { command haotica ask "$*" }
alias '??'='noglob hy'
