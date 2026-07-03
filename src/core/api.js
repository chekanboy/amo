// Загрузка данных: построение URL к Apps Script, ленивая загрузка вкладок, состояние загрузки.
// ВАЖНО: логика запросов (URL, параметры period/tab/from/to) и формат данных не изменялись.
import { state } from './state.js';
import { fmtd } from '../utils/format.js';
import { PERIOD_LABELS } from '../utils/constants.js';
import { renderTab } from './render.js';

function setLoading(v){
  document.getElementById('rspin').style.display=v?'inline-block':'none';
  document.getElementById('rlbl').textContent=v?'...':'↻';
  document.getElementById('rbtn').disabled=v;
  document.getElementById('lov').style.display=v?'flex':'none';
  document.getElementById('dash').style.display=v?'none':'block';
}

export function buildUrl(tab){
  let u = (state.cFrom&&state.cTo) ? state.API+'?from='+state.cFrom+'&to='+state.cTo : state.API+'?period='+state.period;
  return u + '&tab=' + (tab||'crm');
}

export function prevUrl(tab){
  const map={today:'yesterday',this_week:'last_week',this_month:'last_month'};
  if(map[state.period]) return state.API+'?period='+map[state.period]+'&tab='+(tab||'crm');
  return null;
}

// Полная перезагрузка текущей вкладки (кнопка обновить, смена периода)
export async function load(){
  state.loadedTabs = {};
  state.raw = null;
  await loadTab(state.currentTab);
}

// Грузит данные конкретной вкладки и мержит в state.raw
export async function loadTab(tab){
  setLoading(true);
  try{
    const r = await fetch(buildUrl(tab));
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    if(data.error) throw new Error(data.error);

    if(!state.raw) state.raw = {};
    Object.assign(state.raw, data);
    state.loadedTabs[tab] = true;

    document.getElementById('plbl').textContent = state.cFrom&&state.cTo ? fmtd(state.cFrom)+' — '+fmtd(state.cTo) : (PERIOD_LABELS[state.period]||state.period);
    document.getElementById('upd').textContent = data.updatedAt||'';

    // Сравнение с прошлым периодом только для CRM
    if(tab==='crm'){
      state.prev=null;
      const pu=prevUrl('crm');
      if(pu){try{const r2=await fetch(pu);const p2=await r2.json();if(!p2.error)state.prev=p2;}catch(e){}}
    }

    renderTab(tab);
  }catch(e){
    document.getElementById('lov').style.display='flex';
    document.getElementById('lov').innerHTML=`<div style="color:var(--red);text-align:center;font-size:13px">Ошибка: ${e.message}<br><br><button class="btn" onclick="loadTab('${tab}')" style="margin:0 auto">↻ Повторить</button></div>`;
    document.getElementById('dash').style.display='none';
    return;
  }
  setLoading(false);
}
