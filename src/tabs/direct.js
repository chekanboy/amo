// Вкладка «Директ»: ROI-аналитика (расход Директа × заявки/продажи из CRM),
// сегментация Кампании/Города/Сайты, панель неатрибутированного трафика, ключевые слова.
//
// ── Почему ключевые слова разбиты на ДВЕ таблицы ──
// directKeywords[].keyword = Criterion из SEARCH_QUERY_PERFORMANCE_REPORT — это поисковый
// ЗАПРОС пользователя (не фраза-ставка), у него нет ID. CRM yandex[].term = utm_term.
// Они почти никогда не совпадают текстом и джойнить их не по чему. Поэтому честнее показать
// два раздельных среза: слева расход по запросам Директа, справа результат по utm_term из CRM.
import { drillNum } from '../components/drilldown.js';
import { cc } from '../utils/format.js';

// Пороги оценки статуса кампании (заданы заказчиком)
const CPO_TARGET = 15000;   // CPO ≤ этого → 💰 окупается; выше → ⚠️ дорого
const WASTE_COST = 20000;   // расход ≥ этого при 0 продаж → 🔴 сливает

const rub = n => (n||0).toLocaleString('ru');

// Валидный ID кампании = числовая строка (utm_campaign вида "709004760")
const isValidCampId = v => /^\d+$/.test(String(v==null?'':v).trim());

// Город зашит в название кампании ("...Спб") — регионы из Директа не тянем
function cityFromName(name){
  const s=(name||'').toLowerCase();
  if(/спб|spb|питер|санкт|петербург/.test(s)) return 'Санкт-Петербург';
  if(/мск|msk|москва/.test(s)) return 'Москва';
  return '—';
}

// Тип мусора в utm_campaign (для разбивки «Источник неизвестен»)
function junkType(v){
  const s=String(v==null?'':v).trim();
  if(!s||s==='—') return 'пусто';
  const low=s.toLowerCase();
  if(low==='autotargeting') return 'autotargeting';
  if(low.includes('<не указано>')||low.includes('<не заполнено>')) return '<не указано>';
  if(s.includes('{')||s.includes('}')) return 'сломанный макрос';
  return 'прочее';
}

// Статус кампании по порогам
function roiStatus(cost, bought, cpo){
  if(bought>0) return cpo<=CPO_TARGET
    ? {emoji:'💰', label:'окупается', color:'var(--green)'}
    : {emoji:'⚠️', label:'дорого',    color:'var(--amber)'};
  if(cost>=WASTE_COST) return {emoji:'🔴', label:'сливает', color:'var(--red)'};
  return {emoji:'', label:'мало данных', color:'var(--tx3)'};   // расход<порога и 0 продаж — нейтрально
}

const cplColor = v => v==null?'var(--tx3)':v>3000?'var(--red)':v>1500?'var(--amber)':'var(--green)';
const cpoColor = v => v==null?'var(--tx3)':v>CPO_TARGET?'var(--red)':'var(--green)';
const cityIcon = c => c==='Москва'?'🏙️':c==='Санкт-Петербург'?'🌊':'📍';
const statusPill = s => s.label
  ? `<span style="color:${s.color};font-weight:500;white-space:nowrap">${s.emoji?s.emoji+' ':''}${s.label}</span>`
  : '<span style="color:var(--tx3)">—</span>';

// Вычисленные разрезы ROI + активный сегмент (для переключателя без повторного счёта)
const roi = { seg:'camp', camps:[], byCity:[], bySite:[] };

