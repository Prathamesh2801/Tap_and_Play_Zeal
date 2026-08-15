#!/usr/bin/env bash
#
# Turn a master into a clip fit for the wall, plus its room-audio track.
#
#   ./scripts/encode-media.sh media-source/raw/whatever.mp4 v1
#   ./scripts/encode-media.sh media-source/raw/whatever.mp4 v1 576   # force width
#
# Writes:
#   src/assets/video/<key>.mp4   silent video, for the ten panels
#   src/assets/audio/<key>.m4a   audio only, for the controller's speakers
#
# Remember a clip only ships if it is also IMPORTED in src/lib/config.js.
#
# ── Why the video has no audio and the audio has no video ──────────────
# Ten panels playing one track a few tens of ms apart comb-filter into
# something worse than silence, so the wall is silent and the laptop driving it
# plays the sound. Two files, two devices, one shared clock.
#
# ── The invariant this script exists to enforce ────────────────────────
# THE AUDIO MUST BE EXACTLY AS LONG AS THE VIDEO. They loop independently on
# different machines, so a length mismatch is re-introduced on every pass and
# grows without bound — 29ms of mismatch is half a second of lip-sync error
# after twenty minutes, and no drift correction can fix an error that returns
# every loop. The audio is therefore trimmed to the ENCODED VIDEO's measured
# duration, not the master's, and the result is checked below.
#
# ── The other rule that got learned the hard way ───────────────────────
# NEVER ENCODE WIDER THAN THE MASTER. A 566-wide master pushed to 720 wide was
# shipped once: 62% more pixels to decode every frame, and not one pixel of
# extra detail, because the detail was never in the source.
#
# ── Why the video flags ────────────────────────────────────────────────
#   -g 24 -keyint_min 24 -sc_threshold 0
#       Keyframe exactly every second, no scene-cut variance. Drift correction
#       writes `currentTime`, and a seek only lands on a keyframe — uneven ones
#       mean ten panels snap to ten different frames. A SYNC flag, not a size one.
#   -tune fastdecode -bf 0 -refs 1
#       CAVLC instead of CABAC, no B-frames (no reorder buffer), one reference.
#       ~15% more bytes for a materially cheaper decode. Always the right trade
#       here: the clip is a blob in memory before it plays, so its SIZE never
#       affects playback — only its decode complexity does.

set -euo pipefail

SRC="${1:?usage: encode-media.sh <source-file> <key> [width]}"
KEY="${2:?usage: encode-media.sh <source-file> <key> [width]}"
FORCE_W="${3:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_V="$ROOT/media-source/encoded/$KEY.mp4"
OUT_A="$ROOT/media-source/encoded/$KEY.m4a"
DEST_V="$ROOT/src/assets/video/$KEY.mp4"
DEST_A="$ROOT/src/assets/audio/$KEY.m4a"
mkdir -p "$(dirname "$OUT_V")" "$(dirname "$DEST_V")" "$(dirname "$DEST_A")"

probe() { ffprobe -v error "$@" -of csv=p=0; }

SRC_W=$(probe -select_streams v:0 -show_entries stream=width "$SRC")

if [ -n "$FORCE_W" ]; then W="$FORCE_W"; else W=$(( (SRC_W > 720 ? 720 : SRC_W) / 16 * 16 )); fi
if [ "$W" -gt "$SRC_W" ]; then
  echo "refusing to upscale: master is ${SRC_W}px wide, asked for ${W}px" >&2
  exit 1
fi

echo "── $KEY ── master ${SRC_W}px wide → encoding at ${W}px"

ffmpeg -y -loglevel error -stats -i "$SRC" \
  -an \
  -vf "scale=${W}:-2:flags=lanczos" \
  -c:v libx264 -preset slow -crf 21 \
  -tune fastdecode -profile:v main -level 3.1 -pix_fmt yuv420p \
  -g 24 -keyint_min 24 -sc_threshold 0 -bf 0 -refs 1 -r 24 \
  -maxrate 4M -bufsize 8M \
  -movflags +faststart \
  "$OUT_V"

VID_DUR=$(probe -show_entries format=duration "$OUT_V")

if [ -z "$(probe -select_streams a -show_entries stream=index "$SRC")" ]; then
  echo "  no audio in master — skipping the room-audio track"
  cp "$OUT_V" "$DEST_V"
  exit 0
fi

# `apad` first so a master whose audio is SHORTER than its video is padded with
# silence rather than looping early; `-t` then cuts both cases to length.
ffmpeg -y -loglevel error -stats -i "$SRC" \
  -vn -af apad -t "$VID_DUR" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$OUT_A"

AUD_DUR=$(probe -show_entries format=duration "$OUT_A")

cp "$OUT_V" "$DEST_V"
cp "$OUT_A" "$DEST_A"

python - "$KEY" "$VID_DUR" "$AUD_DUR" <<'PY'
import sys
key, v, a = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
delta = (a - v) * 1000
print()
print(f"  {key}: video {v:.6f}s   audio {a:.6f}s   delta {delta:+.1f} ms/loop")
# 20ms is config.sync.softDrift, the point where correction starts nudging.
mins = (20 / abs(delta)) * (v / 60) if delta else float("inf")
print(f"  stays under the 20ms correction threshold for {mins:.0f} min" if delta
      else "  exact")
if abs(delta) > 5:
    print("  WARNING: over 5ms per loop — sync will visibly rot. Investigate.")
PY
