# Procedimento Canônico de Reversão (Rollback) — 3Mix Broadcast

Data: 04/11/2026  
Status: **DOCUMENTO OFICIAL DE PROCEDIMENTO OPERACIONAL**  
Objetivo: Garantir reversão atômica, segura e sem perda de configurações em caso de anomalias operacionais no motor, biblioteca SRT ou plugins de terceiros.

---

## 1. Princípios de Segurança Broadcast

1. **Nunca descarte dados do operador**: Diretórios de configuração (`config/obs-studio/`), perfis, cenas e coleções são sempre mantidos intactos durante o processo de reversão.
2. **Desligamento Prévia Seguro**: Toda troca de DLL nativa (`srt.dll`, plugins de motor) exige o encerramento prévio e gracioso do processo `3Mix.exe` via `DESLIGAR-3MIX.cmd` para evitar arquivos corrompidos ou locks de arquivo no Windows.
3. **Snapshots Automáticos**: Toda modificação feita pelo Gerenciador de Plugins ou instalador grava um snapshot imutável em `.rollback/`.

---

## 2. Reversão de Biblioteca de Transporte SRT

Se um destino remoto ou encoder de terceiros apresentar incompatibilidade estrita com a biblioteca SRT 1.5.7:

### Procedimento Automatizado com 1 Clique:
Execute:
```bat
scripts\motor\reverter-srt-152.cmd
```
O script:
1. Encerra o 3Mix caso esteja em execução.
2. Faz backup da DLL atual para `srt.dll.v157.bak`.
3. Restaura `srt.dll.v152.bak` para `3mix-runtime\bin\64bit\srt.dll`.
4. Valida a versão restaurada com o leitor PE x64.

### Para Retornar à Versão 1.5.7 Homologada:
Execute:
```bat
scripts\motor\ativar-srt-157.cmd
```

---

## 3. Reversão de Plugins OBS de Terceiros

Se um plugin instalado pelo usuário causar instabilidade ou travamento:

### Método 1: Pela Interface Gráfica da Mesa
1. Abra **Configurações > Plugins OBS**.
2. Na aba **Módulos Instalados**, localize o plugin instável.
3. Clique em **Desativar** (o módulo é movido para o sandbox inativo imediatamente sem apagar dados).
4. Ou clique no botão **Reverter** para restaurar a versão imediatamente anterior.

### Método 2: Modo de Segurança Defensivo (Safe Mode)
Se o motor falhar antes de abrir a interface:
1. Inicie o 3Mix pelo atalho ou comando com a flag de emergência:
   ```bat
   INICIAR-3MIX.cmd --safe-mode
   ```
2. O `PluginManager.cpp` isola todos os módulos de `3mix-plugins/` e sobe apenas os plugins essenciais de fábrica (`obs-ffmpeg`, `frontend-tools`, `obs-browser`).
3. O relatório de falha de carga é gerado em `config/obs-studio/plugin_config/load-report.json`.

---

## 4. Reversão do Chromium CEF / Browser Sources

Se uma página ou GC apresentar falhas com a versão moderna do CEF:
- O 3Mix mantém os binários estáveis do CEF (branch 7871 / 150) como fallback operacional homologado.
- Os parâmetros de sandbox de GPU podem ser redefinidos em `config/obs-studio/global.ini` na seção `[BrowserSource]` alterando `HardwareAcceleration=false`.

---

## 5. Verificação Pós-Rollback

Após qualquer operação de rollback:
1. Inicie a suíte via `INICIAR-3MIX.cmd`.
2. Acesse a Mesa e abra a aba **Pre-Flight Check**.
3. Confirme que todos os itens exibem o status **APROVADO (Verde)** e que o item **Componentes do Motor** lista os sonames e versões esperadas.
