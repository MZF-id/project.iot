/* =============================================
   IoT Dashboard — app.js
   Monitoring DHT11 (Suhu & Kelembapan) + 2 LED
   ============================================= */

// ─── STATE ────────────────────────────────────
const state = {
  temp: null,
  hum: null,
  tempMin: null, tempMax: null,
  humMin: null, humMax: null,
  led1: false,
  led2: false,
  history: [],
  maxHistory: 20,
  online: true,
  simulationInterval: null,
};

// ─── CONFIG ───────────────────────────────────
// Untuk koneksi ke backend nyata, ubah USE_SIMULATION ke false
// dan isi BASE_URL dengan alamat server ESP8266/ESP32 kamu
const CONFIG = {
  USE_SIMULATION: false,
  BASE_URL: 'http://192.168.1.100',  // ganti IP ESP
  FETCH_INTERVAL_MS: 2000,
  SIMULATION_INTERVAL_MS: 2000,
};

// ─── CHART SETUP ──────────────────────────────
let chart = null;

function initChart() {
  const ctx = document.getElementById('sensorChart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperature (°C)',
          data: [],
          borderColor: '#ff4e50',
          backgroundColor: 'rgba(255, 78, 80, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#ff4e50',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Humidity (%)',
          data: [],
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.06)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#00e5ff',
          fill: true,
          tension: 0.4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 15, 30, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: 'rgba(232, 240, 254, 0.5)',
          bodyColor: '#e8f0fe',
          padding: 10,
          titleFont: { family: 'Share Tech Mono', size: 11 },
          bodyFont: { family: 'Share Tech Mono', size: 11 },
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: 'rgba(232, 240, 254, 0.3)',
            font: { family: 'Share Tech Mono', size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0,
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: 'rgba(232, 240, 254, 0.3)',
            font: { family: 'Share Tech Mono', size: 10 },
          },
          min: 0, max: 100,
        }
      }
    }
  });
}

// ─── GAUGE ANIMATION ─────────────────────────
/**
 * Animasi gauge semicircle
 * @param {string} arcId - ID elemen SVG path arc
 * @param {string} needleId - ID elemen SVG needle group
 * @param {number} value - nilai saat ini
 * @param {number} min - nilai minimum
 * @param {number} max - nilai maksimum
 */
function updateGauge(arcId, needleId, value, min, max) {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const totalDash = 251; // panjang arc setengah lingkaran (approx)
  const offset = totalDash - pct * totalDash;

  const arc = document.getElementById(arcId);
  if (arc) {
    arc.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
    arc.style.strokeDashoffset = offset;
  }

  // Needle: -90° (kiri) → +90° (kanan) via 0° (atas)
  const angle = -90 + pct * 180;
  const needle = document.getElementById(needleId);
  if (needle) {
    needle.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
    needle.setAttribute('transform', `rotate(${angle} 100 110)`);
  }
}

// ─── DISPLAY UPDATE ──────────────────────────
function updateDisplay(temp, hum) {
  // Update min/max
  if (state.tempMin === null || temp < state.tempMin) state.tempMin = temp;
  if (state.tempMax === null || temp > state.tempMax) state.tempMax = temp;
  if (state.humMin === null || hum < state.humMin) state.humMin = hum;
  if (state.humMax === null || hum > state.humMax) state.humMax = hum;

  // Temperature gauge (0–50°C)
  const tempEl = document.getElementById('tempValue');
  if (tempEl) {
    tempEl.textContent = temp.toFixed(2);
    triggerFlash(tempEl);
  }
  updateGauge('tempArc', 'tempNeedle', temp, 0, 50);
  setTextSafe('tempMin', state.tempMin !== null ? state.tempMin.toFixed(1) + '°' : '--');
  setTextSafe('tempMax', state.tempMax !== null ? state.tempMax.toFixed(1) + '°' : '--');

  // Humidity gauge (0–100%)
  const humEl = document.getElementById('humValue');
  if (humEl) {
    humEl.textContent = hum.toFixed(2);
    triggerFlash(humEl);
  }
  updateGauge('humArc', 'humNeedle', hum, 0, 100);
  setTextSafe('humMin', state.humMin !== null ? state.humMin.toFixed(1) + '%' : '--');
  setTextSafe('humMax', state.humMax !== null ? state.humMax.toFixed(1) + '%' : '--');

  // Time
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
  setTextSafe('lastUpdate', timeStr);

  // Push ke history & chart
  pushHistory(temp, hum, timeStr);
}

