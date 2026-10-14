#!/bin/sh
# tools/subset_fonts.sh - OFL source fonts -> subset woff2 next to their OFL.txt (CONTRACT section 2).
#   sh tools/subset_fonts.sh        needs: pip install fonttools brotli
# Latin + Latin-1 + typographic quotes/dashes/ellipsis; default features only (the stylistic
# alternates of Luxurious Script triple the file). Add a line per new font.
set -e
cd "$(dirname "$0")/.."
UNICODES="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026"

subset() { # source.ttf output.woff2
  pyftsubset "$1" --unicodes="$UNICODES" --layout-features='kern,liga,ccmp,locl' --flavor=woff2 --output-file="$2"
  echo "$2: $(wc -c < "$2") bytes"
}

subset assets/fonts/luxurious-script/LuxuriousScript-Regular.ttf assets/fonts/luxurious-script/luxurious-script-latin.woff2
