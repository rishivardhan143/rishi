#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

// ---------- Wi-Fi Credentials ----------
const char* ssid = "POCO F5";
const char* password = "Rishi@143";

// ---------- Flask Server ----------
String serverName = "http://10.80.254.240:5000/addData";

// ---------- DHT Sensor Configuration ----------
#define DHTPIN 4          // DHT connected to GPIO 4
#define DHTTYPE DHT11     // or DHT22 if you’re using that model
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();

  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi connected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // -------- Read Humidity from Sensor --------
    float hum = dht.readHumidity();

    // -------- Check if Sensor Reading is Valid --------
    if (isnan(hum)) {
      Serial.println("⚠️ Failed to read from DHT sensor!");
      delay(2000);
      return;
    }

    // -------- Random Temperature --------
    float temp = random(20, 40);

    // -------- Send to Flask Server --------
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    String jsonData = "{\"temperature\":" + String(temp) + ",\"humidity\":" + String(hum) + "}";

    int httpResponseCode = http.POST(jsonData);

    if (httpResponseCode > 0) {
      Serial.print("✅ Data sent successfully: ");
      Serial.println(jsonData);
    } else {
      Serial.print("❌ Failed, Error code: ");
      Serial.println(httpResponseCode);
    }

    http.end();
  } else {
    Serial.println("WiFi disconnected, reconnecting...");
    WiFi.begin(ssid, password);
  }

  delay(5000); // Send every 5 seconds
}
