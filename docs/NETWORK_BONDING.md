# Transmissão por Múltiplas Conexões (Multi-WAN & Bonding) — 3Mix

> **Especificação futura — NÃO IMPLEMENTADA nem homologada no pacote local de 08/10/2026.** Não existe receptor de recomposição entregue. O texto descreve comportamento pretendido, não funcionalidades disponíveis.

---

## 1. Princípios de Operação e os Três Modos

A transmissão externa crítica exige proteção contra queda de link de internet e oscilação de banda. A proposta prevê três modos de operação multi-caminho:

| Modo de Operação | Comportamento de Rede | Aplicação & Vantagens |
| :--- | :--- | :--- |
| **Principal + Reserva (Failover Automático)** | O tráfego principal flui pela conexão primária (ex: Fibra/Ethernet). A conexão reserva (ex: Wi-Fi ou Modem 4G) permanece ativa com heartbeats leves. Se a primária falhar, a transmissão comuta imediatamente. | Economiza dados em conexões móveis tarifadas/com franquia. |
| **Redundância Simultânea (Hitless / Packet Duplication)** | Envia **cópias integrais dos mesmos pacotes** simultaneamente por dois ou mais caminhos físicos distintos (ex: Ethernet + 5G). O receptor remoto aproveita o pacote que chegar primeiro e descarta a duplicata. | **Máxima continuidade operacional**: mesmo que um cabo seja desconectado fisicamente ou uma antena oscile, não há queda ou congelamento de imagem no destino. |
| **Agregação de Capacidade (Multi-Link Load Sharing)** | Fragmenta os pacotes do encoder e distribui a carga proporcionalmente entre as conexões ativas. | Permite transmitir em bitrates elevados (ex: 4K a 25 Mbps) somando links menores que individualmente não suportariam o fluxo. |

---

## 2. Diversidade Real de Caminhos e Bind de Interfaces

Abrir múltiplos sockets pelo roteador padrão **não garante redundância** se ambos utilizarem a mesma rota de saída do Windows.  
O `NetworkBondingManager` proposto deverá realizar `bind()` explícito ao endereço IP IPv4 de cada interface de rede física selecionada pelo operador:
- **Caminho A**: Adaptador de rede cabeada Ethernet (`192.168.1.x` via Provedor A).
- **Caminho B**: Adaptador Wi-Fi conectado a hotspot celular 5G ou Provedor B (`192.168.15.x`).

---

## 3. O Receptor de Recomposição (`freemix-bonding-relay`)

Para entregar fluxos protegidos a plataformas como YouTube, Twitch ou estúdios remotos que aceitam apenas uma conexão RTMP/SRT convencional, será necessário implementar o **Receptor de Recomposição**:

```
+------------------+         Caminho A (Ethernet)
|   3Mix Studio    | ==============================> +--------------------------+          RTMP Único
|  (Local do Ar)   |         Caminho B (Wi-Fi 5G)   |  Receptor de Recomposição | ======================> YouTube / Twitch
|                  | ==============================> |  (Reordena & Deduplica)  |
+------------------+                                 +--------------------------+
```

O receptor:
1. Recebe os fluxos dos diferentes links em porta UDP dedicada (padrão RIST RFC 8859 / SRT Group).
2. Mantém uma janela de buffer ajustável (padrão: 800 ms) para absorver jitter de rota.
3. Detecta sequence numbers, descarta duplicatas e encaminha o fluxo desempacotado para o destino.

---

## 4. Telemetria e Monitoramento em Tempo Real

A Central de Saídas disponibiliza para o operador:
- **Bitrate por Link (Mbps)** em tempo real.
- **Latência de Ida e Volta (RTT)** em milissegundos por conexão.
- **Perda de Pacotes (%)** individual e perda efetiva após recomposição no receptor.
- Sinalizador de conexão com franquia (Metered Connection) para modems celulares.
