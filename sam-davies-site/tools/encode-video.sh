#!/usr/bin/env bash
# Scrub-friendly encodes of the scroll video + poster/end/stills.
# Usage: tools/encode-video.sh <input.mp4> [outdir=site/media]
# Budgets (TZ §4.3): 720 variant ≤ 6 MB (mobile), 1080 variant ≤ 12 MB (desktop).
# CRF starts at 24 and is raised until the file fits; the chosen CRF is printed.
set -euo pipefail
IN="${1:?input video}"; OUT="${2:-site/media}"; mkdir -p "$OUT/stills"
MB=1000000  # decimal MB (stricter than MiB)
size() { stat -c %s "$1"; }

enc_mp4() { # height crf out
  ffmpeg -v error -y -i "$IN" -vf "scale=-2:$1,fps=24" -c:v libx264 -preset slow -crf "$2" -g 2 \
    -pix_fmt yuv420p -movflags +faststart -an "$3"
}
enc_webm() { # height crf out   (VP9 fallback for browsers without H.264, e.g. open-source Chromium)
  ffmpeg -v error -y -i "$IN" -vf "scale=-2:$1,fps=24" -c:v libvpx-vp9 -b:v 0 -crf "$2" -g 2 \
    -deadline good -cpu-used 2 -row-mt 1 -pix_fmt yuv420p -an "$3"
}
fit() { # kind height budgetMB crf0 crfMax out
  local kind=$1 h=$2 budget=$(($3*MB)) crf=$4 max=$5 out=$6
  while :; do
    "enc_$kind" "$h" "$crf" "$out"
    local s; s=$(size "$out")
    printf '%-28s crf=%-3s %6.2f MB\n' "$(basename "$out")" "$crf" "$(echo "$s/$MB" | bc -l)"
    if [ "$s" -le "$budget" ] || [ "$crf" -ge "$max" ]; then break; fi
    crf=$((crf+1))
  done
}

fit mp4  1080 12 24 30 "$OUT/scroll-1080.mp4"
fit mp4   720  6 26 32 "$OUT/scroll-720.mp4"
fit webm 1080 12 35 44 "$OUT/scroll-1080.webm"
fit webm  720  6 40 46 "$OUT/scroll-720.webm"

# Poster (LCP) = frame 0, ≤ 60 KB; end frame for the post-video background.
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
ffmpeg -v error -y -i "$IN" -frames:v 1 -vf "scale=-2:720" "$OUT/.poster.png"
ffmpeg -v error -y -sseof -0.08 -i "$IN" -frames:v 1 -vf "scale=-2:1080" "$OUT/.end.png"
# Reduced-motion / reduced-data stills: one per act (p = .12, .45, .8, 1.0).
i=0; for p in 0.12 0.45 0.80 0.99; do
  t=$(echo "$DUR*$p" | bc -l)
  ffmpeg -v error -y -ss "$t" -i "$IN" -frames:v 1 -vf "scale=-2:720" "$OUT/stills/.act$i.png"; i=$((i+1))
done
node "$(dirname "$0")/encode-images.mjs" "$OUT"
