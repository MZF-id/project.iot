/* =============================================
   IoT Dashboard — config.js  (MQTT / HiveMQ Cloud)
   ESP-aware: online/offline indikator mengikuti ESP
   (bukan broker), state LED retained, gauge auto-reset.
   ============================================= */

window.CONFIG = {
  USE_SIMULATION: false,
  FETCH_INTERVAL_MS: 2000,
  ESP_TIMEOUT_MS: 15000, // kalau >15s tdk ada data → anggap offline
};

const MQTT = {
  HOST: '385766ceb4c8403789667e90adec0f3d.s1.eu.hivemq.cloud',
  PORT: 8884,
  PATH: '/mqtt',
  USE_TLS: true,
  USERNAME: 'zulfajri_',
  PASSWORD: '@Zulfajri123',
  CLIENT_ID: 'dashboard-' + Math.random().toString(16).slice(2, 10),

  TOPIC_TEMP:   'esp32/suhu',
  TOPIC_HUM:    'esp32/kelembaban',
  TOPIC_LED1:   'esp32/led1',
  TOPIC_LED2:   'esp32/led2',
  TOPIC_STATUS: 'esp32/status', // retained + LWT dari ESP: "online"/"offline"
};
window.MQTT_CONFIG = MQTT;

// ─── State ESP ──────────────────────────────
const ESP = {
  connected: false,
  lastDataAt: 0,
};
window.ESP_STATE = ESP;

function setESPConnected(connected, opts = {}) {
  const changed = ESP.connected !== connected;
  ESP.connected = connected;
  if (typeof setOnline === 'function') setOnline(connected);
  if (typeof setControlsEnabled === 'function') setControlsEnabled(connected);
  if (!connected && typeof resetGauges === 'function') resetGauges();
  if (changed && typeof showToast === 'function') {
    showToast(connected ? '✅ ESP terhubung' : '⚠️ ESP terputus');
  }
}
window.setESPConnected = setESPConnected;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof mqtt === 'undefined') {
    console.error('[MQTT] mqtt.js belum dimuat.');
    return;
  }

  // mulai dgn UI offline
  setESPConnected(false);

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

  let lastTemp = null, lastHum = null;

  client.on('connect', () => {
    console.log('[MQTT] ✅ broker connected');
    client.subscribe(
      [MQTT.TOPIC_TEMP, MQTT.TOPIC_HUM, MQTT.TOPIC_LED1, MQTT.TOPIC_LED2, MQTT.TOPIC_STATUS],
      { qos: 0 },
      (err) => { if (err) console.error('[MQTT] subscribe error:', err); }
    );
  });

  client.on('close', () => setESPConnected(false));
  client.on('error', (e) => { console.error('[MQTT] error:', e); setESPConnected(false); });

  client.on('message', (topic, payload) => {
    const msg = payload.toString().trim();

    if (topic === MQTT.TOPIC_STATUS) {
      setESPConnected(msg.toLowerCase() === 'online');
      return;
    }

    if (topic === MQTT.TOPIC_TEMP || topic === MQTT.TOPIC_HUM) {
      // Data baru = ESP pasti online
      ESP.lastDataAt = Date.now();
      if (!ESP.connected) setESPConnected(true);

      const v = parseFloat(msg);
      if (isNaN(v)) return;
      if (topic === MQTT.TOPIC_TEMP) lastTemp = v; else lastHum = v;
      if (lastTemp !== null && lastHum !== null && typeof updateDisplay === 'function') {
        updateDisplay(lastTemp, lastHum);
      }
      return;
    }

    if (topic === MQTT.TOPIC_LED1 || topic === MQTT.TOPIC_LED2) {
      const num = topic === MQTT.TOPIC_LED1 ? 1 : 2;
      const on  = msg.toUpperCase() === 'ON' || msg === '1';
      const tgl = document.getElementById(`led${num}Toggle`);
      if (tgl) tgl.checked = on;
      if (typeof updateLEDUI === 'function') updateLEDUI(num, on);
    }
  });

  // Watchdog: kalau ESP tdk kirim data > timeout → offline
  setInterval(() => {
    if (ESP.connected && ESP.lastDataAt &&
        Date.now() - ESP.lastDataAt > window.CONFIG.ESP_TIMEOUT_MS) {
      setESPConnected(false);
    }
  }, 3000);

  // Override toggle LED → publish ke MQTT (retained agar persist)
  window.toggleLED = function (num) {
    const tgl = document.getElementById(`led${num}Toggle`);
    if (!ESP.connected) {
      // Tdk boleh hidupkan → kembalikan toggle
      tgl.checked = !tgl.checked;
      if (typeof showToast === 'function') showToast('⚠️ ESP belum terhubung');
      return;
    }
    const on = tgl.checked;
    const topic = num === 1 ? MQTT.TOPIC_LED1 : MQTT.TOPIC_LED2;
    if (typeof updateLEDUI === 'function') updateLEDUI(num, on);
    client.publish(topic, on ? 'ON' : 'OFF', { qos: 0, retain: true });
    if (typeof showToast === 'function') showToast(`💡 LED ${num} ${on ? 'ON' : 'OFF'}`);
  };
});
