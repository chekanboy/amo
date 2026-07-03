// Вкладка «Директ»: сводка, кампании, ключевые слова, блок Город → Канал → Результат
// (склейка расходов Яндекс.Директа с лидами/продажами из CRM)

// ── ГОРОД → КАНАЛ ──
export function renderCityChannels(cityChannels, directById) {
  const el = document.getElementById('city-channel-wrap');
  if (!el) return;
  if (!cityChannels || !cityChannels.length) {
    el.innerHTML = '<div class="nd">Нет данных</div>';
    return;
  }

  // Строим карту кампаний по ID из Директа
  const campMap = {};
  if (directById) {
    for (const [id, camp] of Object.entries(directById)) {
      campMap[id] = camp;
    }
  }

  const CHAN_COLORS = {
    'Яндекс Директ': '#fc3f1d',
    'Яндекс Карты':  '#fbbf24',
    'Яндекс SEO':    '#f97316',
    'Google SEO':    '#60a5fa',
    'Google Карты':  '#3b82f6',
    'VK':            '#a78bfa',
    'Instagram':     '#f472b6',
    'Telegram':      '#2dd4bf',
    '2GIS':          '#4ade80',
    'Прямой заход':  '#8888a0',
    'Рекомендации':  '#34d399',
    'Постоянный клиент': '#a3e635',
    'С улицы':       '#fb923c',
  };

  el.innerHTML = cityChannels.map(city => {
    const totalLeads  = city.channels.reduce((s,c)=>s+c.leads, 0);
    const totalBought = city.channels.reduce((s,c)=>s+c.bought, 0);

    const rows = city.channels.map(ch => {
      // Пытаемся найти расходы: utm_campaign может быть ID или названием
      const directData = campMap[ch.camp] || null;
      const cost    = directData ? directData.cost : null;
      const clicks  = directData ? directData.clicks : null;
      const cpl     = cost && ch.leads  > 0 ? Math.round(cost / ch.leads)  : null;
      const cpo     = cost && ch.bought > 0 ? Math.round(cost / ch.bought) : null;
      const conv    = ch.leads > 0 ? Math.round(ch.bought / ch.leads * 100) : 0;
      const color   = CHAN_COLORS[ch.src] || '#8888a0';

      // Название кампании
      const campName = directData ? directData.name : (ch.camp || '');
      const chanLabel = ch.src + (campName ? ' · ' + campName.slice(0,30) : '');

      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <span style="font-size:12px" title="${chanLabel}">${chanLabel.slice(0,45)}${chanLabel.length>45?'…':''}</span>
          </div>
        </td>
        <td style="text-align:right;font-weight:500">${ch.leads}</td>
        <td style="text-align:right;color:var(--green);font-weight:500">${ch.bought}</td>
        <td style="text-align:right;color:${conv>=30?'var(--green)':conv>=15?'var(--amber)':'var(--red)'};font-weight:500">${conv}%</td>
        <td style="text-align:right;color:var(--amber)">${cost !== null ? cost.toLocaleString('ru') + ' ₽' : '—'}</td>
        <td style="text-align:right;color:var(--blue)">${clicks !== null ? clicks.toLocaleString('ru') : '—'}</td>
        <td style="text-align:right;color:${cpl>3000?'var(--red)':cpl>1500?'var(--amber)':cpl?'var(--green)':'var(--tx3)'}">${cpl ? cpl.toLocaleString('ru') + ' ₽' : '—'}</td>
        <td style="text-align:right;color:${cpo>8000?'var(--red)':cpo>4000?'var(--amber)':cpo?'var(--green)':'var(--tx3)'}">${cpo ? cpo.toLocaleString('ru') + ' ₽' : '—'}</td>
      </tr>`;
    }).join('');

    const totConv = totalLeads > 0 ? Math.round(totalBought/totalLeads*100) : 0;
    const totalCost = city.channels.reduce((s,ch) => {
      const d = campMap[ch.camp];
      return s + (d ? d.cost : 0);
    }, 0);

    return `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;background:var(--bg3);border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <div style="font-size:14px">${city.city==='Москва'?'🏙️':city.city==='Санкт-Петербург'?'🌊':'📍'}</div>
        <div style="font-size:13px;font-weight:600;flex:1">${city.city}</div>
        <div style="display:flex;gap:16px;font-size:12px">
          <span>${totalLeads} лидов</span>
          <span style="color:var(--green)">${totalBought} продаж</span>
          <span style="color:${totConv>=30?'var(--green)':totConv>=15?'var(--amber)':'var(--red)'};font-weight:500">${totConv}% конв.</span>
          ${totalCost > 0 ? `<span style="color:var(--amber)">${totalCost.toLocaleString('ru')} ₽</span>` : ''}
        </div>
        <span style="font-size:11px;color:var(--tx3)">›</span>
      </div>
      <div>
        <table class="tbl fixed" style="font-size:12px">
          <thead><tr>
            <th style="width:32%">Канал / Кампания</th>
            <th style="width:8%;text-align:right">Лидов</th>
            <th style="width:9%;text-align:right">Продаж</th>
            <th style="width:8%;text-align:right">Конв.</th>
            <th style="width:12%;text-align:right">Расход ₽</th>
            <th style="width:9%;text-align:right">Клики</th>
            <th style="width:11%;text-align:right">CPL ₽</th>
            <th style="width:11%;text-align:right">CPO ₽</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

// ── ДИРЕКТ ──
export function renderDirect(dir, kws, crmYd){
  const camps=dir.campaigns||[], totals=dir.totals||{clicks:0,cost:0,impressions:0};
  const crmTotL=crmYd.reduce((a,r)=>a+r.leads,0), crmTotB=crmYd.reduce((a,r)=>a+r.bought,0);
  const cpl=crmTotL>0?Math.round(totals.cost/crmTotL):0;
  const cpo=crmTotB>0?Math.round(totals.cost/crmTotB):0;
  const sumEl=document.getElementById('dir-summary');
  if(sumEl)sumEl.innerHTML=`
    <div class="mc"><div class="mlb">Расход ₽</div><div class="mv" style="color:var(--amber)">${totals.cost.toLocaleString('ru')}</div></div>
    <div class="mc"><div class="mlb">Клики</div><div class="mv">${totals.clicks.toLocaleString('ru')}</div></div>
    <div class="mc"><div class="mlb">Показы</div><div class="mv" style="color:var(--tx2)">${totals.impressions.toLocaleString('ru')}</div></div>
    <div class="mc"><div class="mlb">Заявки (CRM)</div><div class="mv" style="color:var(--blue)">${crmTotL}</div></div>
    <div class="mc"><div class="mlb">CPL ₽</div><div class="mv" style="color:${cpl>3000?'var(--red)':cpl>1500?'var(--amber)':'var(--green)'}">${cpl>0?cpl.toLocaleString('ru'):'—'}</div></div>
    <div class="mc"><div class="mlb">CPO ₽</div><div class="mv" style="color:${cpo>8000?'var(--red)':cpo>4000?'var(--amber)':'var(--green)'}">${cpo>0?cpo.toLocaleString('ru'):'—'}</div></div>
  `;
  const totEl=document.getElementById('dir-total');
  if(totEl)totEl.textContent=`${totals.clicks.toLocaleString('ru')} кликов · ${totals.cost.toLocaleString('ru')} ₽`;

  const crmCmap={};
  for(const r of crmYd){if(!crmCmap[r.campaign])crmCmap[r.campaign]={leads:0,bought:0};crmCmap[r.campaign].leads+=r.leads;crmCmap[r.campaign].bought+=r.bought;}

  const cEl=document.getElementById('dir-camps');
  if(cEl){
    if(!camps.length)cEl.innerHTML='<tr><td colspan="9" style="color:var(--tx3);padding:10px">Нет данных Директа</td></tr>';
    else cEl.innerHTML=camps.map(r=>{const crm=crmCmap[r.name]||{leads:0,bought:0};const cpl=crm.leads>0?Math.round(r.cost/crm.leads):0;return`<tr><td title="${r.name}">${r.name}</td><td style="font-size:10px;color:var(--tx3)">${r.type}</td><td style="text-align:right;font-weight:500">${r.clicks.toLocaleString('ru')}</td><td style="text-align:right;color:var(--tx2)">${r.impressions.toLocaleString('ru')}</td><td style="text-align:right;color:var(--teal)">${r.ctr}%</td><td style="text-align:right;color:var(--amber);font-weight:500">${r.cost.toLocaleString('ru')}</td><td style="text-align:right;color:var(--tx2)">${r.avgCpc}</td><td style="text-align:right;color:var(--blue)">${crm.leads||'—'}</td><td style="text-align:right;color:${cpl>3000?'var(--red)':cpl>1500?'var(--amber)':'var(--green)'};font-weight:500">${cpl>0?cpl.toLocaleString('ru'):'—'}</td></tr>`;}).join('');
  }

  const crmKmap={};
  for(const r of crmYd){if(!crmKmap[r.term])crmKmap[r.term]={leads:0,bought:0};crmKmap[r.term].leads+=r.leads;crmKmap[r.term].bought+=r.bought;}
  const merged=[...kws];
  for(const [kw,v] of Object.entries(crmKmap)) if(!merged.find(r=>r.keyword===kw)) merged.push({keyword:kw,campaign:'—',clicks:0,cost:0,ctr:0,avgCpc:0});

  const kEl=document.getElementById('dir-kws');
  if(kEl){
    if(!merged.length)kEl.innerHTML='<tr><td colspan="9" style="color:var(--tx3);padding:10px">Нет данных</td></tr>';
    else kEl.innerHTML=merged.slice(0,60).map(r=>{
      const crm=crmKmap[r.keyword]||{leads:0,bought:0};
      const conv=crm.leads>0?Math.round(crm.bought/crm.leads*100):null;
      const badge=conv===null?'<span class="badge bgr">—</span>':conv>=40?`<span class="badge bg">${conv}%</span>`:conv>=20?`<span class="badge ba">${conv}%</span>`:`<span class="badge br2">${conv}%</span>`;
      return`<tr><td title="${r.keyword}">${r.keyword}</td><td title="${r.campaign}" style="font-size:11px;color:var(--tx3)">${r.campaign}</td><td style="text-align:right;font-weight:500">${r.clicks>0?r.clicks.toLocaleString('ru'):'—'}</td><td style="text-align:right;color:var(--amber)">${r.cost>0?r.cost.toLocaleString('ru')+' ₽':'—'}</td><td style="text-align:right">${r.ctr>0?r.ctr+'%':'—'}</td><td style="text-align:right;color:var(--tx2)">${r.avgCpc>0?r.avgCpc:'—'}</td><td style="text-align:right;color:var(--blue);font-weight:500">${crm.leads||'—'}</td><td style="text-align:right;color:var(--green)">${crm.bought||'—'}</td><td style="text-align:right">${badge}</td></tr>`;
    }).join('');
  }
}