export function renderDirect(raw){
  const dir    = raw.direct||{};
  const camps  = dir.campaigns||[];
  const totals = dir.totals||{clicks:0,cost:0,impressions:0};
  const yd     = raw.yandex||[];

  // byId кампаний строим на фронте из campaigns[].id
  const byId={};
  for(const c of camps) if(c.id!=null && c.id!=='') byId[String(c.id).trim()]=c;

  // CRM-заявки по кампаниям: валидный числовой utm_campaign → к кампании по id; иначе → мусор
  const crmByCamp={};                 // id → {leads,bought}
  const junkMap={};                   // тип мусора → {leads,bought}
  let junkLeads=0, junkBought=0;
  for(const r of yd){
    if(isValidCampId(r.campaign)){
      const id=String(r.campaign).trim();
      (crmByCamp[id]||(crmByCamp[id]={leads:0,bought:0}));
      crmByCamp[id].leads+=r.leads; crmByCamp[id].bought+=r.bought;
    } else {
      const t=junkType(r.campaign);
      (junkMap[t]||(junkMap[t]={leads:0,bought:0}));
      junkMap[t].leads+=r.leads; junkMap[t].bought+=r.bought;
      junkLeads+=r.leads; junkBought+=r.bought;
    }
  }

  // Разрез по кампаниям: расход из Директа + заявки/продажи из CRM (джойн по id)
  const campRows = camps.map(c=>{
    const id=String(c.id==null?'':c.id).trim();
    const crm=crmByCamp[id]||{leads:0,bought:0};
    const cost=c.cost||0;
    const cpl=crm.leads>0?Math.round(cost/crm.leads):null;
    const cpo=crm.bought>0?Math.round(cost/crm.bought):null;
    return {id, name:c.name, city:cityFromName(c.name), cost, clicks:c.clicks||0,
            leads:crm.leads, bought:crm.bought, cpl, cpo, status:roiStatus(cost,crm.bought,cpo)};
  }).sort((a,b)=>b.cost-a.cost);

  // «Расход в никуда»: кампании с расходом, но 0 сопоставленных CRM-заявок
  const wasted     = campRows.filter(r=>r.cost>0 && r.leads===0).sort((a,b)=>b.cost-a.cost);
  const wastedCost = wasted.reduce((s,r)=>s+r.cost,0);

  // Разрез по городам: свернуть кампании в город
  const cityAgg={};
  for(const r of campRows){
    (cityAgg[r.city]||(cityAgg[r.city]={city:r.city,cost:0,clicks:0,leads:0,bought:0}));
    const a=cityAgg[r.city]; a.cost+=r.cost; a.clicks+=r.clicks; a.leads+=r.leads; a.bought+=r.bought;
  }
  const cityRows=Object.values(cityAgg).map(a=>{
    const cpl=a.leads>0?Math.round(a.cost/a.leads):null;
    const cpo=a.bought>0?Math.round(a.cost/a.bought):null;
    return {...a, cpl, cpo, status:roiStatus(a.cost,a.bought,cpo)};
  }).sort((x,y)=>y.cost-x.cost);

  // Разрез по сайтам: заявки/продажи Директа берём из geoFlat (source='Яндекс Директ'),
  // расход разносим ПРОПОРЦИОНАЛЬНО заявкам (~оценка: кампания льёт на оба сайта).
  const siteAgg={};
  for(const g of (raw.geoFlat||[])){
    if(g.source!=='Яндекс Директ') continue;
    const k=g.site||'Не указано';
    (siteAgg[k]||(siteAgg[k]={site:k,leads:0,bought:0,leadIds:[],boughtIds:[]}));
    const a=siteAgg[k]; a.leads+=g.leads; a.bought+=g.bought;
    if(g.leadIds)   a.leadIds  =a.leadIds.concat(g.leadIds).slice(0,50);
    if(g.boughtIds) a.boughtIds=a.boughtIds.concat(g.boughtIds).slice(0,50);
  }
  const siteTotLeads=Object.values(siteAgg).reduce((s,a)=>s+a.leads,0);
  const siteRows=Object.values(siteAgg).map(a=>{
    const cost = siteTotLeads>0 ? Math.round(totals.cost * a.leads/siteTotLeads) : 0;  // ~оценка
    const cpl=a.leads>0?Math.round(cost/a.leads):null;
    const cpo=a.bought>0?Math.round(cost/a.bought):null;
    return {...a, cost, cpl, cpo, status:roiStatus(cost,a.bought,cpo)};
  }).sort((x,y)=>y.bought-x.bought || y.leads-x.leads);

  roi.seg='camp'; roi.camps=campRows; roi.byCity=cityRows; roi.bySite=siteRows;

  // ── Сводка сверху (по всему Директ-трафику из CRM) ──
  const crmTotL=yd.reduce((a,r)=>a+r.leads,0), crmTotB=yd.reduce((a,r)=>a+r.bought,0);
  const sCpl=crmTotL>0?Math.round(totals.cost/crmTotL):0;
  const sCpo=crmTotB>0?Math.round(totals.cost/crmTotB):0;
  const sumEl=document.getElementById('dir-summary');
  if(sumEl)sumEl.innerHTML=`
    <div class="mc"><div class="mlb">Расход ₽</div><div class="mv" style="color:var(--amber)">${rub(totals.cost)}</div></div>
    <div class="mc"><div class="mlb">Клики</div><div class="mv">${rub(totals.clicks)}</div></div>
    <div class="mc"><div class="mlb">Заявки (CRM)</div><div class="mv" style="color:var(--blue)">${crmTotL}</div></div>
    <div class="mc"><div class="mlb">Продажи (CRM)</div><div class="mv" style="color:var(--green)">${crmTotB}</div></div>
    <div class="mc"><div class="mlb">CPL ₽</div><div class="mv" style="color:${cplColor(sCpl||null)}">${sCpl>0?rub(sCpl):'—'}</div></div>
    <div class="mc"><div class="mlb">CPO ₽</div><div class="mv" style="color:${cpoColor(sCpo||null)}">${sCpo>0?rub(sCpo):'—'}</div></div>`;
  const totEl=document.getElementById('dir-total');
  if(totEl)totEl.textContent=`${camps.length} кампаний · ${rub(totals.cost)} ₽`;

  renderRoiTable();
  renderUnknown(junkMap, junkLeads, junkBought, wasted, wastedCost);
  renderKeywords(raw.directKeywords||[], yd);
}

