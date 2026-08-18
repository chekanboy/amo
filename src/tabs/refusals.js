// Вкладка «Отказы»: гибридная классификация причин (см. classifyRefusal в .gs — ШАГ 1 поле
// «Причина», ШАГ 2 текст «Комментарий отказа»), счётчики реальные/мусорные, донат по реальным
// причинам, разрезы Общая/Города/Сайты/Источники, drill-down с текстом комментария.
//
// Города/Сайты/Источники — дерево по образцу geo.js (Город→Сайт→Источник): группа раскрывается
// кликом, внутри — ВСЕ причины отказов этой группы (не только топ-1), каждая кликабельна отдельно.
// Для этого используется refusalFlat (город|сайт|источник|причина, приходит из .gs) — иначе
// drill-down показывал бы сделки причины СО ВСЕХ городов сразу, а не только этой группы.
import { drillRefusal } from '../components/drilldown.js';
import { AC } from '../utils/constants.js';

let dChart = null;
const rf = { seg:'all', reasons:[], flat:[] };

export function renderRefusals(raw){
  const reasons = raw.refusalReasons || [];
  rf.reasons = reasons;
  rf.flat = raw.refusalFlat || [];
  rf.seg = 'all';

  const real = reasons.filter(r=>!r.isJunk);
  const junk = reasons.filter(r=>r.isJunk);
  const realCount = real.reduce((s,r)=>s+r.count,0);
  const junkCount = junk.reduce((s,r)=>s+r.count,0);
  const total = realCount + junkCount;

  setText('rf-real', realCount.toLocaleString('ru'));
  setText('rf-real-s', total>0 ? Math.round(realCount/total*100)+'% от всех отказов' : '');
  setText('rf-junk', junkCount.toLocaleString('ru'));
  setText('rf-junk-s', total>0 ? Math.round(junkCount/total*100)+'% от всех отказов' : '');
  setText('rf-total', total.toLocaleString('ru'));

  renderDonut(real);
  renderTable();
}

function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent=v; }

