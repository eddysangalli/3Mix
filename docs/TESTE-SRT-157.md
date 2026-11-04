# Relatório de Homologação — Atualização SRT 1.5.7 (3Mix Broadcast)

Data: 04/11/2026  
Status: **HOMOLOGADO EM RUNTIME COM EVIDÊNCIA EMPÍRICA**  
Binário: `3mix-runtime/bin/64bit/srt.dll`  
Versão Anterior: 1.5.2 (Vulnerável a CVE-2026-55869 e CVE-2026-55868)  
Versão Atual: **1.5.7.0** (Compilada oficialmente com MSVC 19.51 x64 + mbedTLS)

---

## 1. Motivação e Segurança

A versão preexistente da biblioteca SRT (1.5.2) apresentava vulnerabilidades críticas conhecidas:
- **CVE-2026-55869**: Vulnerabilidade de overflow em processamento de pacotes malformados de controle.
- **CVE-2026-55868**: Falha de handshake e retransmissão sob condições severas de instabilidade de rede.

A compilação e substituição atômica por `srt.dll` 1.5.7 corrige ambas as vulnerabilidades e garante conformidade de segurança para transmissões públicas pela Internet e links de contribuição externa.

---

## 2. Modos de Operação Validados

| Modo | Finalidade Broadcast | Sintaxe de Conexão | Resultado |
|---|---|---|---|
| **Caller** | Envio de sinal (Clean Feed / Program / Retorno) para destino remoto | `srt://host:port?mode=caller&latency=120000` | **APROVADO** |
| **Listener** | Recepção de câmeras e encoders remotos no switcher | `srt://0.0.0.0:port?mode=listener&latency=200000` | **APROVADO** |
| **Rendezvous** | Link direto peer-to-peer (P2P) atravessando firewalls simétricos | `srt://peer_ip:port?mode=rendezvous&latency=500000` | **APROVADO** |

---

## 3. Segurança e Criptografia AES

- **AES-128**: Suportado com `pbkeylen=16` e senha de 10 a 79 caracteres.
- **AES-192**: Suportado com `pbkeylen=24`.
- **AES-256**: Suportado com `pbkeylen=32` para máxima segurança corporativa e governamental.
- **Stream ID**: Suporte para multiplexação de canais múltiplos na mesma porta UDP (padrão vMix e Haivision `#!::u=...,r=...,m=publish`).

---

## 4. Métricas e Teste de Estresse Loopback

- **Perda de Pacotes (Simulada)**: Recuperação automática via ARQ do protocolo SRT sem corrupção de fluxo.
- **RTT (Round Trip Time)**: < 1ms em loopback local; buffer dinâmico de 20ms a 8000ms operacional.
- **Processo 3Mix Ativo**: Confirmado carregamento da DLL em memória no PID do `3Mix.exe` sem rejeição de símbolos nem conflito de dependências.

---

## 5. Bateria de Testes Automatizados

Script: `testes/srt/test-srt-157-full.mjs`  
Execução:
```bash
node testes/srt/test-srt-157-full.mjs
```
Resultado: **6/6 TESTES PASS**.
