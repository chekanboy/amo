// Вкладка «Отказы»: гибридная классификация причин (см. classifyRefusal в .gs — ШАГ 1 поле
// «Причина», ШАГ 2 текст «Комментарий отказа»), счётчики реальные/мусорные, донат по реальным
// причинам, разрезы Общая / Город→Сайт→Источник, drill-down с текстом комментария.
//
// Второй разрез — дерево ТОЧНО по образцу geo.js (Город→Сайт→Источник, тот же паттерн, что
// в CRM/Города): можно точечно посмотреть «Москва / alfa-collection.ru / Яндекс Директ» —
// сколько там отказов и какие именно, а не смотреть три раздельных списка по каждому измерению.
// Строится из refusalFlat (город|сайт|источник|причина, приходит из .gs) — листовая строка
// (источник) объединяет все причины отказа внутри этой связки город×сайт×источник.
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
  el.innerHTML = rf.seg==='tree' ? cityTree(rf.flat) : reasonTable(rf.reasons);
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

// Дерево Город → Сайт → Источник (тот же паттерн, что и в CRM/Города — geo.js): можно точечно
// посмотреть «Москва / alfa-collection.ru / Яндекс Директ» — сколько там отказов и каких именно.
// Листовая строка (источник) кликабельна — drill-down: попап со сделками ИМЕННО этой связки
// город×сайт×источник (объединяет все причины отказа внутри неё) и текстом комментария.
function buildCityTree(flat){
  const cities = {};
  for(const r of flat){
    const city=r.city||'Не указано', site=r.site||'Не указано', source=r.source||'Не указано';
    if(!cities[city]) cities[city]={name:city,total:0,real:0,junk:0,sites:{}};
    const c=cities[city]; c.total+=r.count; if(r.isJunk)c.junk+=r.count; else c.real+=r.count;
    if(!c.sites[site]) c.sites[site]={name:site,total:0,real:0,junk:0,sources:{}};
    const s=c.sites[site]; s.total+=r.count; if(r.isJunk)s.junk+=r.count; else s.real+=r.count;
    if(!s.sources[source]) s.sources[source]={name:source,total:0,real:0,junk:0,items:[]};
    const src=s.sources[source]; src.total+=r.count; if(r.isJunk)src.junk+=r.count; else src.real+=r.count;
    src.items = src.items.concat(r.items||[]).slice(0,50);
  }
  return Object.values(cities).sort((a,b)=>b.total-a.total).map(c=>({
    ...c, sitesArr: Object.values(c.sites).sort((a,b)=>b.total-a.total).map(s=>({
      ...s, sourcesArr: Object.values(s.sources).sort((a,b)=>b.total-a.total)
    }))
  }));
}

function cityTree(flat){
  if(!flat.length) return '<div class="nd">Нет данных</div>';
  const tree = buildCityTree(flat);
  const cityIcon = c => c==='Москва'?'🏙️':c==='Санкт-Петербург'?'🌊':'📍';

  const html = tree.map(city=>{
    const sitesHtml = city.sitesArr.map(site=>{
      const maxSrc = site.sourcesArr[0]?.total || 1;
      const srcRows = site.sourcesArr.map(src=>{
        const w = Math.round(src.total/maxSrc*100);
        const label = `${city.name} · ${site.name} · ${src.name}`;
        return `<div class="src-row">
          <div style="flex:1;font-size:12px;color:var(--tx2)">${src.name}</div>
          <div style="width:55px;background:var(--bg3);border-radius:3px;height:3px;flex-shrink:0"><div style="width:${w}%;height:3px;border-radius:3px;background:var(--red)"></div></div>
          <div style="font-size:12px;font-weight:600;width:32px;text-align:right">${drillRefusal(src.total, src.items, 'var(--red)', label)}</div>
          <div style="font-size:11px;width:90px;text-align:right"><span style="color:var(--red)">${src.real}</span> реал / <span style="color:var(--tx3)">${src.junk}</span> мус</div>
        </div>`;
      }).join('');
      return `<div class="site-block"><div class="site-hdr" onclick="toggleEl(this)">
        <div class="site-name">${site.name}</div>
        <div style="display:flex;gap:10px;font-size:12px"><span>${site.total}</span><span style="color:var(--red)">${site.real}</span><span style="color:var(--tx3)">${site.junk}</span></div>
        <span style="font-size:11px;color:var(--tx3);transition:transform .2s">›</span>
      </div><div class="site-body">
        <div style="display:flex;padding:4px 6px;font-size:10px;color:var(--tx3);gap:8px"><div style="flex:1">Источник</div><div style="width:55px"></div><div style="width:32px;text-align:right">Всего</div><div style="width:90px;text-align:right">Реал/Мус</div></div>
        ${srcRows}
      </div></div>`;
    }).join('');
    return `<div class="city-block"><div class="city-hdr" onclick="toggleCity(this)">
      <div style="font-size:16px">${cityIcon(city.name)}</div>
      <div class="city-name">${city.name}</div>
      <div class="city-stats">
        <div class="cst"><div class="cst-v">${city.total}</div><div class="cst-l">Всего</div></div>
        <div class="cst"><div class="cst-v" style="color:var(--red)">${city.real}</div><div class="cst-l">Реальных</div></div>
        <div class="cst"><div class="cst-v" style="color:var(--tx3)">${city.junk}</div><div class="cst-l">Мусорных</div></div>
      </div>
      <span class="chv">›</span>
    </div><div class="city-body">${sitesHtml}</div></div>`;
  }).join('');

  return `<div style="font-size:10px;color:var(--tx3);margin-bottom:10px">Клик по городу/сайту — раскрыть · цифра у источника кликабельна — сделки в AmoCRM</div>${html}`;
}

function topEntries(obj, n){
  const entries = Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return entries.length ? entries.map(([k,v])=>`${k} (${v})`).join(', ') : '—';
}
