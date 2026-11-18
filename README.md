# WROVER Flash Lab (local)

Web Serial flasher + WebSocket hub for the Freenove ESP32-WROVER. No dependencies, Node 18+.

## Run

```
npm start          # or: node hub.js
npm run dev        # also logs every telemetry frame
PORT=9000 npm start
```

Open **http://localhost:8080** in desktop Chrome or Edge. Use `localhost`, not your LAN IP: browsers only allow Web Serial on HTTPS or localhost.

The hub prints your LAN address on startup, e.g. `ws://192.168.1.20:8080/ws`. Put that IP in the page's **Hub host** field when provisioning Wi-Fi so boards know where to connect.

## Layout

```
hub.js            static server for public/ + WebSocket relay on /ws
public/index.html the flash lab page
public/*.bin      drop firmware here if you want the page to fetch it later
firmware/         Arduino sketches (mpu6050_ball, joystick_ball)
```

## MPU-6050 ball demo

`firmware/mpu6050_ball/mpu6050_ball.ino`. Wiring: VCC→3V3, GND→GND, SCL→GPIO 22, SDA→GPIO 21. No extra libraries.

1. Arduino IDE: board **ESP32 Wrover Module**, then Sketch → Export Compiled Binary.
2. In the page, step 4: **+ Add image**, choose `mpu6050_ball.ino.merged.bin` (offset `0x0`), Flash.
3. Open the **IMU 3D** tab. It unlocks when the board says `"fw":"mpu6050-ball"` and runs the hardware checklist.

Every file is checked before flashing (chip family, chip revision, flash size, offsets, partition table). Uno `.hex` files, raw `.ino` sketches and builds for other ESP32 variants are refused with a reason.

## HW-504 joystick ball demo

`firmware/joystick_ball/joystick_ball.ino`. Wiring: GND→GND, **+5V→3V3 (not 5V)**, VRx→GPIO 34, VRy→GPIO 35, SW→GPIO 25. No extra libraries.
These pins don't clash with the MPU-6050 (21/22) or the camera connector, so both sensors can stay wired.

Flash it the same way, then open the **Joystick 3D** tab. The stick pushes the ball, a click makes it hop and lights the virtual LED.
The self-test checks each wire (a pull-resistor test spots an unplugged VRx/VRy), the rest position (catches a 5V supply) and the button;
the page then asks you to push the stick to every edge and click it to finish the checklist.

## Hub protocol (JSON text frames)

| Direction | Example |
|---|---|
| board → hub | `{"device_id":"wrover-a1b2c3","capabilities":["potentiometer","button"]}` |
| board → hub | `{"device_id":"wrover-a1b2c3","pot":2048,"button":0}` |
| dashboard → hub | `{"device_id":"wrover-91be07","cmd":"set","value":1234}` |

Every frame is broadcast to every other client. Boards should ignore frames whose `device_id` isn't theirs. The last capabilities packet per device is replayed to anyone who connects, so dashboard cards appear right away.

## Debugging

- Browser: event log on the right of the page, plus DevTools console lines prefixed `[wrover-lab]`.
- Hub: terminal lines prefixed `[hub]` show connects, disconnects, capabilities, commands and bad JSON.
- Windows firewall may block boards from reaching port 8080 the first time. Allow Node on private networks.
- If the port picker is empty, install the CH340 driver and try a different (data, not charge-only) USB cable.
