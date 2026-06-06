/* =============================================
   IoT Dashboard — app.js (ESP-aware)
   ============================================= */

const state = {
  temp: null, hum: null,
  tempMin: null, tempMax: null, humMin: null, humMax: null,
  led1: false, led2: false,
  history: [], maxHistory: 20,
  online: false,
  settings: {
    theme: localStorage.getItem('theme') || 'dark',
    tempAlert: parseFloat(localStorage.getItem('tempAlert')) || 40,
  },
};

let chart = null;

function initChart() {
  const ctx = document.getElementById('sensorChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label:'Temperature (°C)', data:[], borderColor:'#ff4e50',
        backgroundColor:'rgba(255,78,80,0.08)', borderWidth:2, pointRadius:3,
        pointBackgroundColor:'#ff4e50', fill:true, tension:0.4 },
      { label:'Humidity (%)', data:[], borderColor:'#00e5ff',
        backgroundColor:'rgba(0,229,255,0.06)', borderWidth:2, pointRadius:3,
        pointBackgroundColor:'#00e5ff', fill:true, tension:0.4 },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:'index' },
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'rgba(10,15,30,0.95)',
          borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
          titleColor:'rgba(232,240,254,0.5)', bodyColor:'#e8f0fe', padding:10,
          titleFont:{family:'Share Tech Mono',size:11},
          bodyFont:{family:'Share Tech Mono',size:11} } },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'},
            ticks:{color:'rgba(232,240,254,0.3)',
              font:{family:'Share Tech Mono',size:10}, maxTicksLimit:8, maxRotation:0 } },
        y:{ grid:{color:'rgba(255,255,255,0.04)'},
            ticks:{color:'rgba(232,240,254,0.3)',
              font:{family:'Share Tech Mono',size:10} }, min:0, max:100 } }
    }
  });
}

function updateGauge(arcId, needleId, value, min, max) {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const totalDash = 251;
  const offset = totalDash - pct * totalDash;
  const arc = document.getElementById(arcId);
  if (arc) {
    arc.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)';
    arc.style.strokeDashoffset = offset;
  }
  const angle = -90 + pct * 180;
  const needle = document.getElementById(needleId);
  if (needle) {
    needle.style.transition = 'transform 0.8s cubic-bezier(0.34,1.56,0.64,1)';
    needle.setAttribute('transform', `rotate(${angle} 100 110)`);
  }
}

function updateDisplay(temp, hum) {
  if (state.tempMin === null || temp < state.tempMin) state.tempMin = temp;
  if (state.tempMax === null || temp > state.tempMax) state.tempMax = temp;
  if (state.humMin === null || hum < state.humMin) state.humMin = hum;
  if (state.humMax === null || hum > state.humMax) state.humMax = hum;

  const tempEl = document.getElementById('tempValue');
  if (tempEl) { tempEl.textContent = temp.toFixed(2); triggerFlash(tempEl); }
  updateGauge('tempArc','tempNeedle', temp, 0, 50);
  setTextSafe('tempMin', state.tempMin!==null ? state.tempMin.toFixed(1)+'°' : '--');
  setTextSafe('tempMax', state.tempMax!==null ? state.tempMax.toFixed(1)+'°' : '--');

  const humEl = document.getElementById('humValue');
  if (humEl) { humEl.textContent = hum.toFixed(2); triggerFlash(humEl); }
  updateGauge('humArc','humNeedle', hum, 0, 100);
  setTextSafe('humMin', state.humMin!==null ? state.humMin.toFixed(1)+'%' : '--');
  setTextSafe('humMax', state.humMax!==null ? state.humMax.toFixed(1)+'%' : '--');

  const now = new Date();
  setTextSafe('lastUpdate', now.toLocaleTimeString('id-ID',{hour12:false}));
  pushHistory(temp, hum, now.toLocaleTimeString('id-ID',{hour12:false}));

  // Alert suhu tinggi
  if (temp >= state.settings.tempAlert) {
    document.getElementById('tempCard')?.classList.add('alert');
  } else {
    document.getElementById('tempCard')?.classList.remove('alert');
  }
}

// ─── Reset gauge ke 0 (saat ESP offline) ────
function resetGauges() {
  setTextSafe('tempValue','0.00');
  setTextSafe('humValue','0.00');
  updateGauge('tempArc','tempNeedle', 0, 0, 50);
  updateGauge('humArc','humNeedle', 0, 0, 100);
  document.getElementById('tempCard')?.classList.remove('alert');
}
window.resetGauges = resetGauges;

// ─── Enable/disable LED toggle ──────────────
function setControlsEnabled(enabled) {
  document.querySelectorAll('.led-item').forEach(el => {
    el.classList.toggle('disabled', !enabled);
  });
  ['led1Toggle','led2Toggle'].forEach(id => {
    const t = document.getElementById(id);
    if (t) t.disabled = !enabled;
  });
}
window.setControlsEnabled = setControlsEnabled;

function setTextSafe(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }
function triggerFlash(el){ el.classList.remove('updated'); void el.offsetWidth; el.classList.add('updated'); }

