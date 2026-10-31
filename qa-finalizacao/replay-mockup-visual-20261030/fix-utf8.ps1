$path = 'D:\DRIVE\IA\antigravity\3Mix\3mix-panel\painel\remoto\replay-mockup-operacao.css'
$enc = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$replacement = [char]0xFFFD
$text = $text.Replace("3Mix $replacement Replay - graphite broadcast skin.", "3Mix · Replay — graphite broadcast skin.")
$text = $text.Replace("Configura" + $replacement + $replacement + "es", "Configurações")
$text = $text.Replace($replacement + "udio", "Áudio")
$text = $text.Replace('.replay-topbar .project-pill::after { content: "?";', '.replay-topbar .project-pill::after { content: "⌄";')
$text = $text.Replace('.ev-category::before { content: "' + $replacement + '";', '.ev-category::before { content: "·";')
[System.IO.File]::WriteAllText($path, $text, $enc)
$check = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$lines = $check -split "`n"
$i = 0
foreach ($line in $lines) {
  $i++
  if ($line -match '[^\x00-\x7F]') { '{0}: {1}' -f $i, $line }
}
