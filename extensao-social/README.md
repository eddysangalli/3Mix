# 3Mix Social Live Stream Capture (Extensão de Navegador)

Extensão Manifest V3 para **Google Chrome**, **Microsoft Edge**, **Brave** e navegadores baseados em Chromium.

## 1. Por que usar a Extensão em vez de APIs Oficiais?

- **YouTube API v3:** A Google impõe um limite estrito de 10.000 unidades diárias por chave de API. Fazer polling de chat ao vivo consome toda a cota em menos de 2 a 3 horas de transmissão.
- **TikTok Live:** O TikTok não oferece API pública oficial gratuita de comentários ao vivo para criadores e switchers sem contrato corporativo com a ByteDance.
- **Vantagem da Extensão:** O navegador do operador já recebe o stream de comentários da live do YouTube ou TikTok em tempo real via WebSockets internos do próprio site. A extensão lê as mensagens diretamente no navegador e as envia para o 3Mix localmente (`http://127.0.0.1:3000/api/social`) com **Zero Consumo de Cota (No Rate Limits)** e **Latência Sub-segundo**.

---

## 2. Como Instalar no Navegador (10 segundos)

1. Abra o navegador (Chrome, Edge ou Brave) e acesse:
   - No Chrome: `chrome://extensions/`
   - No Edge: `edge://extensions/`
2. Ative a chave **"Modo do desenvolvedor"** (Developer mode) no canto superior direito.
3. Clique no botão **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta deste projeto:
   `D:\DRIVE\IA\antigravity\3Mix\3mix-panel\extensao-social`
5. Pronto! O ícone do 3Mix aparecerá na barra de ferramentas do seu navegador.

---

## 3. Como Operar Durante uma Transmissão

1. Abra a live do YouTube (`youtube.com/watch?v=...`) ou do TikTok (`tiktok.com/@canal/live`) no seu navegador.
2. Certifique-se de que o chat ao vivo está visível na página.
3. A extensão captura instantaneamente:
   - Nome do autor e arroba/handle
   - Foto de perfil / avatar
   - Texto completo do comentário
   - Super Chats e doações monetárias destacadas
4. Cada comentário é inserido com segurança no buffer de **Pendentes** do 3Mix Social (`/social`).
5. O operador clica em **Aprovar** e **Levar ao Ar (Take)** no DSK desejado com garantia de isolamento Zero-Leak!

