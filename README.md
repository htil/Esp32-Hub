# ESP32 Flash Lab

A browser-based workbench for onboarding, flashing, and monitoring **Freenove ESP32-WROVER** boards—bridging initial **Web Serial** USB configuration with real-time **Wi-Fi WebSocket** telemetry.

---

## Current Features

* **1 · Setup (USB / Web Serial):** Connect via the CH340 USB-UART bridge (`navigator.serial`), handshake with the ROM bootloader (`esptool-js`), verify silicon identity/MAC eFuse, and stream compiled ESP32 `.bin` firmware partitions.
* **Over-the-Serial Wi-Fi Provisioning:** Push SSID, password, and Control Hub host configuration as a single JSON line at `115200` baud directly into Non-Volatile Storage (NVS).
* **2 · Live (Wi-Fi / Control Hub):** Bi-directional wireless communication (`ws://localhost:8080/ws`) shifting data streams seamlessly from serial cables to wireless WebSockets.
* **Interactive Visualizations:** Live dashboards for multi-device tracking, IMU 3D orientation, and joystick telemetry (`Three.js`), complete with built-in fallback simulation modes.

---

## What’s Next: Roadmap

* **Multi-Device Connectivity:** Scaling the local Control Hub to manage and route telemetry for multiple concurrent ESP32-WROVER boards simultaneously.
* **Resilient NVS Wi-Fi Fallback:** Enhancing the initial NVS Wi-Fi configuration routine to automatically handle unexpected network drops and reconnect gracefully without requiring a hard reboot or manual re-flashing.

---

## Quick Start

1. **Start the Control Hub:**
   ```bash
   npm install
   npm start
