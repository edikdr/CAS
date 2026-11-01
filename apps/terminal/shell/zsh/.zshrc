# HYPERINA: сначала настройки пользователя, затем интеграция терминала
_hy_int=${ZDOTDIR}/../hyperina.zsh
ZDOTDIR=${HYPERINA_USER_ZDOTDIR:-$HOME}
[[ -f $ZDOTDIR/.zshrc ]] && . "$ZDOTDIR/.zshrc"
[[ -f $_hy_int ]] && . "$_hy_int"
unset _hy_int