function pushHistory(temp, hum, timeLabel) {
  state.history.push({temp,hum,time:timeLabel});
  if (state.history.length > state.maxHistory) state.history.shift();
  if (!chart) return;
  chart.data.labels = state.history.map(h=>h.time);
  chart.data.datasets[0].data = state.history.map(h=>h.temp);
  chart.data.datasets[1].data = state.history.map(h=>h.hum);
  chart.update('none');
  setTextSafe('dataCount', state.history.length);
}

function clearHistory() {
  state.history = [];
  state.tempMin=state.tempMax=state.humMin=state.humMax=null;
  if (chart){ chart.data.labels=[]; chart.data.datasets[0].data=[]; chart.data.datasets[1].data=[]; chart.update(); }
  setTextSafe('dataCount',0);
  setTextSafe('tempMin','--'); setTextSafe('tempMax','--');
  setTextSafe('humMin','--'); setTextSafe('humMax','--');
  showToast('📊 History dibersihkan');
}

function exportCSV() {
  if (!state.history.length) { showToast('⚠️ Tidak ada data'); return; }
  let csv = 'Time,Temperature (°C),Humidity (%)\n';
  state.history.forEach(h=>{ csv += `${h.time},${h.temp.toFixed(2)},${h.hum.toFixed(2)}\n`; });
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  a.download = `sensor_dht11_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV diekspor');
}

// LED UI placeholder; actual toggleLED diovveride oleh config.js
function toggleLED(num){ /* di-override config.js */ }

function updateLEDUI(num,isOn){
  const bulb = document.getElementById(`led${num}Bulb`);
  const status = document.getElementById(`led${num}Status`);
  const item = document.getElementById(`led${num}Item`);
  const iconWrap = item?.querySelector('.led-icon-wrap');
  if (!bulb||!status||!item) return;
  state[`led${num}`] = isOn;
  if (isOn) { bulb.className=`led-bulb on-led${num}`; status.textContent='ON';
    status.className='led-status on'; iconWrap?.classList.add('active'); }
  else { bulb.className='led-bulb'; status.textContent='OFF';
    status.className='led-status'; iconWrap?.classList.remove('active'); }
}

function showToast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'),2500);
}

function setOnline(val){
  state.online = val;
  const badge = document.getElementById('connBadge');
  const text  = document.getElementById('connText');
  if (!badge||!text) return;
  badge.classList.toggle('offline', !val);
  text.textContent = val ? 'ONLINE' : 'OFFLINE';
}

// ─── DRAWER (hamburger) ──────────────────────
function openDrawer(){ document.getElementById('drawer').classList.add('open');
  document.getElementById('backdrop').classList.add('show'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show'); }

// ─── SETTINGS PANEL (gear) ──────────────────
function openSettings(){ document.getElementById('settings').classList.add('open');
  document.getElementById('backdrop').classList.add('show'); }
function closeSettings(){ document.getElementById('settings').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show'); }

function applyTheme(theme){
  state.settings.theme = theme;
  localStorage.setItem('theme', theme);
  document.body.classList.toggle('light', theme==='light');
}

function refreshStats(){
  const avg = (arr,k)=> arr.length? (arr.reduce((s,x)=>s+x[k],0)/arr.length).toFixed(1):'--';
  setTextSafe('statAvgTemp', avg(state.history,'temp'));
  setTextSafe('statAvgHum',  avg(state.history,'hum'));
  setTextSafe('statSamples', state.history.length);
  setTextSafe('statStatus', state.online? 'ONLINE':'OFFLINE');
}

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  resetGauges();
  setControlsEnabled(false);
  applyTheme(state.settings.theme);

  // Hamburger
  document.getElementById('menuBtn')?.addEventListener('click', ()=>{ refreshStats(); openDrawer(); });
  document.getElementById('drawerClose')?.addEventListener('click', closeDrawer);

  // Gear
  document.getElementById('gearBtn')?.addEventListener('click', openSettings);
  document.getElementById('settingsClose')?.addEventListener('click', closeSettings);
  document.getElementById('backdrop')?.addEventListener('click', ()=>{ closeDrawer(); closeSettings(); });

  // Settings controls
  const themeSel = document.getElementById('themeSelect');
  if (themeSel){ themeSel.value = state.settings.theme;
    themeSel.addEventListener('change', e=> applyTheme(e.target.value)); }
  const tAlert = document.getElementById('tempAlertInput');
  if (tAlert){ tAlert.value = state.settings.tempAlert;
    tAlert.addEventListener('change', e=>{
      state.settings.tempAlert = parseFloat(e.target.value)||40;
      localStorage.setItem('tempAlert', state.settings.tempAlert);
      showToast('⚙️ Threshold disimpan');
    });
  }
  document.getElementById('resetBtn')?.addEventListener('click', ()=>{
    clearHistory(); closeSettings();
  });
});

window.toggleLED = toggleLED;
window.updateLEDUI = updateLEDUI;
window.setOnline = setOnline;
window.updateDisplay = updateDisplay;
window.showToast = showToast;
window.clearHistory = clearHistory;
window.exportCSV = exportCSV;
