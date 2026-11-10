# STV website

Static site in `website/site/` (HTML, CSS and JavaScript, no build step), published on Cloudflare Pages.

| Setting | Value |
|---|---|
| Live URL | https://stv-tools.pages.dev/ |
| Pages project | `stv-tools` (Direct Upload, production branch `main`) |
| Source | `website/site/` |
| Fonts | Inter and IBM Plex Sans Arabic, SIL OFL 1.1 (licence files in `assets/fonts/`) |

## Preview locally

```bash
python -m http.server 8766 --directory website/site
```

Open http://127.0.0.1:8766 and check English, Arabic (RTL), a 390 px wide window and the demo video.

## Deploy

Requires Wrangler logged in to the account that owns the project (`wrangler login --scopes account:read user:read pages:write`).

```bash
npx wrangler pages deploy website/site --project-name stv-tools --branch main
npx wrangler pages deployment list --project-name stv-tools
```

Roll back by promoting an earlier deployment in the Cloudflare dashboard (Pages → stv-tools → Deployments).

## Updating for a new release

1. Replace the version, size and SHA-256 in `index.html` (hero meta line, download card, footer) and the download URL
   `releases/download/vX.Y.Z/STV-vX.Y.Z-AndroidTV.apk` everywhere it appears.
2. Keep the release type (Stable or Pre-release) identical on GitHub, in the README and on the site.

## Promo video

`website/site/assets/video/stv-demo.mp4` is built from real screen recordings of STV on an Android TV box
(`adb shell screenrecord`), original synthesized music and the STV logo:

```bash
python website/tools/gen_promo_music.py 36.4 <work>/music.wav
powershell -File website/tools/make_promo_frames.ps1 <work>
FFMPEG=/path/to/ffmpeg bash website/tools/build_promo.sh <work> website/site/assets/video
```

The work folder holds `raw_s1.mp4` … `raw_s4.mp4`, `logo.png` (a large STV logo from `scripts/art/PrepLogos.java <src> <dir> 400`)
and `inter.ttf`. Raw recordings are not committed because they come from a personal device. Captions are in
`site/assets/video/stv-demo.en.vtt` and `stv-demo.ar.vtt`.
