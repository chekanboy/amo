// ВОРОНКИ: накопительная воронка CRM (с потерями и «узким местом»),
// воронки по сайтам, блок «где теряются лиды» и причины отказов
import { FC } from '../utils/constants.js';

// Причины отказов (кликабельные → сделки в AmoCRM через глобальный showLeadsPopup)
export function renderRefusalReasons(reasons) {
  const el = document.getElementById('refusal-reasons');
  if (!el) return;
  if (!reasons.length) { el.innerHTML='<div class="nd">Нет отказов за период</div>'; return; }
  const max = reasons[0].count;
  el.innerHTML = reasons.slice(0,8).map((r,i) => {
    const w = Math.round(r.count/max*100);
    const colors = ['#f87171','#f97316','#fbbf24','#a78bfa','#60a5fa','#2dd4bf','#4ade80','#f472b6'];
    const hasIds = r.ids && r.ids.length;
    const idsAttr = hasIds ? r.ids.join(',') : '';
    const clickAttr = hasIds ? `onclick="event.stopPropagation();showLeadsPopup('${idsAttr}'.split(',').map(Number),this,'${r.reason}')"` : '';
    const labelStyle = hasIds ? 'color:var(--tx2);border-bottom:1px dashed var(--tx3);cursor:pointer' : 'color:var(--tx2)';
    return `<div class="fr" style="margin-bottom:5px">
      <div class="fl" title="${r.reason}" style="width:140px"><span ${clickAttr} style="${labelStyle}">${r.reason}</span></div>
      <div class="fb"><div class="fbi" style="width:${Math.max(8,w)}%;background:${colors[i%colors.length]}">
        <span>${r.count}</span>
      </div></div>
      <div class="fc">${r.count}</div>
    </div>`;
  }).join('');
}

// Воронка по конкретному сайту (таблица этапов + метрики конверсии)
export function renderSiteFunnel(f, tbodyId, metricsId, accentColor) {
  const tbody = document.getElementById(tbodyId);
  const mEl   = document.getElementById(metricsId);
  if (!tbody || !mEl) return;

  // Нет сделок по сайту за период (или бэкенд не прислал воронку) → сообщение вместо нулей
  if (!f || !f.total) {
    tbody.innerHTML = '<tr><td colspan="5" class="nd" style="text-align:center;padding:16px 0">Нет данных за период</td></tr>';
    mEl.innerHTML = '';
    return;
  }

  const stages = [
    {name:'Заявка',          count:f.total,   fromPrev:null,    fromFirst:100},
    {name:'Пригласили',      count:f.invited, fromPrev:f.conv1, fromFirst:f.conv1},
    {name:'Посетил магазин', count:f.visited, fromPrev:f.conv2, fromFirst:f.total>0?Math.round(f.visited/f.total*100):0},
    {name:'Купили',          count:f.bought,  fromPrev:f.conv3, fromFirst:f.conv4}
  ];
  const colors=['#a78bfa','#2dd4bf','#fbbf24','#4ade80'];

  tbody.innerHTML=stages.map((s,i)=>{
    const barW=f.total>0?Math.round(s.count/f.total*100):0;
    const prevStr=s.fromPrev!==null?`<span style="color:${s.fromPrev>=50?'var(--green)':s.fromPrev>=25?'var(--amber)':'var(--red)'};font-weight:600">${s.fromPrev}%</span>`:'<span style="color:var(--tx3)">—</span>';
    const firstStr=`<span style="color:${s.fromFirst>=50?'var(--green)':s.fromFirst>=25?'var(--amber)':'var(--red)'};font-weight:600">${s.fromFirst}%</span>`;
    return`<tr>
      <td style="font-weight:500">${s.name}</td>
      <td style="text-align:right;font-weight:700;font-size:14px">${s.count}</td>
      <td style="text-align:center">${prevStr}</td>
      <td style="text-align:center">${firstStr}</td>
      <td><div style="background:var(--bg3);border-radius:4px;height:18px;overflow:hidden"><div style="width:${barW}%;height:100%;background:${colors[i]};border-radius:4px;display:flex;align-items:center;padding-left:6px"><span style="font-size:10px;color:#fff;white-space:nowrap">${s.count}</span></div></div></td>
    </tr>`;
  }).join('');

  mEl.innerHTML=`
    <div class="mc" style="text-align:center">
      <div class="mlb">Заявка → Запись</div>
      <div class="mv" style="color:${f.conv1>=50?'var(--green)':f.conv1>=25?'var(--amber)':'var(--red)'}">${f.conv1}%</div>
      <div class="ms">${f.total} → ${f.invited}</div>
    </div>
    <div class="mc" style="text-align:center">
      <div class="mlb">Запись → Визит</div>
      <div class="mv" style="color:${f.conv2>=50?'var(--green)':f.conv2>=25?'var(--amber)':'var(--red)'}">${f.conv2}%</div>
      <div class="ms">${f.invited} → ${f.visited}</div>
    </div>
    <div class="mc" style="text-align:center">
      <div class="mlb">Визит → Покупка</div>
      <div class="mv" style="color:${f.conv3>=50?'var(--green)':f.conv3>=25?'var(--amber)':'var(--red)'}">${f.conv3}%</div>
      <div class="ms">${f.visited} → ${f.bought}</div>
    </div>
    <div class="mc" style="text-align:center;border:1px solid ${accentColor}">
      <div class="mlb">Итого: Заявка → Покупка</div>
      <div class="mv" style="color:${accentColor}">${f.conv4}%</div>
      <div class="ms">${f.total} → ${f.bought}</div>
    </div>
  `;
}

