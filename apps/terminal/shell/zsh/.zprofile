if [[ -f ${HYPERINA_USER_ZDOTDIR:-$HOME}/.zprofile ]]; then
  _hy_zd=$ZDOTDIR; ZDOTDIR=${HYPERINA_USER_ZDOTDIR:-$HOME}
  . "$ZDOTDIR/.zprofile"
  HYPERINA_USER_ZDOTDIR=$ZDOTDIR; ZDOTDIR=$_hy_zd; unset _hy_zd
fi
