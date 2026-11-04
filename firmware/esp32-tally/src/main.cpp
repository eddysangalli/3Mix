/**
 * 3Mix Pro Broadcast Suite — Firmware Oficial de Tally Físico (ESP32 / M5StickC)
 * 
 * Comunicação direta com a API nativa do 3Mix via HTTP REST (/api/crew/tally)
 * ou WebSocket. Suporta qualquer módulo ESP32, M5StickC ou display OLED/TFT.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#ifdef M5STICK_C_PLUS
#include <M5StickCPlus.h>
#endif

// ==========================================
// CONFIGURAÇÕES DA REDE & 3MIX
// ==========================================
const char* WIFI_SSID     = "SUA_REDE_WIFI";
const char* WIFI_PASSWORD = "SENHA_DO_WIFI";
const char* 3MIX_HOST     = "192.168.1.100"; // IP do computador onde roda o 3Mix
const int   3MIX_PORT     = 3000;            // Porta da API do 3Mix (padrão 3000)
const char* TARGET_CAMERA = "CAM 1";         // Nome exato da câmera no 3Mix (ex: "CAM 1", "Câmera 2")
const char* TARGET_DEST   = "main";          // Destino monitorado: "main", "me2", "me3"

// ==========================================
// DEFINIÇÃO DE PINOS GPIO (ESP32 DevKit Padrão)
// ==========================================
#ifndef M5STICK_C_PLUS
const int PIN_LED_PROGRAM = 19; // LED Vermelho (No Ar / PROGRAM)
const int PIN_LED_PREVIEW = 18; // LED Verde (Em Espera / PREVIEW)
const int PIN_LED_STATUS  = 2;  // LED Azul da placa (WiFi/Conexão)
#endif

// Intervalo de consulta (em milissegundos)
const unsigned long POLL_INTERVAL_MS = 150; 
unsigned long lastPollTime = 0;

enum TallyState {
    TALLY_DISCONNECTED,
    TALLY_LIVE_OFF,
    TALLY_PREVIEW,
    TALLY_PROGRAM
};

TallyState currentState = TALLY_DISCONNECTED;

void applyTallyOutputs(TallyState state) {
#ifdef M5STICK_C_PLUS
    switch (state) {
        case TALLY_PROGRAM:
            M5.Lcd.fillScreen(RED);
            M5.Lcd.setTextColor(WHITE, RED);
            M5.Lcd.drawCentreString("NO AR (PGM)", 120, 40, 4);
            M5.Lcd.drawCentreString(TARGET_CAMERA, 120, 80, 4);
            break;
        case TALLY_PREVIEW:
            M5.Lcd.fillScreen(GREEN);
            M5.Lcd.setTextColor(BLACK, GREEN);
            M5.Lcd.drawCentreString("PREVIEW", 120, 40, 4);
            M5.Lcd.drawCentreString(TARGET_CAMERA, 120, 80, 4);
            break;
        case TALLY_LIVE_OFF:
            M5.Lcd.fillScreen(BLACK);
            M5.Lcd.setTextColor(WHITE, BLACK);
            M5.Lcd.drawCentreString("LIVRE", 120, 40, 4);
            M5.Lcd.drawCentreString(TARGET_CAMERA, 120, 80, 4);
            break;
        case TALLY_DISCONNECTED:
        default:
            M5.Lcd.fillScreen(DARKGREY);
            M5.Lcd.setTextColor(YELLOW, DARKGREY);
            M5.Lcd.drawCentreString("CONECTANDO...", 120, 50, 4);
            break;
    }
#else
    switch (state) {
        case TALLY_PROGRAM:
            digitalWrite(PIN_LED_PROGRAM, HIGH);
            digitalWrite(PIN_LED_PREVIEW, LOW);
            digitalWrite(PIN_LED_STATUS, HIGH);
            break;
        case TALLY_PREVIEW:
            digitalWrite(PIN_LED_PROGRAM, LOW);
            digitalWrite(PIN_LED_PREVIEW, HIGH);
            digitalWrite(PIN_LED_STATUS, HIGH);
            break;
        case TALLY_LIVE_OFF:
            digitalWrite(PIN_LED_PROGRAM, LOW);
            digitalWrite(PIN_LED_PREVIEW, LOW);
            digitalWrite(PIN_LED_STATUS, HIGH);
            break;
        case TALLY_DISCONNECTED:
        default:
            digitalWrite(PIN_LED_PROGRAM, LOW);
            digitalWrite(PIN_LED_PREVIEW, LOW);
            // Piscar LED de status
            digitalWrite(PIN_LED_STATUS, (millis() / 500) % 2);
            break;
    }
#endif
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n[3Mix Tally] Inicializando sistema de Tally físico...");

#ifdef M5STICK_C_PLUS
    M5.begin();
    M5.Lcd.setRotation(3);
    M5.Lcd.fillScreen(BLACK);
    M5.Lcd.setTextColor(WHITE);
    M5.Lcd.setTextSize(2);
    M5.Lcd.drawString("3Mix Tally Boot", 10, 20);
#else
    pinMode(PIN_LED_PROGRAM, OUTPUT);
    pinMode(PIN_LED_PREVIEW, OUTPUT);
    pinMode(PIN_LED_STATUS, OUTPUT);
    applyTallyOutputs(TALLY_DISCONNECTED);
#endif

    // Conectar ao WiFi
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[3Mix Tally] Conectando ao WiFi %s...", WIFI_SSID);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
        delay(300);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[3Mix Tally] WiFi conectado com sucesso! IP local: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[3Mix Tally] Falha ao conectar ao WiFi. O dispositivo tentará reconectar em background.");
    }
}

void pollTallyServer() {
    if (WiFi.status() != WL_CONNECTED) {
        applyTallyOutputs(TALLY_DISCONNECTED);
        return;
    }

    HTTPClient http;
    String url = String("http://") + 3MIX_HOST + ":" + 3MIX_PORT + "/api/crew/tally";
    http.begin(url);
    http.setTimeout(1000); // 1 segundo de timeout máximo

    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        
        // Parse do JSON da resposta
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (!error && doc["success"].as<bool>()) {
            JsonArray inputs = doc["inputs"].as<JsonArray>();
            bool cameraFound = false;

            for (JsonObject input : inputs) {
                const char* name = input["name"] | "";
                const char* key = input["key"] | "";

                // Verifica pelo nome ou chave da câmera configurada
                if (strcasecmp(name, TARGET_CAMERA) == 0 || strcasecmp(key, TARGET_CAMERA) == 0) {
                    cameraFound = true;
                    const char* stateStr = input["destinations"][TARGET_DEST] | (const char*)input["state"];

                    if (strcmp(stateStr, "program") == 0) {
                        currentState = TALLY_PROGRAM;
                    } else if (strcmp(stateStr, "preview") == 0) {
                        currentState = TALLY_PREVIEW;
                    } else {
                        currentState = TALLY_LIVE_OFF;
                    }
                    break;
                }
            }

            if (!cameraFound) {
                currentState = TALLY_LIVE_OFF;
            }
        } else {
            currentState = TALLY_DISCONNECTED;
        }
    } else {
        Serial.printf("[3Mix Tally] Erro HTTP ao consultar 3Mix: %d\n", httpCode);
        currentState = TALLY_DISCONNECTED;
    }

    http.end();
    applyTallyOutputs(currentState);
}

void loop() {
#ifdef M5STICK_C_PLUS
    M5.update();
#endif

    unsigned long currentMillis = millis();
    if (currentMillis - lastPollTime >= POLL_INTERVAL_MS) {
        lastPollTime = currentMillis;
        pollTallyServer();
    }
}

