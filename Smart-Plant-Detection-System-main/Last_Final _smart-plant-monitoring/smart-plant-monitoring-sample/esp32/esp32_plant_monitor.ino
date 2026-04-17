// =====================================================
//  Smart Plant Monitor - ESP32 Full Code
//  Sensors: DHT22, Soil Moisture, DS18B20, LDR
//  Sends JSON to Flask backend every 5 seconds via WiFi
// =====================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ─────────────────────────────────────────
// 1. WiFi Credentials — CHANGE THESE
// ─────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ─────────────────────────────────────────
// 2. Backend URL — CHANGE IP to your PC's IP
//    (Run: ipconfig in cmd to find your IPv4)
//    Keep the same port (5000) and path
// ─────────────────────────────────────────
const char* SERVER_URL = "http://192.168.1.100:5000/api/sensor-data";

// ─────────────────────────────────────────
// 3. Pin Definitions
// ─────────────────────────────────────────
#define DHT_PIN        4      // GPIO4  → DHT22 Data pin
#define DHT_TYPE       DHT22  // Change to DHT11 if you have DHT11

#define SOIL_MOIST_PIN 34     // GPIO34 → Soil Moisture Sensor (Analog)
#define LDR_PIN        35     // GPIO35 → LDR (Analog)

#define DS18B20_PIN    5      // GPIO5  → DS18B20 Data pin (Soil Temp)

// ─────────────────────────────────────────
// 4. Sensor Objects
// ─────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

// ─────────────────────────────────────────
// 5. How often to send data (milliseconds)
// ─────────────────────────────────────────
const unsigned long SEND_INTERVAL = 5000; // 5 seconds
unsigned long lastSendTime = 0;

// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=== Smart Plant Monitor Starting ===");

  // Start sensors
  dht.begin();
  ds18b20.begin();

  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempt++;
    if (attempt > 30) {
      Serial.println("\nFailed to connect to WiFi. Check credentials.");
      break;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("  ESP32 IP: ");
    Serial.println(WiFi.localIP());
  }
}

// =====================================================
void loop() {
  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;
    readAndSendData();
  }
}

// =====================================================
void readAndSendData() {
  // ── Read DHT22 (Air Temp + Humidity) ──
  float airTemp     = dht.readTemperature();
  float airHumidity = dht.readHumidity();

  if (isnan(airTemp) || isnan(airHumidity)) {
    Serial.println("⚠️  DHT22 read failed! Check wiring.");
    airTemp = 0.0;
    airHumidity = 0.0;
  }

  // ── Read DS18B20 (Soil Temperature) ──
  ds18b20.requestTemperatures();
  float soilTemp = ds18b20.getTempCByIndex(0);

  if (soilTemp == DEVICE_DISCONNECTED_C) {
    Serial.println("⚠️  DS18B20 read failed! Check wiring.");
    soilTemp = 0.0;
  }

  // ── Read Soil Moisture (Analog) ──
  //    Raw: 0 (wet) to ~4095 (dry) on ESP32 12-bit ADC
  int soilMoistureRaw = analogRead(SOIL_MOIST_PIN);

  // ── Read LDR (Analog) ──
  //    Raw: 0 (dark) to 4095 (bright) on ESP32 12-bit ADC
  int ldrRaw = analogRead(LDR_PIN);

  // ── Print to Serial Monitor for debugging ──
  Serial.println("\n── Sensor Readings ──");
  Serial.print("  Air Temp:      "); Serial.print(airTemp);        Serial.println(" °C");
  Serial.print("  Air Humidity:  "); Serial.print(airHumidity);    Serial.println(" %");
  Serial.print("  Soil Moisture: "); Serial.println(soilMoistureRaw);
  Serial.print("  Soil Temp:     "); Serial.print(soilTemp);       Serial.println(" °C");
  Serial.print("  Light (LDR):   "); Serial.println(ldrRaw);

  // ── Build JSON Payload ──
  StaticJsonDocument<256> doc;
  doc["air_temperature"]  = airTemp;
  doc["air_humidity"]     = airHumidity;
  doc["soil_moisture"]    = soilMoistureRaw;
  doc["soil_temperature"] = soilTemp;
  doc["ldr_light"]        = ldrRaw;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // ── Send to Flask Backend ──
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.print("  ✅ Server Response: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("  ❌ POST failed. Error: ");
      Serial.println(http.errorToString(httpResponseCode));
    }

    http.end();
  } else {
    Serial.println("❌ WiFi not connected. Skipping send.");
    WiFi.reconnect(); // Try to reconnect
  }
}
