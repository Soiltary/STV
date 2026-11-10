#!/usr/bin/env bash
# Builds the STV promo video from real screen recordings of the app (adb shell screenrecord on an Android TV box).
#   FFMPEG=/path/to/ffmpeg website/tools/build_promo.sh <work dir with raw_s1..s4.mp4, bg-*.png, mask.png, logo.png, inter.ttf, music.wav> <out dir>
# Output: stv-demo.mp4 (1080p H.264 + AAC, faststart) and stv-demo-poster.jpg.
set -euo pipefail
W="$1"; OUT="$2"; FF="${FFMPEG:-ffmpeg}"
mkdir -p "$OUT"; cd "$W"
X=0.4   # crossfade length

seg() { # name raw start srcdur speed outdur caption
  local name=$1 raw=$2 ss=$3 t=$4 sp=$5 d=$6 cap=$7
  "$FF" -hide_banner -loglevel error -y -ss "$ss" -t "$t" -i "$raw" -loop 1 -t "$d" -i bg-framed.png -loop 1 -t "$d" -i mask.png \
    -filter_complex "[0:v]setpts=(PTS-STARTPTS)/$sp,fps=30,scale=1536:864:flags=lanczos,tpad=stop_mode=clone:stop_duration=4,trim=duration=$d,setpts=PTS-STARTPTS,format=yuva420p[ui];\
[2:v]fps=30,format=gray[m];[ui][m]alphamerge[uim];[1:v]fps=30[bg];[bg][uim]overlay=192:52:shortest=1,\
drawtext=fontfile=inter.ttf:text='$cap':fontsize=40:fontcolor=white:x=(w-tw)/2:y=958:alpha='min(1,max(0,(t-0.35)/0.45))',format=yuv420p[v]" \
    -map "[v]" -r 30 -c:v libx264 -preset medium -crf 16 "$name.mp4"
}

card() { # name dur logoHeight logoY line1 size1 y1 line2 size2 y2
  local name=$1 d=$2 lh=$3 ly=$4 l1=$5 s1=$6 y1=$7 l2=$8 s2=$9 y2=${10}
  local t2=""
  if [ -n "$l2" ]; then t2=",drawtext=fontfile=inter.ttf:text='$l2':fontsize=$s2:fontcolor=0xB9C4E6:x=(w-tw)/2:y=$y2:alpha='min(1,max(0,(t-1.3)/0.5))'"; fi
  "$FF" -hide_banner -loglevel error -y -loop 1 -t "$d" -i bg-title.png -loop 1 -t "$d" -i logo.png \
    -filter_complex "[1:v]fps=30,scale=-1:$lh,format=rgba,fade=t=in:st=0.15:d=0.8:alpha=1,scale=w='iw*(0.95+0.05*min(t/$d\,1))':h=-1:eval=frame[lg];\
[0:v]fps=30[bg];[bg][lg]overlay=x=(W-w)/2:y=$ly+(${lh}-h)/2:shortest=1,\
drawtext=fontfile=inter.ttf:text='$l1':fontsize=$s1:fontcolor=white:x=(w-tw)/2:y=$y1:alpha='min(1,max(0,(t-0.8)/0.5))'$t2,format=yuv420p[v]" \
    -map "[v]" -r 30 -c:v libx264 -preset medium -crf 16 "$name.mp4"
}

card c0 3.5 330 280 'Meet STV' 64 700 '' 0 0
seg  c1 raw_s1.mp4 1.5  5.0  1 5.0 'Your apps, weather and prayer times on one screen'
seg  c2 raw_s2.mp4 7.6  15.0 3 5.0 'Categories for everything you watch'
seg  c3 raw_s3.mp4 4.5  10.0 2 5.0 'Wallpapers that set the mood'
seg  c4 raw_s4.mp4 3.2  5.0  1 5.0 'Calm screensavers with time, weather and prayer'
seg  c5 raw_s3.mp4 20.0 9.0  2 4.5 'Nine STV logo styles'
seg  c6 raw_s3.mp4 35.5 6.0  2 3.0 'Arabic and English fonts'
seg  c7 raw_s1.mp4 6.3  4.0  1 4.0 'Built for the remote'
card c8 4.5 250 250 'Your TV. Your Space.' 68 600 'Available for Android TV' 34 700

D=(3.5 5.0 5.0 5.0 5.0 4.5 3.0 4.0 4.5)
inputs=""; for i in $(seq 0 8); do inputs="$inputs -i c$i.mp4"; done
fc=""; prev="0:v"; off=0
for i in $(seq 1 8); do
  off=$(python -c "print(round($off + ${D[$((i-1))]} - $X, 3))")
  fc="$fc[$prev][$i:v]xfade=transition=fade:duration=$X:offset=$off[x$i];"; prev="x$i"
done
csv=$(IFS=,; echo "${D[*]}")
total=$(python -c "print(round(sum([$csv]) - 8*$X, 3))")
"$FF" -hide_banner -loglevel error -y $inputs -i music.wav -filter_complex "${fc}[$prev]format=yuv420p[v];[9:a]atrim=0:$total,afade=t=out:st=$(python -c "print($total-2.5)"):d=2.5[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -profile:v high -preset slow -crf 25 -r 30 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$OUT/stv-demo.mp4"
"$FF" -hide_banner -loglevel error -y -ss 5.5 -i "$OUT/stv-demo.mp4" -frames:v 1 -q:v 3 "$OUT/stv-demo-poster.jpg"
echo "promo: $total s -> $OUT/stv-demo.mp4"
