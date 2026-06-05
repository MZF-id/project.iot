/* =============================================
   IoT Dashboard — config.js  (MQTT / HiveMQ Cloud)
   ---------------------------------------------
   Menghubungkan dashboard ke ESP32 via HiveMQ Cloud
   menggunakan MQTT over WebSocket Secure (WSS).

   Cocok dengan sketch ESP32 yang publish ke:
     esp32/suhu        (float string)
     esp32/kelembaban  (float string)
   dan subscribe:
     esp32/led1   payload: "ON" / "OFF"
     esp32/led2   payload: "ON" / "OFF"

   ─── CARA PAKAI ───
   1) Tambahkan library MQTT.js di index.html SEBELUM config.js & app.js:

      <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
      <script src="config.js"></script>
      <script src="app.js"></script>

   2) Buka HiveMQ Cloud → Access Management → buat user khusus
      browser (boleh sama dgn ESP). Lalu isi MQTT.USERNAME &
      MQTT.PASSWORD di bawah.

   3) Di app.js, hapus / abaikan blok `const CONFIG = { ... }`
      (baris 23–28) supaya pakai window.CONFIG dari file ini.
      Atau cukup ganti baris USE_SIMULATION jadi: USE_SIMULATION: false
      lalu biarkan file ini meng-override perilakunya.
   ============================================= */

// ─── 1. KONFIG UTAMA ─────────────────────────
window.CONFIG = {
  USE_SIMULATION: false,
  BASE_URL: '',                // tidak dipakai pada mode MQTT
  FETCH_INTERVAL_MS: 2000,
  SIMULATION_INTERVAL_MS: 2000,
};

// ─── 2. KONFIG MQTT (HiveMQ Cloud) ───────────
const MQTT = {
  // Host HiveMQ (sama dengan mqtt_server di sketch ESP32)
  HOST: '385766ceb4c8403789667e90adec0f3d.s1.eu.hivemq.cloud',

  // Browser WAJIB pakai WebSocket. HiveMQ Cloud:
  //  - 8884  = WSS (TLS)  ✅ untuk halaman https://
  //  - 8000  = WS  (plain) hanya untuk http:// lokal
  PORT: 8884,
  PATH: '/mqtt',
  USE_TLS: true,

  // Kredensial HiveMQ
  USERNAME: 'zulfajri_',
  PASSWORD: '@Zulfajri123',

  // Client ID acak biar tidak bentrok dgn ESP32
  CLIENT_ID: 'dashboard-' + Math.random().toString(16).slice(2, 10),

  // Topik (harus SAMA dengan yang di sketch ESP32)
  TOPIC_TEMP: 'esp32/suhu',
  TOPIC_HUM:  'esp32/kelembaban',
  TOPIC_LED1: 'esp32/led1',
  TOPIC_LED2: 'esp32/led2',
};

window.MQTT_CONFIG = MQTT;

// ─── 3. BRIDGE MQTT → DASHBOARD ──────────────
// Berjalan otomatis setelah DOM siap.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof mqtt === 'undefined') {
    console.error('[MQTT] library mqtt.js belum dimuat. ' +
      'Tambahkan <script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script> sebelum config.js');
    return;
  }

  const scheme = MQTT.USE_TLS ? 'wss' : 'ws';
  const url = `${scheme}://${MQTT.HOST}:${MQTT.PORT}${MQTT.PATH}`;
  console.log('[MQTT] connecting →', url);

  const client = mqtt.connect(url, {
    clientId: MQTT.CLIENT_ID,
    username: MQTT.USERNAME,
    password: MQTT.PASSWORD,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });

  window.mqttClient = client;

  // Cache nilai terakhir supaya bisa update gauge berpasangan
  let lastTemp = null, lastHum = null;

  client.on('connect', () => {
    console.log('[MQTT] ✅ terhubung ke HiveMQ');
    if (typeof setOnline === 'function') setOnline(true);
    if (typeof showToast === 'function') showToast('✅ MQTT terhubung');

    client.subscribe(
      [MQTT.TOPIC_TEMP, MQTT.TOPIC_HUM, MQTT.TOPIC_LED1, MQTT.TOPIC_LED2],
      { qos: 0 },
      (err) => { if (err) console.error('[MQTT] subscribe error:', err); }
    );
  });

  client.on('reconnect', () => console.log('[MQTT] reconnecting...'));
  client.on('close',     () => { console.warn('[MQTT] koneksi tertutup');
                                 if (typeof setOnline === 'function') setOnline(false); });
  client.on('error',     (e) => { console.error('[MQTT] error:', e);
                                 if (typeof setOnline === 'function') setOnline(false); });

  client.on('message', (topic, payload) => {
    const msg = payload.toString().trim();
    // console.log('[MQTT] <-', topic, msg);

    if (topic === MQTT.TOPIC_TEMP) {
      const t = parseFloat(msg);
      if (!isNaN(t)) {
        lastTemp = t;
        if (lastHum !== null && typeof updateDisplay === 'function') {
          updateDisplay(lastTemp, lastHum);
        }
      }
    } else if (topic === MQTT.TOPIC_HUM) {
      const h = parseFloat(msg);
      if (!isNaN(h)) {
        lastHum = h;
        if (lastTemp !== null && typeof updateDisplay === 'function') {
          updateDisplay(lastTemp, lastHum);
        }
      }
    } else if (topic === MQTT.TOPIC_LED1 || topic === MQTT.TOPIC_LED2) {
      // Sinkronisasi state toggle jika LED diubah dari MQTTX
      const num = topic === MQTT.TOPIC_LED1 ? 1 : 2;
      const on  = msg.toUpperCase() === 'ON';
      const tgl = document.getElementById(`led${num}Toggle`);
      if (tgl && tgl.checked !== on) {
        tgl.checked = on;
        if (typeof updateLEDUI === 'function') updateLEDUI(num, on);
      }
    }
  });

  // ─── Override toggle LED → publish ke MQTT ───
  window.toggleLED = function (num) {
    const tgl = document.getElementById(`led${num}Toggle`);
    const on  = tgl.checked;
    const topic = num === 1 ? MQTT.TOPIC_LED1 : MQTT.TOPIC_LED2;

    if (typeof updateLEDUI === 'function') updateLEDUI(num, on);

    if (client.connected) {
      client.publish(topic, on ? 'ON' : 'OFF', { qos: 0, retain: false });
      if (typeof showToast === 'function') showToast(`💡 LED ${num} ${on ? 'ON' : 'OFF'}`);
    } else {
      if (typeof showToast === 'function') showToast(`⚠️ MQTT belum terhubung`);
    }
  };
});
