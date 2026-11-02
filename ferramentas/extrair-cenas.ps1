# Gera as cenas fotográficas usadas pela interface do 3Mix Studio.
# Fontes: mockups de referência do próprio projeto (painel/img/ref_*.jpg).
# Os recortes são reamostrados em alta qualidade para painel/img/cena/.
Add-Type -AssemblyName System.Drawing

$raiz = Join-Path $PSScriptRoot "..\painel"
$destino = Join-Path $raiz "img\cena"
New-Item -ItemType Directory -Force -Path $destino | Out-Null

function Recortar {
    param($origem, [System.Drawing.Rectangle]$area, [string]$arquivo, [int]$larguraSaida, [int]$alturaSaida)
    $saida = New-Object System.Drawing.Bitmap $larguraSaida, $alturaSaida
    $g = [System.Drawing.Graphics]::FromImage($saida)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($origem, (New-Object System.Drawing.Rectangle 0, 0, $larguraSaida, $alturaSaida), $area, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 93
    $saida.Save((Join-Path $destino $arquivo), $codec, $params)
    $saida.Dispose()
}

$modular = [System.Drawing.Image]::FromFile((Join-Path $raiz "img\ref_modular.jpg"))
$replay  = [System.Drawing.Image]::FromFile((Join-Path $raiz "img\ref_replay.jpg"))

# ── monitores: área de vídeo pura, sem barra de título e sem medidor ──
Recortar $modular (New-Object System.Drawing.Rectangle 10, 66, 383, 186) "pv.jpg"  768 372
Recortar $modular (New-Object System.Drawing.Rectangle 663, 66, 349, 186) "pgm.jpg" 768 408

# ── fontes: enquadramentos distintos, sem rótulos queimados ──
Recortar $modular (New-Object System.Drawing.Rectangle 120, 70, 260, 146) "fonte1.jpg" 480 270
Recortar $modular (New-Object System.Drawing.Rectangle 663, 100, 260, 146) "fonte2.jpg" 480 270
Recortar $modular (New-Object System.Drawing.Rectangle 170, 120, 210, 118) "fonte3.jpg" 480 270
Recortar $modular (New-Object System.Drawing.Rectangle 750, 80, 235, 140) "fonte4.jpg" 480 270
Recortar $modular (New-Object System.Drawing.Rectangle 10, 150, 240, 100)  "fonte5.jpg" 480 200
Recortar $replay  (New-Object System.Drawing.Rectangle 30, 78, 450, 150)  "fonte6.jpg" 480 216
Recortar $modular (New-Object System.Drawing.Rectangle 675, 105, 300, 140) "fonte7.jpg" 480 256
Recortar $replay  (New-Object System.Drawing.Rectangle 560, 85, 420, 150) "fonte8.jpg" 480 216

# ── players do replay ──
Recortar $replay (New-Object System.Drawing.Rectangle 12, 72, 478, 196) "player-a.jpg" 800 328
Recortar $replay (New-Object System.Drawing.Rectangle 538, 72, 478, 196) "player-b.jpg" 800 328

# ── ângulos sincronizados do histórico ──
Recortar $replay (New-Object System.Drawing.Rectangle 410, 480, 186, 104) "cam-1.jpg" 384 214
Recortar $replay (New-Object System.Drawing.Rectangle 600, 480, 186, 104) "cam-2.jpg" 384 214
Recortar $replay (New-Object System.Drawing.Rectangle 790, 480, 186, 104) "cam-3.jpg" 384 214
Recortar $replay (New-Object System.Drawing.Rectangle 980, 480, 186, 104) "cam-4.jpg" 384 214

$modular.Dispose()
$replay.Dispose()
Write-Output "Cenas extraídas em $destino"
