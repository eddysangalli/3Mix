# Suplemento Alpha — requisitos específicos vMix 30

O guia principal foi reorganizado por outra frente. Este suplemento preserva os cinco roteiros exigidos originalmente sem renumerar ou apagar as missões já publicadas. A numeração abaixo é a do pedido original; usar também o nome do roteiro no relato para evitar ambiguidade.

## Regras comuns
Somente pacote/version/hash identificado, fora de produção. Registrar Windows, driver/firmware, GPU, modelo/revisão e topologia. Ausência de opção significa **não disponível**, não homologação. Código/mock não comprova hardware. Conferir capacidade enumerada antes de iniciar. Coletar diagnóstico sanitizado e revisar segredos antes de enviar; nunca enviar stream keys, passphrases, tokens, credenciais ou mídia privada.

## MISSÃO 7 original — DeckLink SDI, 10 bits e áudio multicanal
Equipamento: placa DeckLink, padrão de vídeo/áudio por canal, receptor/analisador compatível. Driver Desktop Video suportado pelo modelo; registrar versão. Configurar Central de Saídas SDI com modo enumerado e conteúdo/barramento oferecido. Testar 8 bits, depois 10 bits se negociado; verificar cada canal real, trocar conteúdo fora do ar, testar porta ocupada/ausência de placa/perda e retorno do sinal. Esperado: modo e áudio confirmados no receptor, erros claros e sem falsas opções. O caminho de saída examinado fixa dois canais: NÃO homologar 16 canais nesse caminho. Evidências: modelo/driver/mode, captura do analisador de bits/canais, vídeo padrão de 30 minutos, logs sanitizados e horários. Captura visual sozinha não prova 10 bits.

## MISSÃO 8 original — Captura AJA e compatibilidade de modelos
Equipamento: IP25, KONA X ou Corvid 88 Gen 3 e fonte/receptor compatíveis. Gate: confirmar SDK/driver/licença e suporte exato ao modelo; plugin AJA genérico ou enum CORVID88 não prova Gen 3/IP25. Configurar apenas conectores/modos enumerados. Testar descoberta, padrão e áudio, reabertura, perda/retorno e operação simultânea somente se suportada. Esperado: modelo/mode reconhecidos e falhas explícitas, sem anúncio de funções ausentes. Enviar SDK/driver/firmware, revisão, mapa de cabos, logs AJA/3Mix, vídeo de 30 minutos e relato por modo.

## MISSÃO 9 original — NDI entre computadores e múltiplos emissores
Equipamento: dois PCs, rede cabeada dimensionada, receptor e padrões distintos. Registrar runtime efetivamente carregado e SDK/plugin, sem confundi-los. Configurar senders existentes com nomes únicos, conteúdo e barramento. Receber cada um no segundo PC, aumentar concorrência dentro dos limites, desligar um sender e verificar os demais; interromper rede/recuperar e medir drops/sync por 30 minutos. Esperado: fontes/áudio corretos, falhas isoladas; discovery não prova vídeo estável. MKV/metadados exige caminho integrado/licenciado e roundtrip, não inferir suporte pela extensão. Enviar topologia, NIC/velocidade, versões, métricas, gravação padrão e logs das duas pontas. Não modificar 3Mix IO.

## MISSÃO 10 original — SRT avançado entre redes
Equipamento: duas máquinas/redes, receptor conhecido e endpoint autorizado de plataforma opcional. Registrar biblioteca real, NAT/firewall e portas sem segredos. Configurar transporte existente Caller/Listener; Rendezvous só se disponível/viável; explicitar unidade de latência em ambas as pontas. Testar conexão, inversão de papéis, latência, interrupção/reconexão, áudio/sync e plataforma separadamente. Perdas controladas apenas em laboratório autorizado. Esperado: sinal correto, recuperação medida e erros distinguíveis; métrica ausente não é perda zero. Enviar horários, modos/latências, tempo de recuperação, topologia sanitizada e logs/estatísticas das duas pontas.

## MISSÃO 11 original — Desentrelaçamento e saídas físicas
Equipamento: fontes/padrões 1080i, 576i e 480i, captura e monitor/analisador apropriados, marcador A/V. Registrar taxa racional e ordem dos campos (não confundir campos/s e quadros/s), drivers e modos. Configurar fonte nativa, método e ordem expostos. Comparar efeito desligado/ligado em movimento, conferir campos/taxa/drops/offset A/V, salvar/reabrir e perder/restaurar sinal. Esperado: movimento coerente, taxa correta e sync medido. Captura desentrelaçada não prova saída entrelaçada. Enviar formato/ordem/método, vídeo antes/depois, analisador e diagnóstico sanitizado; homologar cada formato separadamente.

## Classificação
Compatibilidade prevista; Implementado sem teste físico; Em homologação Alpha; Homologado com evidência; Incompatível; Não testado. Funções sem código/integração permanecem engenharia pendente, não tarefa do tester.