function renderDonut(real){
  const ctx = document.getElementById('rf-donut'); if(!ctx) return;
  if(dChart){ dChart.destroy(); dChart=null; }
  const leg = document.getElementById('rf-donut-leg');
  if(!real.length){
    if(leg) leg.innerHTML = '<div class="nd">Нет реальных отказов за период</div>';
    return;
  }
  const rows = [...real].sort((a,b)=>b.count-a.count);
  const labels = rows.map(r=>r.reason);
  const data = rows.map(r=>r.count);
  const total = data.reduce((a,b)=>a+b,0);
  const ex = Chart.getChart(ctx); if(ex) ex.destroy();
  dChart = new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:AC,borderWidth:2,
    borderColor:document.documentElement.getAttribute('data-theme')==='dark'?'#16161b':'#ffffff'}]},
    options:{responsive:false,cutout:'68%',plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed} (${total>0?Math.round(c.parsed/total*100):0}%)`}}}}});
  if(leg) leg.innerHTML = rows.map((r,i)=>`<div class="dl-row"><div class="dl-dot" style="background:${AC[i%AC.length]}"></div><div class="dl-name" title="${r.reason}">${r.reason}</div><div class="dl-pct">${total>0?Math.round(data[i]/total*100):0}%</div><div class="dl-cnt">${data[i]}</div></div>`).join('');
}

// Переключатель разреза (inline onclick, зарегистрирован в window через main.js)
export function switchRefusalSeg(seg){ rf.seg = seg; renderTable(); }

function renderTable(){
  const el = document.getElementById('rf-table'); if(!el) return;
  document.querySelectorAll('#rf-stabs .stab').forEach(b=>b.classList.toggle('on', b.dataset.seg===rf.seg));
  el.innerHTML = rf.seg==='city'   ? groupTree(rf.flat,'city','Город')
               : rf.seg==='site'   ? groupTree(rf.flat,'site','Сайт')
               : rf.seg==='source' ? groupTree(rf.flat,'source','Источник')
               : reasonTable(rf.reasons);
}

// Общая: по категориям причин, с drill-down (items несёт текст комментария)
function reasonTable(reasons){
  if(!reasons.length) return '<div class="nd">Нет отказов за период</div>';
  const rows = [...reasons].sort((a,b)=>b.count-a.count);
  const total = rows.reduce((s,r)=>s+r.count,0);
  const body = rows.map(r=>{
    const pct = total>0 ? Math.round(r.count/total*100) : 0;
    const badge = r.isJunk ? '<span style="font-size:9px;background:var(--tx3);color:var(--bg);padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:600">МУСОР</span>' : '';
    const cities = topEntries(r.byCity, 2);
    const sites = topEntries(r.bySite, 2);
    return `<tr>
      <td style="font-weight:500">${r.reason}${badge}</td>
      <td style="text-align:right;font-weight:600;color:${r.isJunk?'var(--tx3)':'var(--red)'}">${drillRefusal(r.count, r.items, r.isJunk?'var(--tx3)':'var(--red)', r.reason)}</td>
      <td style="text-align:right">${pct}%</td>
      <td style="color:var(--tx2);font-size:12px">${cities}</td>
      <td style="color:var(--tx2);font-size:12px">${sites}</td>
    </tr>`;
  }).join('');
  return `<table class="tbl fixed"><thead><tr>
    <th style="width:32%">Причина</th>
    <th style="width:13%;text-align:right">Всего</th>
    <th style="width:11%;text-align:right">Доля</th>
    <th style="width:22%">Города</th>
    <th style="width:22%">Сайты</th>
  </tr></thead><tbody>${body}</tbody></table>
  <div style="font-size:10px;color:var(--tx3);margin-top:8px">💡 Цифра «Всего» кликабельна — попап со сделками и текстом комментария</div>`;
}

// Города/Сайты/Источники: дерево — группа (город/сайт/источник) раскрывается кликом, внутри
// ВСЕ причины этой группы с drill-down. dimKey — поле refusalFlat ('city'/'site'/'source').
function groupTree(flat, dimKey, label){
  if(!flat.length) return '<div class="nd">Нет данных</div>';
  const groups = {};
  for(const r of flat){
    const g = r[dimKey] || 'Не указано';
    if(!groups[g]) groups[g] = {name:g, total:0, real:0, junk:0, reasons:{}};
    const grp = groups[g];
    grp.total += r.count;
    if(r.isJunk) grp.junk += r.count; else grp.real += r.count;
    if(!grp.reasons[r.reason]) grp.reasons[r.reason] = {reason:r.reason, isJunk:r.isJunk, count:0, items:[]};
    const rr = grp.reasons[r.reason];
    rr.count += r.count;
    rr.items = rr.items.concat(r.items||[]).slice(0,50);
  }
  const rows = Object.values(groups).sort((a,b)=>b.total-a.total);

  const html = rows.map(grp=>{
    const reasons = Object.values(grp.reasons).sort((a,b)=>b.count-a.count);
    const maxCount = reasons[0]?.count || 1;
    const reasonRows = reasons.map(rr=>{
      const badge = rr.isJunk ? '<span style="font-size:9px;background:var(--tx3);color:var(--bg);padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:600">МУСОР</span>' : '';
      const w = Math.round(rr.count/maxCount*100);
      const color = rr.isJunk ? 'var(--tx3)' : 'var(--red)';
      return `<div class="src-row">
        <div style="flex:1;font-size:12px;color:var(--tx2)">${rr.reason}${badge}</div>
        <div style="width:70px;background:var(--bg3);border-radius:3px;height:3px;flex-shrink:0"><div style="width:${w}%;height:3px;border-radius:3px;background:${color}"></div></div>
        <div style="font-size:12px;font-weight:600;width:34px;text-align:right;color:${color}">${drillRefusal(rr.count, rr.items, color, rr.reason)}</div>
      </div>`;
    }).join('');
    return `<div class="city-block">
      <div class="city-hdr" onclick="toggleCity(this)">
        <div class="city-name">${grp.name}</div>
        <div class="city-stats">
          <div class="cst"><div class="cst-v">${grp.total}</div><div class="cst-l">Всего</div></div>
          <div class="cst"><div class="cst-v" style="color:var(--red)">${grp.real}</div><div class="cst-l">Реальных</div></div>
          <div class="cst"><div class="cst-v" style="color:var(--tx3)">${grp.junk}</div><div class="cst-l">Мусорных</div></div>
        </div>
        <span class="chv">›</span>
      </div>
      <div class="city-body">${reasonRows}</div>
    </div>`;
  }).join('');

  return `<div style="font-size:10px;color:var(--tx3);margin-bottom:10px">Клик по ${label.toLowerCase()}у — раскрыть все причины · цифра кликабельна — сделки в AmoCRM</div>${html}`;
}

function topEntries(obj, n){
  const entries = Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return entries.length ? entries.map(([k,v])=>`${k} (${v})`).join(', ') : '—';
}
