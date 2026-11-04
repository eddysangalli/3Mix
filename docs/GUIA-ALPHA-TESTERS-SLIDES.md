# Guia de Operação e Classificação de Compatibilidade — 3Mix SlideEngine

> **Público:** Alpha Testers, Operadores Broadcast e Engenharia de Produção  
> **Versão:** 3Mix Pro — Novembro de 2026  
> **Localização dos Testes Automatizados no Repositório:** `testes/slides/`

---

## 1. Filosofia Operacional e Princípios Broadcast

O **3Mix SlideEngine** foi desenvolvido especificamente para transmissões ao vivo e produções multicâmera. Ao contrário de um visualizador de escritório convencional, o foco principal é a **estabilidade operacional**, o **isolamento estrito entre o que o operador prepara e o que vai para o ar**, e a **reprodução fluida sem engasgos ou quedas de quadros**.

---

## 2. Matriz de Classificação de Compatibilidade

| Recurso OpenXML (.pptx) | Classificação Operacional | Detalhes de Comportamento e Limitações |
| :--- | :---: | :--- |
| **Importação de Slides (16:9 e 4:3)** | **Suporte Total** | Decodificação nativa do arquivo OpenXML sem necessidade de Microsoft Office instalado. Proporção 4:3 aplica pilarbox lateral limpo em padrão broadcast. |
| **Diagramação Livre e Elementos** | **Suporte Total** | Posicionamento livre de caixas de texto (`<p:sp>`), cards com cantos arredondados, preenchimentos coloridos, bordas, múltiplas imagens simultâneas e tabelas (`<a:tbl>`). Sem limite de tópicos. |
| **Vídeos Incorporados** | **Suporte Total** | Extração de `.mp4` e `.webm` de `ppt/media/*`. Roteamento de áudio nativo (`reroute_audio: true`) para o mixer do 3Mix com controle de fader, ganho em dB, mute e medidor de pico. |
| **Controles de Transporte de Vídeo** | **Suporte Total** | Controles de Play, Pause e Seek em tempo real sem recriação da fonte do OBS e sem reiniciar a reprodução do vídeo do início. Respeito estrito à tag de autoplay por clipe. |
| **Animações Nativas (`p:timing`)** | **Suporte Parcial** | Suporte às etapas por clique com interpolação contínua a 60 fps para efeitos **Fade**, **Fly-In** e **Zoom**. Quando o efeito não é identificado no XML, aplica corte direto (`appear`) fiel ao padrão sequencial, sem efeitos arbitrários. Deformações vetoriais 3D complexas não são aplicadas. |
| **Transição Morph** | **Suporte Parcial (Adaptado)** | Reconhecimento da tag `<p:morph>`. Aplica interpolação suave 2D de posicionamento e escala com transição nativa do 3Mix. A malha poligonal 3D proprietária da Microsoft não é reproduzida. **Nenhum aviso técnico é exibido no Program.** |
| **Avisos Técnicos e Badges** | **Isolamento de Segurança** | Todos os alertas sobre recursos adaptados ou não suportados são exibidos **exclusivamente no Presenter Mode** (`slides.html`) para orientar o operador. A saída de vídeo para os telespectadores permanece 100% limpa. |
| **Modo de Compatibilidade Externa** | **Opcional (Documentado)** | Integração documentada para controle COM de PowerPoint instalado ou LibreOffice Impress via Window Capture/NDI. Consulte `docs/ESTUDO-COMPATIBILIDADE-POWERPOINT-LIBREOFFICE.md`. |

---

## 3. Testes Automatizados no Repositório

Para reproduzir e auditar as verificações a qualquer momento no ambiente de testes, utilize os scripts padronizados:

1. **Testes de Contratos de API e Modelo de Dados:**
   ```powershell
   node testes/slides/test-slide-engine-api.mjs
   ```
   *Verifica: descompactação ZIP, integridade do modelo, detecção correta de múltiplos vídeos com e sem autoplay, parser sequencial de animações sem atribuições arbitrárias e eventos de transporte.*

2. **Testes de Renderização e Compositor OBS:**
   ```powershell
   node testes/slides/test-slide-engine-compositor.mjs
   ```
   *Verifica: criação e atualização da cena `Slides` e da fonte `Fonte Slides` no OBS WebSocket, isolamento rigoroso de Preview vs Program (comprovação por hash SHA256 de frames capturados), suporte 4:3 pilarbox e ausência de warnings na saída de vídeo.*

3. **Testes Audiovisuais, Mixer e Controles em Tempo Real:**
   ```powershell
   node testes/slides/test-slide-engine-audiovisual.mjs
   ```
   *Verifica: roteamento de áudio real com fader (-6dB), Mute/Unmute na fonte OBS, comandos de Play/Pause/Seek sem recriação do objeto de cena e disparo de animações a 60fps.*

---

## 4. Orientações para Testes de Bancada e Validação em Campo

1. **Apresentações com Múltiplas Mídias:**
   - Traga apresentações contendo vídeos em slides diferentes e imagens simultâneas.
   - Utilize o botão de atalho `Enter` ou `Espaço` para colocar o slide preparado no ar.
   - Para apresentações com tópicos animados, use a tecla `N` ou o botão `✨ Próx. Animação`.
2. **Áudio e Sincronismo:**
   - Ao colocar no ar um slide com vídeo, confira o medidor de pico da `Fonte Slides` no painel de Áudio. O fader master do operador permanece independente do ganho interno da fonte.
