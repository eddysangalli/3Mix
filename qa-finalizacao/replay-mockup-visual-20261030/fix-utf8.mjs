import fs from 'node:fs';
const path = 'D:/DRIVE/IA/antigravity/3Mix/3mix-panel/painel/remoto/replay-mockup-operacao.css';
let text = fs.readFileSync(path, 'utf8');
const r = '\uFFFD';
text = text.replace('3Mix ' + r + ' Replay - graphite broadcast skin.', '3Mix \u00B7 Replay \u2014 graphite broadcast skin.');
text = text.replace('Configura' + r + r + 'es', 'Configura\u00E7\u00F5es');
text = text.replace(r + 'udio', '\u00C1udio');
text = text.replace('.replay-topbar .project-pill::after { content: "?";', '.replay-topbar .project-pill::after { content: "\u2304";');
text = text.replace('.ev-category::before { content: "' + r + '";', '.ev-category::before { content: "\u00B7";');
fs.writeFileSync(path, text, 'utf8');
for (const [i, line] of text.split('\n').entries()) {
  if (/[^\x00-\x7F]/.test(line)) console.log((i + 1) + ': ' + line);
}