// Переключатель разреза (вызывается из inline onclick, зарегистрирован в window через main.js)
export function switchRoiSeg(seg){ roi.seg=seg; renderRoiTable(); }

function renderRoiTable(){
  const el=document.getElementById('roi-table'); if(!el) return;
  document.querySelectorAll('#roi-stabs .stab').forEach(b=>b.classList.toggle('on', b.dataset.seg===roi.seg));
  el.innerHTML = roi.seg==='city' ? roiCityTable(roi.byCity)
               : roi.seg==='site' ? roiSiteTable(roi.bySite)
               : roiCampTable(roi.camps);
}

function roiCampTable(rows){
  if(!rows.length) return '<div class="nd">Нет данных Директа</div>';
  const body=rows.map(r=>`<tr>
    <td title="${r.name}" style="font-weight:500">${r.name}</td>
    <td style="color:var(--tx2);white-space:nowrap">${cityIcon(r.city)} ${r.city}</td>
    <td style="text-align:right;color:var(--amber)">${rub(r.cost)}</td>
    <td style="text-align:right;color:var(--tx2)">${rub(r.clicks)}</td>
    <td style="text-align:right;color:var(--blue)">${r.leads||'—'}</td>
    <td style="text-align:right;color:var(--green)">${r.bought||'—'}</td>
    <td style="text-align:right;color:${cplColor(r.cpl)}">${r.cpl!=null?rub(r.cpl):'—'}</td>
    <td style="text-align:right;color:${cpoColor(r.cpo)};font-weight:600">${r.cpo!=null?rub(r.cpo):'—'}</td>
    <td style="text-align:right">${statusPill(r.status)}</td>
  </tr>`).join('');
  return `<table class="tbl fixed"><thead><tr>
    <th style="width:22%">Кампания</th><th style="width:12%">Город</th>
    <th style="width:11%;text-align:right">Расход ₽</th><th style="width:9%;text-align:right">Клики</th>
    <th style="width:8%;text-align:right">Заявки</th><th style="width:8%;text-align:right">Продажи</th>
    <th style="width:8%;text-align:right">CPL ₽</th><th style="width:8%;text-align:right">CPO ₽</th>
    <th style="width:14%;text-align:right">Статус</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

function roiCityTable(rows){
  if(!rows.length) return '<div class="nd">Нет данных</div>';
  const body=rows.map(r=>`<tr>
    <td style="font-weight:500;white-space:nowrap">${cityIcon(r.city)} ${r.city}</td>
    <td style="text-align:right;color:var(--amber)">${rub(r.cost)}</td>
    <td style="text-align:right;color:var(--tx2)">${rub(r.clicks)}</td>
    <td style="text-align:right;color:var(--blue)">${r.leads||'—'}</td>
    <td style="text-align:right;color:var(--green)">${r.bought||'—'}</td>
    <td style="text-align:right;color:${cplColor(r.cpl)}">${r.cpl!=null?rub(r.cpl):'—'}</td>
    <td style="text-align:right;color:${cpoColor(r.cpo)};font-weight:600">${r.cpo!=null?rub(r.cpo):'—'}</td>
    <td style="text-align:right">${statusPill(r.status)}</td>
  </tr>`).join('');
  return `<table class="tbl fixed"><thead><tr>
    <th style="width:19%">Город</th>
    <th style="width:14%;text-align:right">Расход ₽</th><th style="width:11%;text-align:right">Клики</th>
    <th style="width:11%;text-align:right">Заявки</th><th style="width:11%;text-align:right">Продажи</th>
    <th style="width:9%;text-align:right">CPL ₽</th><th style="width:10%;text-align:right">CPO ₽</th>
    <th style="width:15%;text-align:right">Статус</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

function roiSiteTable(rows){
  if(!rows.length) return '<div class="nd">Нет заявок с источником «Яндекс Директ»</div>';
  const body=rows.map(r=>{
    const conv=r.leads>0?Math.round(r.bought/r.leads*100):0;
    return `<tr>
      <td style="font-weight:500">${r.site}</td>
      <td style="text-align:right;color:var(--amber)">~${rub(r.cost)}</td>
      <td style="text-align:right;color:var(--blue)">${drillNum(r.leads,r.leadIds,'var(--blue)')}</td>
      <td style="text-align:right;color:var(--green)">${drillNum(r.bought,r.boughtIds,'var(--green)')}</td>
      <td style="text-align:right;font-weight:600;color:${cc(conv)}">${conv}%</td>
      <td style="text-align:right;color:${cpoColor(r.cpo)};font-weight:600">${r.cpo!=null?'~'+rub(r.cpo):'—'}</td>
      <td style="text-align:right">${statusPill(r.status)}</td>
    </tr>`;
  }).join('');
  return `<table class="tbl fixed"><thead><tr>
    <th style="width:24%">Сайт</th><th style="width:16%;text-align:right">Расход ₽</th>
    <th style="width:12%;text-align:right">Заявки</th><th style="width:12%;text-align:right">Продажи</th>
    <th style="width:11%;text-align:right">Конв.</th><th style="width:11%;text-align:right">CPO ₽</th>
    <th style="width:14%;text-align:right">Статус</th>
  </tr></thead><tbody>${body}</tbody></table>
  <div style="font-size:10px;color:var(--tx3);margin-top:8px">~ Расход разнесён по сайтам пропорционально заявкам (оценка): одна кампания льёт на оба сайта, точного разделения расхода Директ не даёт. Заявки — по полю «Название сайта в Calltouch»; сделки без сайта в разрез не попадают.</div>`;
}

// Панель неатрибутированного трафика: (1) заявки с мусорным utm, (2) расход без заявок
function renderUnknown(junkMap, junkLeads, junkBought, wasted, wastedCost){
  const el=document.getElementById('roi-unknown'); if(!el) return;
  const order=['autotargeting','<не указано>','сломанный макрос','пусто','прочее'];
  const junkRows=order.filter(t=>junkMap[t]).map(t=>{
    const v=junkMap[t];
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
      <div style="flex:1;color:var(--tx2)">${t}</div>
      <div style="width:78px;text-align:right"><b style="color:var(--blue)">${v.leads}</b> заявк.</div>
      <div style="width:74px;text-align:right"><b style="color:var(--green)">${v.bought}</b> прод.</div>
    </div>`;
  }).join('') || '<div class="nd">Весь трафик атрибутирован ✓</div>';

  const wastedList = wasted.length
    ? wasted.slice(0,10).map(r=>`<div style="display:flex;gap:8px;padding:3px 0;font-size:12px">
        <div style="flex:1;color:var(--tx2)" title="${r.name}">${r.name}</div>
        <div style="color:var(--amber);white-space:nowrap">${rub(r.cost)} ₽</div>
      </div>`).join('')
    : '<div class="nd">Нет — у всех кампаний с расходом есть заявки ✓</div>';

  el.innerHTML=`<div class="g2" style="gap:16px">
    <div>
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">1. Заявки без валидного utm_campaign</div>
      <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Нельзя привязать к расходу. Всего <b style="color:var(--blue)">${junkLeads}</b> заявок, <b style="color:var(--green)">${junkBought}</b> продаж:</div>
      ${junkRows}
    </div>
    <div>
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">2. Расход в никуда 🔴</div>
      <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Кампании с расходом, но <b>0</b> сопоставленных CRM-заявок: <b style="color:var(--amber)">${rub(wastedCost)} ₽</b> (${wasted.length} шт.)</div>
      ${wastedList}
    </div>
  </div>`;
}

// Ключевые слова — два раздельных среза (см. комментарий вверху файла)
function renderKeywords(kws, yd){
  const kd=document.getElementById('kw-direct');
  if(kd){
    const rows=[...kws].sort((a,b)=>b.cost-a.cost).slice(0,50);
    kd.innerHTML = rows.length ? rows.map(r=>`<tr>
      <td title="${r.keyword}">${r.keyword}</td>
      <td title="${r.campaign}" style="font-size:11px;color:var(--tx3)">${r.campaign}</td>
      <td style="text-align:right;font-weight:500">${r.clicks>0?rub(r.clicks):'—'}</td>
      <td style="text-align:right;color:var(--amber)">${r.cost>0?rub(r.cost)+' ₽':'—'}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="nd" style="padding:8px">Нет данных Директа</td></tr>';
  }
  const kc=document.getElementById('kw-crm');
  if(kc){
    const map={};
    for(const r of yd){const t=r.term||'—';(map[t]||(map[t]={leads:0,bought:0}));map[t].leads+=r.leads;map[t].bought+=r.bought;}
    const rows=Object.entries(map).map(([term,v])=>({term,...v})).sort((a,b)=>b.leads-a.leads).slice(0,50);
    kc.innerHTML = rows.length ? rows.map(r=>{
      const conv=r.leads>0?Math.round(r.bought/r.leads*100):0;
      return `<tr>
        <td title="${r.term}">${r.term}</td>
        <td style="text-align:right;color:var(--blue);font-weight:500">${r.leads}</td>
        <td style="text-align:right;color:var(--green)">${r.bought||'—'}</td>
        <td style="text-align:right;font-weight:600;color:${cc(conv)}">${conv}%</td>
      </tr>`;
    }).join('') : '<tr><td colspan="4" class="nd" style="padding:8px">Нет данных CRM</td></tr>';
  }
}
