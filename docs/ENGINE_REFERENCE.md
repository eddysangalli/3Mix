# Referência do Motor de Mídia (libobs) e Política de Atualizações

> **Documento de Engenharia · 3Mix Studio**

---

## 1. Versão de Referência do Motor

O 3Mix adota formalmente a seguinte versão de referência da biblioteca `libobs`:
* **Versão Principal de Referência**: `libobs 32.2.2` (com compatibilidade com a linha `libobs 33.x`).
* **Compilador Alvo**: Microsoft Visual C++ 2022 (MSVC v143), arquitetura x64.
* **Padrão de Linguagem**: C++17 (C++20 para novos módulos) e C11 para o motor.
* **Framework Gráfico de Janelas**: Qt 6.6+ (Core, Gui, Widgets).
* **Render Pipeline**: Direct3D 11 (`libobs-d3d11.dll`) com fallback OpenGL.

---

## 2. Contrato de Isolamento da `libobs`

Para garantir que o 3Mix não sofra "merge hell" ou abandono de codebase:
1. **Camada de Motor (`libobs`) Intacta**: As chamadas entre o 3Mix e o motor de vídeo ocorrem estritamente através das interfaces públicas C documentadas em `obs.h`, `obs-source.h`, `obs-output.h`, `obs-audio-controls.h` e `obs-module.h`.
2. **Interface e Serviços Próprios**: Toda a lógica de controle broadcast, roteamento matricial de saídas (`OutputManager`), submixes de áudio com mix-minus (`AudioBusManager`), composição de múltiplos renders (`CanvasMixManager`), gerenciamento de projetos e layout de produção reside na base de código do 3Mix (`src/`).
3. **Procedimento de Atualização da `libobs`**:
   - Para atualizar a versão do motor quando o projeto OBS lançar correções de segurança ou novos drivers de encoder (ex: novos codecs AV1, atualizações de NVENC):
     1. Baixar os binários e headers da nova versão da `libobs`.
     2. Executar a suíte de testes de integração (`test-outputs`, `test-audio-buses`).
     3. Recompilar o aplicativo `FreeMix.exe` (nome de binário interno; renomear exige rebuild do motor).
   - Nenhuma tela operacional, atalho ou comportamento broadcast do operador é afetado pela atualização do motor interno.

---

## 3. Conformidade com Licença GPL-2.0

A biblioteca `libobs` é licenciada sob a **GNU General Public License v2.0 (GPL-2.0)**.
O 3Mix, como aplicação derivada e consumidora da `libobs`, adota integralmente a licença **GPL-2.0**:
- Todo o código-fonte do 3Mix é aberto e distribuído sob os mesmos termos.
- Os cabeçalhos e arquivos de código mantêm os avisos de autoria e direitos reservados.
- A janela "Sobre o 3Mix" disponibiliza o aviso de licença e link para os repositórios correspondentes.
