if [[ -f ${HAOTICA_USER_ZDOTDIR:-$HOME}/.zprofile ]]; then
  _hy_zd=$ZDOTDIR; ZDOTDIR=${HAOTICA_USER_ZDOTDIR:-$HOME}
  . "$ZDOTDIR/.zprofile"
  HAOTICA_USER_ZDOTDIR=$ZDOTDIR; ZDOTDIR=$_hy_zd; unset _hy_zd
fi
