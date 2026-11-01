# HAOTICA: терминал подключает интеграцию через свой ZDOTDIR, а файлы пользователя читаются как обычно
if [[ -f ${HAOTICA_USER_ZDOTDIR:-$HOME}/.zshenv ]]; then
  _hy_zd=$ZDOTDIR; ZDOTDIR=${HAOTICA_USER_ZDOTDIR:-$HOME}
  . "$ZDOTDIR/.zshenv"
  HAOTICA_USER_ZDOTDIR=$ZDOTDIR; ZDOTDIR=$_hy_zd; unset _hy_zd
fi
