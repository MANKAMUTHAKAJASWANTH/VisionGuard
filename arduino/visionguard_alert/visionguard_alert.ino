/*
 * ============================================================================
 * VisionGuard - Hardware Alert System Firmware
 * Hardware Connection:
 *   - Arduino Uno R3 (ATmega328P + CH340G / FTDI / Atmega16U2)
 *   - LED Indicator: Pin D7 -> 220 ohm resistor -> LED (+) -> LED (-) -> GND
 *   - Alert Buzzer:  Pin D6 -> Buzzer (+) -> Buzzer (-) -> GND
 * ============================================================================
 */

#define LED_PIN         7
#define BUZZER_PIN      6

// Serial input buffer
String inputBuffer = "";

// Alert timing state
bool alertActive = false;
unsigned long alertStartTime = 0;

void setup() {
  Serial.begin(9600);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Power-on LED flash test: Blink LED 3 times quickly to verify LED working physically
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(150);
    digitalWrite(LED_PIN, LOW);
    delay(150);
  }

  noTone(BUZZER_PIN);
  delay(200);
  Serial.println(F("VISIONGUARD_ARDUINO_READY"));
}

void loop() {
  handleAlert();
  handleSerialInput();
}

void handleAlert() {
  if (alertActive) {
    unsigned long elapsed = millis() - alertStartTime;
    digitalWrite(LED_PIN, HIGH);

    // Beep buzzer using tone frequency
    bool beepState = (elapsed % 250) < 150;
    if (beepState) {
      tone(BUZZER_PIN, 2400); // 2400 Hz loud warning frequency
    } else {
      noTone(BUZZER_PIN);
    }
  }
}

void triggerAlert() {
  alertActive = true;
  alertStartTime = millis();
  digitalWrite(LED_PIN, HIGH);
  tone(BUZZER_PIN, 2400);
}

void stopAlert() {
  alertActive = false;
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);
}

void handleSerialInput() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < 64) {
        inputBuffer += c;
      }
    }
  }
}

void processCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.equalsIgnoreCase("PING")) {
    Serial.println(F("PONG"));
  }
  else if (cmd.equalsIgnoreCase("AUTHORIZED")) {
    stopAlert();
  }
  else if (cmd.equalsIgnoreCase("UNAUTHORIZED") || cmd.equalsIgnoreCase("1")) {
    triggerAlert();
  }
  else if (cmd.equalsIgnoreCase("OFF") || cmd.equalsIgnoreCase("ALERT_OFF") || cmd.equalsIgnoreCase("0")) {
    stopAlert();
  }
  else if (cmd.equalsIgnoreCase("TEST_LED")) {
    stopAlert();
    // Blink LED 4 times for testing
    for (int i = 0; i < 4; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(300);
      digitalWrite(LED_PIN, LOW);
      delay(300);
    }
  }
  else if (cmd.equalsIgnoreCase("TEST_BUZZER")) {
    stopAlert();
    tone(BUZZER_PIN, 2400);
    delay(1500);
    noTone(BUZZER_PIN);
  }
  else if (cmd.equalsIgnoreCase("LED_ON")) {
    digitalWrite(LED_PIN, HIGH);
  }
  else if (cmd.equalsIgnoreCase("LED_OFF")) {
    digitalWrite(LED_PIN, LOW);
  }
  else if (cmd.equalsIgnoreCase("BUZZER_ON")) {
    tone(BUZZER_PIN, 2400);
  }
  else if (cmd.equalsIgnoreCase("BUZZER_OFF")) {
    noTone(BUZZER_PIN);
  }
}
