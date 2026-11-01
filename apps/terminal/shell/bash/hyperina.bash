# HYPERINA terminal ⇄ bash (если основная оболочка — bash)
[[ -f ~/.bashrc ]] && . ~/.bashrc
[[ $TERM_PROGRAM == hyperina ]] || return 0
__hy_osc() { printf '\e]%s\a' "$1"; }
__hy_running= __hy_at_prompt= __hy_save=0
__hy_precmd() {
  [[ -n $__hy_running ]] && __hy_osc "133;D;$__hy_save"
  __hy_running=
  __hy_osc "7;file://${HOSTNAME}${PWD// /%20}"
  __hy_osc "133;A"
  __hy_at_prompt=1
}
__hy_preexec() {
  # DEBUG-ловушка срабатывает и на служебные команды — считаем командой только первую после приглашения
  [[ -z $__hy_at_prompt || -n $COMP_LINE || $BASH_COMMAND == __hy_* ]] && return
  __hy_at_prompt=
  __hy_osc "7777;cmd=$(printf '%s' "$BASH_COMMAND" | base64 -w0)"
  __hy_osc "133;C"
  __hy_running=1
}
trap '__hy_preexec' DEBUG
PROMPT_COMMAND="__hy_save=\$?;${PROMPT_COMMAND:+$PROMPT_COMMAND;}__hy_precmd"
PS1="$PS1\[\e]133;B\a\]"
if [[ -n $HYPERINA_RUN ]]; then __hy_run=$HYPERINA_RUN; unset HYPERINA_RUN; history -s "$__hy_run"; eval "$__hy_run"; fi
alias ls='ls --color=auto --hyperlink=auto'
