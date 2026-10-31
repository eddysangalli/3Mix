Add-Type -AssemblyName System.Drawing
$srcPath = 'D:\DRIVE\IA\antigravity\3Mix\3mix-panel\painel\img\ref_replay.jpg'
$outDir = 'D:\DRIVE\IA\antigravity\3Mix\3mix-panel\qa-finalizacao\replay-mockup-visual-20261030\ref'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$src = [System.Drawing.Image]::FromFile($srcPath)
$regions = [ordered]@{
  'top'      = @(0, 0, 1024, 120)
  'players'  = @(0, 65, 1024, 195)
  'timeline' = @(0, 265, 1024, 105)
  'events'   = @(0, 360, 1024, 120)
  'details'  = @(0, 478, 1024, 205)
  'footer'   = @(0, 680, 1024, 88)
}
foreach ($key in $regions.Keys) {
  $r = $regions[$key]
  $x = [int]$r[0]; $y = [int]$r[1]; $w = [int]$r[2]; $h = [int]$r[3]
  $bmp = [System.Drawing.Bitmap]::new($w * 2, $h * 2)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $dest = [System.Drawing.Rectangle]::new(0, 0, $w * 2, $h * 2)
  $source = [System.Drawing.Rectangle]::new($x, $y, $w, $h)
  $g.DrawImage($src, $dest, $source, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save((Join-Path $outDir ($key + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
$src.Dispose()
Get-ChildItem $outDir | Select-Object Name, Length
