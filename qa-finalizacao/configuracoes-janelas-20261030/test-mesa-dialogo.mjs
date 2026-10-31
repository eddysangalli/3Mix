// Static checks of the mesa "Adicionar entrada" dialog. The full mesa needs the engine WebSocket, so this file verifies
// the real markup/CSS contract without opening the operator's program.
import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '../../painel/mesa.html');
const html = await fs.readFile(file, 'utf8');
let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${detail ? '  (' + detail + ')' : ''}`); };
const block = html.slice(html.indexOf('if (st.pop === "add")'), html.indexOf('else if (st.pop === "call")'));

check('diálogo se chama "Adicionar entrada"', /<h3>Adicionar entrada<\/h3>/.test(block) && !/Input Select/.test(html));
check('botão confirma como "Adicionar entrada"', /data-a="add"[^>]*>Adicionar entrada</.test(block) && !/>OK</.test(block));
check('cancelar sem criar nada', /data-a="close">Cancelar</.test(block));
check('sem área clara no formulário', /\.add \.form \{[^}]*background: #1d1d1d/.test(html) && !/#eef1f5/.test(html));
check('tipos agrupados', ['Câmeras', 'Mídias', 'Rede', 'Gráficos', 'Áudio'].every((g) => html.includes(`group: "${g}"`)));
check('tipos traduzidos', ['Câmera ou captura', 'Vídeo', 'Lista de reprodução', 'Tela do computador', 'Fluxo de rede', 'Título / GC', 'Entrada de áudio', 'Vazia'].every((l) => html.includes(`label: "${l}"`)));
check('navegação por ícones', /<span class="ico">/.test(block) && /\.add \.types \.ico/.test(html));
check('sem caixas de seleção múltipla na navegação', !/\.add \.types button::before/.test(html) && !/data-a="addtype"[\s\S]{0,200}type="checkbox"/.test(block));
check('janela do diálogo 900×620', /\.pop\[data-panel="add"\] \{[^}]*width: min\(900px/.test(html) && /\.pop\[data-panel="add"\] \{[^}]*height: min\(620px/.test(html));
check('prévia 16:9', /\.add-preview \.ap-frame \{[^}]*aspect-ratio: 16 \/ 9/.test(html) && /class="ap-frame"/.test(html));
check('fecha pelo X do cabeçalho', /class="add-close" data-a="close"/.test(block));
check('prévia do que será criado', /id="add-preview"/.test(block) && /function addPreviewHtml/.test(html) && /function refreshAddPreview/.test(html));
check('rodapé da mesa usa "Adicionar entrada"', html.includes('title="Escolher o tipo, nome e ajustes da nova entrada">Adicionar entrada</button>'));
check('fonte não instalada desabilita a confirmação', /data-a="add"\$\{t\.kind && !resolveKind\(t\.kind\) \? " disabled"/.test(block));
console.log(`\n${pass}/${total} verificações passaram`);
process.exit(pass === total ? 0 : 1);
