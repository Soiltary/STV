# Draws the static layers of the STV promo: the 1920x1080 background (navy with blue/violet glow and a framed
# screen area) and the rounded-corner alpha mask used for the TV footage.
#   powershell -File website/tools/make_promo_frames.ps1 <outDir>
param([string]$OutDir)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, 2*$r, 2*$r, 180, 90); $p.AddArc($x+$w-2*$r, $y, 2*$r, 2*$r, 270, 90)
  $p.AddArc($x+$w-2*$r, $y+$h-2*$r, 2*$r, 2*$r, 0, 90); $p.AddArc($x, $y+$h-2*$r, 2*$r, 2*$r, 90, 90)
  $p.CloseFigure(); return $p
}
function Glow($g, [float]$cx, [float]$cy, [float]$rx, [float]$ry, [System.Drawing.Color]$c) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddEllipse($cx-$rx, $cy-$ry, 2*$rx, 2*$ry)
  $b = New-Object System.Drawing.Drawing2D.PathGradientBrush($p)
  $b.CenterColor = $c; $b.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
  $g.FillPath($b, $p); $b.Dispose(); $p.Dispose()
}

# background
$bmp = New-Object System.Drawing.Bitmap 1920, 1080
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(255, 4, 6, 14))
Glow $g 360 160 900 520 ([System.Drawing.Color]::FromArgb(90, 40, 90, 255))
Glow $g 1620 980 900 520 ([System.Drawing.Color]::FromArgb(80, 130, 70, 240))
Glow $g 960 540 700 380 ([System.Drawing.Color]::FromArgb(40, 60, 120, 255))
# soft frame halo behind the screen area (1536x864 at 192,52)
for ($i = 12; $i -ge 1; $i--) {
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb([int](6 + (12 - $i) * 2), 90, 150, 255)), ($i * 3)
  $path = RoundRect 192 52 1536 864 26
  $g.DrawPath($pen, $path); $pen.Dispose(); $path.Dispose()
}
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(110, 120, 170, 255)), 2
$path = RoundRect 191 51 1538 866 27; $g.DrawPath($pen, $path)
$bmp.Save((Join-Path $OutDir 'bg-framed.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# plain background for title cards
$bmp = New-Object System.Drawing.Bitmap 1920, 1080
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(255, 3, 5, 12))
Glow $g 960 470 1000 520 ([System.Drawing.Color]::FromArgb(70, 50, 110, 255))
Glow $g 1500 900 800 420 ([System.Drawing.Color]::FromArgb(55, 130, 70, 240))
Glow $g 400 200 700 380 ([System.Drawing.Color]::FromArgb(45, 40, 140, 255))
$bmp.Save((Join-Path $OutDir 'bg-title.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# rounded mask for the footage
$bmp = New-Object System.Drawing.Bitmap 1536, 864
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Black)
$path = RoundRect 0 0 1535 863 26
$g.FillPath([System.Drawing.Brushes]::White, $path)
$bmp.Save((Join-Path $OutDir 'mask.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "frames written to $OutDir"