export function renderFaamoFunnel(f){ renderSiteFunnel(f,'faamo-funnel-tbody','faamo-metrics','#2dd4bf'); }

// Накопительная воронка CRM с потерями между этапами и «узким местом»
export function renderFunnel(f){
  const el=document.getElementById('funnel'); if(!f.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}
  const max=f[0].count||1;

  // Считаем потери между этапами, находим худший переход
  const losses=[];
  for(let i=1;i<f.length;i++){
    const prev=f[i-1].count, cur=f[i].count;
    const lost=prev-cur;
    const lostPct=prev>0?Math.round(lost/prev*100):0;
    losses.push({lost,lostPct,fromName:f[i-1].name,toName:f[i].name});
  }
  const maxLossPct=Math.max(0,...losses.map(l=>l.lostPct));

  let html='';
  f.forEach((s,i)=>{
    const w=Math.max(4,Math.round(s.count/max*100));
    const pctOfTop=Math.round(s.count/max*100);
    // Строка этапа
    html+=`<div class="fr"><div class="fl" title="${s.name}">${s.name}</div><div class="fb"><div class="fbi" style="width:${w}%;background:${FC[i%FC.length]}"><span>${s.count}</span></div></div><div class="fc">${pctOfTop}%</div></div>`;
    // Строка-стрелка потери (между этапами)
    if(i<losses.length){
      const L=losses[i];
      if(L.lost>0){
        const isWorst = L.lostPct===maxLossPct && maxLossPct>0;
        const lossColor = isWorst ? 'var(--red)' : (L.lostPct>40?'#f97316':L.lostPct>20?'var(--amber)':'var(--tx3)');
        const bg = isWorst ? 'background:#f8717112;border-radius:6px;' : '';
        const worstTag = isWorst ? `<span style="font-size:9px;background:var(--red);color:#fff;padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:600">УЗКОЕ МЕСТО</span>` : '';
        html+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 8px;margin:1px 0;${bg}">
          <div class="floss">↓ потеря</div>
          <div style="flex:1;font-size:11px;color:${lossColor};font-weight:500">−${L.lost} чел. (−${L.lostPct}%)${worstTag}</div>
        </div>`;
      } else {
        // Нет потери — всё прошли дальше
        html+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 8px;margin:1px 0">
          <div class="floss">↓</div>
          <div style="flex:1;font-size:11px;color:var(--green)">без потерь</div>
        </div>`;
      }
    }
  });
  el.innerHTML=html;
}

// Блок «Где теряются лиды» — топ переходов с потерями
export function renderLost(f){
  const el=document.getElementById('lost');if(!f.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}
  const rows=[];for(let i=1;i<f.length;i++){const l=f[i-1].count-f[i].count;if(l>0)rows.push({from:f[i-1].name,to:f[i].name,lost:l,pct:Math.round(l/f[i-1].count*100)});}
  rows.sort((a,b)=>b.lost-a.lost);
  if(!rows.length){el.innerHTML='<div class="nd" style="color:var(--green)">Потерь нет</div>';return;}
  el.innerHTML=rows.slice(0,6).map(r=>`<div class="lr"><div style="font-size:12px;color:var(--tx2)">${r.from} → ${r.to}</div><div style="display:flex;gap:8px"><span style="color:var(--red);font-size:13px;font-weight:500">-${r.lost}</span><span style="color:var(--tx3);font-size:11px">${r.pct}%</span></div></div>`).join('');
}
