# 3Mix Physical Tally — Firmware Oficial ESP32 & M5StickC

Firmware em C++ para microcontroladores Wi-Fi (ESP32 DevKit, M5StickC Plus, TTGO T-Display) para uso como sinaleiro físico de câmera (**Tally Light**) conectado diretamente ao **3Mix Pro Suite**.

---

## 1. Características Técnicas

- **Comunicação Direta:** Consome o endpoint nativo `GET /api/crew/tally` da API do 3Mix a cada ~150ms com latência imperceptível.
- **Isolamento de Áudio e Segurança:** O protocolo de Tally opera em modo estritamente **somente-leitura**, sem permissão de disparo de cortes ou alterações no switcher.
- **Suporte Nativo a M5StickC Plus:** O display colorido TFT de 1.14" acende inteiro em **Vermelho Intenso** (*NO AR / PROGRAM*) ou **Verde** (*PREVIEW / PRÓXIMO*), com o nome da câmera em destaque.
- **Suporte a ESP32 DevKit Padrão:** Saída para LEDs externos nos pinos GPIO 19 (Vermelho) e GPIO 18 (Verde), ideal para montar em caixas impressas em 3D sobre a sapata da câmera.

---

## 2. Pinagem dos LEDs (ESP32 DevKit)

| Função | Pino GPIO | Cor do LED | Comportamento |
| :--- | :---: | :---: | :--- |
| **PROGRAM (No Ar)** | `GPIO 19` | Vermelho | Aceso quando a câmera estiver no Programa |
| **PREVIEW (Espera)** | `GPIO 18` | Verde | Aceso quando a câmera estiver no Preview |
| **STATUS / WIFI** | `GPIO 2` | Azul (Onboard) | Pisca desconectado; aceso fixo quando conectado |
| **GND** | `GND` | - | Terra comum dos resistores dos LEDs (220Ω ou 330Ω) |

---

## 3. Como Configurar

Abra o arquivo [`src/main.cpp`](src/main.cpp) e ajuste as 4 variáveis iniciais:

```cpp
const char* WIFI_SSID     = "SUA_REDE_WIFI";
const char* WIFI_PASSWORD = "SENHA_DO_WIFI";
const char* 3MIX_HOST     = "192.168.1.100"; // IP do computador do 3Mix
const char* TARGET_CAMERA = "CAM 1";         // Nome exato da câmera na mesa
```

---

## 4. Como Gravar

### Opção A: Usando PlatformIO (VS Code / Terminal)
```bash
# Para ESP32 DevKit genérico:
pio run -e esp32dev --target upload

# Para M5StickC Plus:
pio run -e m5stickc-plus --target upload
```

### Opção B: Usando Arduino IDE
1. Abra o arquivo `src/main.cpp` na Arduino IDE.
2. No menu **Tools > Board**, selecione **ESP32 Dev Module** (ou **M5StickC**).
3. Instale a biblioteca **ArduinoJson** (versão 7.x) pelo Gerenciador de Bibliotecas.
4. Conecte o cabo USB e clique em **Upload**.

