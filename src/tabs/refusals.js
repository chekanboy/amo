// Вкладка «Отказы»: гибридная классификация причин (см. classifyRefusal в .gs — ШАГ 1 поле
// «Причина», ШАГ 2 текст «Комментарий отказа»), счётчики реальные/мусорные, донат по реальным
// причинам, таблица с разрезами Общая/Города/Сайты, drill-down с текстом комментария.
import { drillRefusal } from '../components/drilldown.js';
import { AC } from '../utils/constants.js';

let dChart = null;
const rf = { seg:'all', reasons:[] };

export function renderRefusals(raw){
  const reasons = raw.refusalReasons || [];
  rf.reasons = reasons;
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
  el.innerHTML = rf.seg==='city' ? aggTable(rf.reasons,'byCity','Город')
               : rf.seg==='site' ? aggTable(rf.reasons,'bySite','Сайт')
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

// Города/Сайты: агрегат по всем причинам сразу (без drill-down — items не разбиты по городу/сайту)
function aggTable(reasons, key, label){
  const agg = {};
  for(const r of reasons){
    for(const [k,v] of Object.entries(r[key]||{})){
      if(!agg[k]) agg[k]={name:k,total:0,real:0,junk:0,top:{}};
      agg[k].total += v;
      if(r.isJunk) agg[k].junk += v; else agg[k].real += v;
      agg[k].top[r.reason] = (agg[k].top[r.reason]||0) + v;
    }
  }
  const rows = Object.values(agg).sort((a,b)=>b.total-a.total);
  if(!rows.length) return '<div class="nd">Нет данных</div>';
  const body = rows.map(r=>{
    const topReason = Object.entries(r.top).sort((a,b)=>b[1]-a[1])[0];
    return `<tr>
      <td style="font-weight:500">${r.name}</td>
      <td style="text-align:right;font-weight:600">${r.total}</td>
      <td style="text-align:right;color:var(--red)">${r.real}</td>
      <td style="text-align:right;color:var(--tx3)">${r.junk}</td>
      <td style="color:var(--tx2);font-size:12px">${topReason?topReason[0]+' ('+topReason[1]+')':'—'}</td>
    </tr>`;
  }).join('');
  return `<table class="tbl fixed"><thead><tr>
    <th style="width:26%">${label}</th>
    <th style="width:14%;text-align:right">Всего</th>
    <th style="width:14%;text-align:right">Реальные</th>
    <th style="width:14%;text-align:right">Мусорные</th>
    <th style="width:32%">Топ причина</th>
  </tr></thead><tbody>${body}</tbody></table>
  <div style="font-size:10px;color:var(--tx3);margin-top:8px">Разрез агрегирует счётчики по всем причинам сразу — drill-down по сделкам доступен в разрезе «Общая»</div>`;
}

function topEntries(obj, n){
  const entries = Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return entries.length ? entries.map(([k,v])=>`${k} (${v})`).join(', ') : '—';
}
