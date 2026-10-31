# Manifesto de aplicação — Configurações + 5 janelas (2026-10-30)

Origem: `D:\DRIVE\IA\antigravity\3Mix\3mix-panel`
Destino: `D:\DRIVE\IA\antigravity\3Mix\3mix-runtime`

Copiar os arquivos abaixo preservando a pasta relativa. Não copiar `painel/local.js` nem qualquer configuração local do runtime.
O servidor precisa ser reiniciado para o mapa de tamanhos valer; o painel é recarregado ao abrir cada janela.
`ferramentas/servidor-api.mjs` é um **hardlink** com o runtime: a edição do mapa já é o mesmo arquivo físico, não há cópia. Reinicie para o processo carregar o mapa novo.

| Arquivo de origem | Destino no runtime | SHA-256 |
| --- | --- | --- |
| `painel/remoto/configuracoes.html` | `painel/remoto/configuracoes.html` | `63395CBF08EB21D817D82BC16D82C6BDAF3306F2FFF50E7E91C430B1170BEC1A` |
| `painel/remoto/settings.js` | `painel/remoto/settings.js` | `F97AB10A1A9BA43997B1B77435E7F9A36D6CBC9C003985D6DD3FBA75EB1F6640` |
| `painel/remoto/settings-workspace-view.js` | `painel/remoto/settings-workspace-view.js` | `9989AF209AFDA384BD6B87FB04F16203F4A08A3503369C911AA4E1F9EF701353` |
| `painel/remoto/settings-workspace-bindings.js` | `painel/remoto/settings-workspace-bindings.js` | `164599E2D75800D8A574F1CA3DBF2E0693D1B2FF810D8A3A8EE0A518DC41BAE3` |
| `painel/remoto/settings-workspace.css` | `painel/remoto/settings-workspace.css` | `3D28EBB7CF03ABAF5BDA22C777881D7CB1389F564E5692DF6AF97C5BB799D994` |
| `painel/remoto/settings-help.js` | `painel/remoto/settings-help.js` | `B45B0190E55F96A84C4A732569DD92BAC916057EFBC65B3398C78C952E621262` |
| `painel/remoto/3mix-janelas.css` | `painel/remoto/3mix-janelas.css` | `CBE25E5BC1977ED99A57931A8C2B36343D750423C5229688A0BF28E0D8BC7B96` |
| `painel/remoto/gravar.html` | `painel/remoto/gravar.html` | `BEA5F7CC8F0040EC2A6175B7A9781C16437DA8092F19F2C191C4251A49C86774` |
| `painel/remoto/gravar.js` | `painel/remoto/gravar.js` | `25FA5A4F33B421FD28D5C7126F5079126C5F0DA5CF91C462298EB43AD650CE96` |
| `painel/remoto/externo.html` | `painel/remoto/externo.html` | `67CB02D2B1A8DC6674044667CBE707F52FD15C760FA4E42E995B1C363D2F243D` |
| `painel/remoto/externo.js` | `painel/remoto/externo.js` | `1BA5DE6447516E4EC5054CEB7A1EB56A622C76E06B0E510A0B4F217DC8E5CB31` |
| `painel/remoto/iso.html` | `painel/remoto/iso.html` | `18AFDC142D6E0D1518400D11A9EA8BE0B8F8123EA0AF1FFBC0B73C9162964747` |
| `painel/remoto/iso-avancado.js` | `painel/remoto/iso-avancado.js` | `1C2922A03C14544BEA875BCDE47E51665A7C5C86597399A91108ED88E05F2267` |
| `painel/remoto/multicorder.html` | `painel/remoto/multicorder.html` | `5D4CE7B842D6D0EC002660CA67892FF28797D34F54A508258157997D726F5869` |
| `painel/remoto/playout.html` | `painel/remoto/playout.html` | `F2BCD229C5E6925886168E9D4DF933FB9670F92E96318DAD5E33B581EF2561D9` |
| `painel/remoto/playout.js` | `painel/remoto/playout.js` | `D7E828348F72A2A50C9D14AFC33AD5383C8883AD5A9070C94ABDA16902CA2F59` |
| `painel/mesa.html` | `painel/mesa.html` | `B04371C387DA8D48595284474E89BF6A897E25F9F0620C2C25C767E110E31E77` |
| `ferramentas/servidor-api.mjs` | `ferramentas/servidor-api.mjs` | `849C9E07E044E4C958E74356B132D32C484B8143CC3AE32B47F07D5E60C77598` |

## Tamanhos no mapa `known` de `/api/panel-open`

- `/gravar` → **760 × 560**
- `/externo` → **900 × 620**
- `/multicorder` → **1040 × 680**
- `/iso` → **1040 × 680** (mesma janela nova)
- `/playout` → **1200 × 760**

O mapa é o tamanho inicial. `PanelWindows` salva a geometria por URL e a restaura; uma geometria já salva tem precedência.
O popup “Adicionar entrada” é 900 × 620 por CSS e não usa geometria nativa.

## Conferência

```powershell
Get-FileHash painel\remoto\settings.js -Algorithm SHA256
# repetir para cada arquivo e comparar com a tabela
```

Reiniciar o 3Mix depois de copiar `servidor-api.mjs`. Nenhuma janela de QA deve ficar aberta.
