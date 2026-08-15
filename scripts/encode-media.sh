#!/usr/bin/env bash
#
# Turn a camera/WhatsApp master into a clip fit for the wall.
#
#   ./scripts/encode-media.sh media-source/raw/whatever.mp4 v1
#
# Writes media-source/encoded/<key>.mp4 and copies it to src/assets/video/<key>.mp4,
# which is what src/lib/config.js imports.
#
# The flags are not generic "make it smaller" settings — each one buys something
# this deployment needs:
#
#   -g 24 -keyint_min 24 -sc_threshold 0
#       A keyframe exactly every second, with no scene-cut variance. SyncedVideo
#       corrects drift by writing `currentTime`, and a seek can only land on a
#       keyframe: sparse or unevenly spaced ones mean the ten panels snap to
#       different frames after the same correction. This is the single most
#       important flag here, and it is a sync flag, not a size flag.
#
#   -crf 24 -preset slow
#       Quality target rather than a bitrate target, so a still shot spends
#       nothing and a busy one spends what it needs. `slow` is free — it costs
#       encode time here, never playback time on the panel.
#
#   -maxrate 6M -bufsize 12M
#       A ceiling the cheapest panel in the wall can still decode in real time.
#       A screen that cannot keep up falls behind, and SyncedVideo deliberately
#       stops correcting a starved pipeline (readyState < 3) rather than turning
#       a slow screen into a stuttering one — so the fix has to be here.
#
#   -profile:v high -level 4.0 -pix_fmt yuv420p
#       The decode path every browser and signage stick actually has in hardware.
#
#   -movflags +faststart
#       Moov atom first. videoCache.js fetches the whole file before playing a
#       frame, so this matters less than usual, but it costs nothing and makes
#       the streaming fallback (preferBlobPlayback = false) behave.
#
# Audio is kept at 128k even though the screens play muted, because unmuting is
# a one-line change in SyncedVideo and re-encoding to get sound back is not.
# To strip it and save ~15%, swap `-c:a aac …` for `-an`.

set -euo pipefail

SRC="${1:?usage: encode-media.sh <source-file> <key>}"
KEY="${2:?usage: encode-media.sh <source-file> <key>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/media-source/encoded/$KEY.mp4"
DEST="$ROOT/src/assets/video/$KEY.mp4"

mkdir -p "$(dirname "$OUT")" "$(dirname "$DEST")"

ffmpeg -y -i "$SRC" \
  -c:v libx264 -preset slow -crf 24 \
  -profile:v high -level 4.0 -pix_fmt yuv420p \
  -g 24 -keyint_min 24 -sc_threshold 0 -r 24 \
  -maxrate 6M -bufsize 12M \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$OUT"

cp "$OUT" "$DEST"

echo
echo "$KEY:"
ffprobe -v error -show_entries format=duration,size,bit_rate \
  -show_entries stream=codec_name,width,height,r_frame_rate \
  -of default=noprint_wrappers=1 "$DEST"
