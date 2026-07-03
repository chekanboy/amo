// Точка входа: стили, регистрация глобальных обработчиков (для inline onclick в разметке), инициализация.
import './styles/theme.css';
import './styles/base.css';
import './styles/components.css';
import './styles/mobile.css';

import { state } from './core/state.js';
import { checkPw, initGate } from './core/gate.js';
import { applyTheme, toggleTheme } from './core/theme.js';
import { load, loadTab } from './core/api.js';
import { connect, resetSetup, applyRange, initNav } from './core/nav.js';
import { showLeadsPopup } from './components/drilldown.js';
import { switchGeoView, renderGeoFlat, setGeoSort, toggleCity, toggleEl } from './components/geo.js';
import { switchSrcTab } from './tabs/metrika.js';

// Разметка использует inline-обработчики (onclick/oninput/onkeydown) — эти функции
// должны быть доступны в глобальной области. При сборке в модуль они по умолчанию
// не попадают в window, поэтому регистрируем их явно.
Object.assign(window, {
  checkPw,
  toggleTheme,
  load,
  loadTab,
  connect,
  resetSetup,
  applyRange,
  showLeadsPopup,
  switchGeoView,
  renderGeoFlat,
  setGeoSort,
  toggleCity,
  toggleEl,
  switchSrcTab,
});

// ── INIT ──
initGate();
initNav();

// Применяем сохранённую тему сразу
applyTheme(localStorage.getItem('alfa_theme') || 'light');

// Дефолтный диапазон дат: последние 30 дней
const now=new Date();
document.getElementById('dt').value=now.toISOString().slice(0,10);
document.getElementById('df').value=new Date(now-30*86400000).toISOString().slice(0,10);

// Если Apps Script URL уже сохранён — сразу грузим, иначе показываем экран подключения
state.API=localStorage.getItem('alfa_api_v2')||'';
if(state.API&&state.API.startsWith('https://script.google.com')){
  document.getElementById('setup').style.display='none';
  document.getElementById('main').style.display='block';
  load();
}else{document.getElementById('aurl').value=state.API;}
