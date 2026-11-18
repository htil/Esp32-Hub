// WROVER Flash Lab — local hub (zero dependencies, Node 18+)
// Serves ./public at http://localhost:8080 and relays JSON over ws://<host>:8080/ws
//   Boards (ESP32) and dashboards (browser) both connect to /ws.
//   Board → hub:     {"device_id":"wrover-a1b2c3","capabilities":["potentiometer","button"]}
//                    {"device_id":"wrover-a1b2c3","pot":2048,"button":0}
//   Dashboard → hub: {"device_id":"wrover-91be07","cmd":"set","value":1234}
// Every frame is broadcast to all other clients; boards ignore frames whose device_id isn't theirs.
// The last capabilities packet per device is replayed to new clients so cards appear immediately.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const VERBOSE = !!process.env.VERBOSE;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css' };

const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[${ts()}][hub]`, ...a);

// ---------- static files (firmware .bin and manifest.json can live in public/ too) ----------
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); log('404', urlPath); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---------- minimal RFC 6455 WebSocket server ----------
const clients = new Set();
const caps = new Map(); // device_id -> last capabilities packet

function frame(text, opcode = 0x1) {
  const payload = Buffer.from(text);
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, payload]);
}

function send(c, text) { if (!c.socket.destroyed) c.socket.write(frame(text)); }

server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws' || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  const c = { socket, label: req.socket.remoteAddress.replace('::ffff:', ''), buf: Buffer.alloc(0), frag: [] };
  clients.add(c);
  log(`connect ${c.label} (${clients.size} clients)`);
  for (const pkt of caps.values()) send(c, JSON.stringify(pkt));

  socket.on('data', chunk => {
    c.buf = Buffer.concat([c.buf, chunk]);
    for (;;) {
      if (c.buf.length < 2) return;
      const fin = c.buf[0] & 0x80, op = c.buf[0] & 0x0f, masked = c.buf[1] & 0x80;
      let len = c.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (c.buf.length < need) return;
      let data = c.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = c.buf.subarray(off, off + 4); data = Buffer.from(data.map((b, i) => b ^ m[i & 3])); }
      c.buf = c.buf.subarray(need);

      if (op === 0x8) { socket.end(frame('', 0x8)); return; }          // close
      if (op === 0x9) { socket.write(frame(data, 0xA)); continue; }    // ping → pong
      if (op === 0xA) continue;                                        // pong
      c.frag.push(data);                                               // text / continuation
      if (fin) { const text = Buffer.concat(c.frag).toString('utf8'); c.frag = []; onMessage(c, text); }
    }
  });

  const drop = why => { if (clients.delete(c)) log(`disconnect ${c.label}${why ? ' ' + why : ''} (${clients.size} clients)`); };
  socket.on('close', () => drop());
  socket.on('error', err => drop(`error=${err.code || err.message}`));
});

function onMessage(c, text) {
  let msg;
  try { msg = JSON.parse(text); } catch { log(`bad JSON from ${c.label}:`, text.slice(0, 120)); return; }
  if (msg.device_id && !c.label.includes('@')) c.label = `${msg.device_id}@${c.label}`;
  if (msg.capabilities) { caps.set(msg.device_id, msg); log(`capabilities ${msg.device_id}:`, msg.capabilities.join(', ')); }
  else if (msg.cmd) log(`cmd → ${msg.device_id}`, text.slice(0, 200));
  else if (VERBOSE) log(`telemetry ${msg.device_id ?? '?'}`, text.slice(0, 200));
  for (const o of clients) if (o !== c) send(o, text);
}

// keep idle board connections alive through home routers
setInterval(() => { for (const c of clients) if (!c.socket.destroyed) c.socket.write(frame('', 0x9)); }, 25000).unref();

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  log(`dashboard  http://localhost:${PORT}   (open it via localhost so Web Serial is allowed)`);
  for (const ip of lan) log(`boards     ws://${ip}:${PORT}/ws   (put ${ip} in the "Hub host" field)`);
});