function setTextSafe(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function triggerFlash(el) {
  el.classList.remove('updated');
  void el.offsetWidth; // reflow
  el.classList.add('updated');
}

// ─── HISTORY & CHART UPDATE ──────────────────
function pushHistory(temp, hum, timeLabel) {
  state.history.push({ temp, hum, time: timeLabel });
  if (state.history.length > state.maxHistory) state.history.shift();

  if (!chart) return;

  const labels = state.history.map(h => h.time);
  const tempData = state.history.map(h => h.temp);
  const humData = state.history.map(h => h.hum);

  chart.data.labels = labels;
  chart.data.datasets[0].data = tempData;
  chart.data.datasets[1].data = humData;
  chart.update('none');

  setTextSafe('dataCount', state.history.length);
}

function clearHistory() {
  state.history = [];
  state.tempMin = null; state.tempMax = null;
  state.humMin = null; state.humMax = null;
  if (chart) {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update();
  }
  setTextSafe('dataCount', 0);
  setTextSafe('tempMin', '--'); setTextSafe('tempMax', '--');
  setTextSafe('humMin', '--'); setTextSafe('humMax', '--');
  showToast('📊 History dibersihkan');
}

function exportCSV() {
  if (state.history.length === 0) {
    showToast('⚠️ Tidak ada data untuk diekspor');
    return;
  }
  let csv = 'Time,Temperature (°C),Humidity (%)\n';
  state.history.forEach(h => {
    csv += `${h.time},${h.temp.toFixed(2)},${h.hum.toFixed(2)}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sensor_dht11_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ CSV berhasil diekspor');
}

// ─── LED CONTROL ─────────────────────────────
function toggleLED(num) {
  const toggle = document.getElementById(`led${num}Toggle`);
  const isOn = toggle.checked;

  if (num === 1) state.led1 = isOn;
  if (num === 2) state.led2 = isOn;

  updateLEDUI(num, isOn);

  if (!CONFIG.USE_SIMULATION) {
    // Kirim ke ESP / server
    fetch(`${CONFIG.BASE_URL}/led${num}?state=${isOn ? 1 : 0}`)
      .then(res => res.text())
      .then(txt => console.log(`LED ${num}:`, txt))
      .catch(() => showToast(`⚠️ Gagal kontrol LED ${num}`));
  } else {
    showToast(`💡 LED ${num} ${isOn ? 'ON' : 'OFF'}`);
  }
}

function updateLEDUI(num, isOn) {
  const bulb = document.getElementById(`led${num}Bulb`);
  const status = document.getElementById(`led${num}Status`);
  const item = document.getElementById(`led${num}Item`);
  const iconWrap = item.querySelector('.led-icon-wrap');

  if (isOn) {
    bulb.className = `led-bulb on-led${num}`;
    status.textContent = 'ON';
    status.className = 'led-status on';
    iconWrap.classList.add('active');
  } else {
    bulb.className = 'led-bulb';
    status.textContent = 'OFF';
    status.className = 'led-status';
    iconWrap.classList.remove('active');
  }
}

// ─── TOAST NOTIFICATION ──────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── ONLINE / OFFLINE UI ─────────────────────
function setOnline(val) {
  state.online = val;
  const badge = document.getElementById('connBadge');
  const text = document.getElementById('connText');
  if (!badge || !text) return;
  if (val) {
    badge.classList.remove('offline');
    text.textContent = 'ONLINE';
  } else {
    badge.classList.add('offline');
    text.textContent = 'OFFLINE';
  }
}

// ─── SIMULATION MODE ─────────────────────────
let simTemp = 29 + Math.random() * 2;
let simHum = 75 + Math.random() * 5;

function runSimulation() {
  // Drift lambat agar terlihat realistis
  simTemp += (Math.random() - 0.5) * 0.4;
  simHum += (Math.random() - 0.5) * 0.8;
  simTemp = Math.max(20, Math.min(45, simTemp));
  simHum = Math.max(30, Math.min(95, simHum));

  updateDisplay(simTemp, simHum);
  setOnline(true);
}

// ─── REAL FETCH MODE ─────────────────────────
async function fetchSensorData() {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}/sensor`, { timeout: 3000 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // Expected format: { temperature: 29.0, humidity: 76.0, led1: 0, led2: 0 }
    updateDisplay(data.temperature, data.humidity);

    // Sinkronisasi state LED dari server
    if (typeof data.led1 !== 'undefined' && data.led1 !== (state.led1 ? 1 : 0)) {
      state.led1 = Boolean(data.led1);
      document.getElementById('led1Toggle').checked = state.led1;
      updateLEDUI(1, state.led1);
    }
    if (typeof data.led2 !== 'undefined' && data.led2 !== (state.led2 ? 1 : 0)) {
      state.led2 = Boolean(data.led2);
      document.getElementById('led2Toggle').checked = state.led2;
      updateLEDUI(2, state.led2);
    }
    setOnline(true);
  } catch (err) {
    console.warn('Fetch gagal:', err.message);
    setOnline(false);
  }
}

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initChart();

  if (CONFIG.USE_SIMULATION) {
    console.log('🟢 Mode Simulasi aktif — data digenerate otomatis');
    runSimulation(); // langsung tampil
    setInterval(runSimulation, CONFIG.SIMULATION_INTERVAL_MS);
    showToast('🔄 Mode simulasi aktif');
  } else {
    console.log(`🔌 Mode Nyata — terhubung ke ${CONFIG.BASE_URL}`);
    fetchSensorData();
    setInterval(fetchSensorData, CONFIG.FETCH_INTERVAL_MS);
  }
});

// ─── EXPOSE UNTUK HTML EVENT HANDLERS ────────
window.toggleLED = toggleLED;
window.clearHistory = clearHistory;
window.exportCSV = exportCSV;
