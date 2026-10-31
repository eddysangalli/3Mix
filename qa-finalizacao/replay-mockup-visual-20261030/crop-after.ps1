Add-Type -AssemblyName System.Drawing
$srcPath = 'D:\DRIVE\IA\antigravity\3Mix\3mix-panel\qa-finalizacao\replay-mockup-visual-20261030\after\replay-1440x900.png'
$outDir = 'D:\DRIVE\IA\antigravity\3Mix\3mix-panel\qa-finalizacao\replay-mockup-visual-20261030\ref'
$src = [System.Drawing.Image]::FromFile($srcPath)
$regions = [ordered]@{
  'after-top-left' = @(0, 0, 420, 100)
  'after-detail'   = @(820, 590, 620, 260)
  'after-footer'   = @(820, 840, 620, 60)
  'after-player'   = @(0, 90, 500, 350)
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
