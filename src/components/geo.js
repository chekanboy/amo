// ГЕО-блок: дерево Город → Сайт → Источник + плоская таблица связок (сорт/поиск)
import { state } from '../core/state.js';
import { cc } from '../utils/format.js';
import { drillNum } from './drilldown.js';

export function renderGeo(geo){
  const el=document.getElementById('geo'); if(!geo.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}
  const SC=['#a78bfa','#2dd4bf','#fbbf24','#60a5fa','#4ade80','#f87171'];
  el.innerHTML=geo.map((city,ci)=>{
    const conv=city.leads>0?Math.round(city.bought/city.leads*100):0;
    const sites=city.sites.map((site,si)=>{
      const sc=site.leads>0?Math.round(site.bought/site.leads*100):0;
      const mx=site.sources[0]?.leads||1;
      const srcs=site.sources.map((src,ri)=>`<div class="src-row"><div style="width:6px;height:6px;border-radius:50%;background:${SC[ri%SC.length]};flex-shrink:0"></div><div style="flex:1;font-size:12px;color:var(--tx2)">${src.source}</div><div style="width:55px;background:var(--bg3);border-radius:3px;height:3px;flex-shrink:0"><div style="width:${Math.round(src.leads/mx*100)}%;height:3px;border-radius:3px;background:${SC[ri%SC.length]}"></div></div><div style="font-size:12px;font-weight:500;width:30px;text-align:right">${src.leads}</div><div style="font-size:12px;color:var(--green);width:28px;text-align:right">${src.bought}</div><div style="font-size:11px;width:30px;text-align:right;color:${cc(src.leads>0?Math.round(src.bought/src.leads*100):0)}">${src.leads>0?Math.round(src.bought/src.leads*100):0}%</div></div>`).join('');
      return`<div class="site-block"><div class="site-hdr" onclick="toggleEl(this)"><div style="width:8px;height:8px;border-radius:2px;background:${SC[si%SC.length]};flex-shrink:0"></div><div class="site-name">${site.site}</div><div style="display:flex;gap:10px;font-size:12px"><span>${site.leads}</span><span style="color:var(--green)">${site.bought}</span><span style="color:${cc(sc)};font-weight:500">${sc}%</span></div><span style="font-size:11px;color:var(--tx3);transition:transform .2s">›</span></div><div class="site-body"><div style="display:flex;padding:4px 6px;font-size:10px;color:var(--tx3);gap:8px"><div style="flex:1">Источник</div><div style="width:55px"></div><div style="width:30px;text-align:right">Лидов</div><div style="width:28px;text-align:right">Куп.</div><div style="width:30px;text-align:right">Конв.</div></div>${srcs}</div></div>`;
    }).join('');
    return`<div class="city-block"><div class="city-hdr" onclick="toggleCity(this)"><div style="font-size:16px">${city.city==='Москва'?'🏙️':city.city==='Санкт-Петербург'?'🌊':'📍'}</div><div class="city-name">${city.city}</div><div class="city-stats"><div class="cst"><div class="cst-v">${city.leads}</div><div class="cst-l">Лидов</div></div><div class="cst"><div class="cst-v" style="color:var(--green)">${city.bought}</div><div class="cst-l">Купили</div></div><div class="cst"><div class="cst-v" style="color:${cc(conv)}">${conv}%</div><div class="cst-l">Конв.</div></div></div><span class="chv">›</span></div><div class="city-body">${sites}</div></div>`;
  }).join('');
}

export function toggleCity(h){const b=h.nextElementSibling,c=h.querySelector('.chv'),o=b.classList.toggle('open');if(c)c.classList.toggle('open',o);}
export function toggleEl(h){const b=h.nextElementSibling,c=h.querySelector('span:last-child'),o=b.classList.toggle('open');if(c)c.style.transform=o?'rotate(90deg)':'';}

// Переключение Дерево/Таблица для гео
export function switchGeoView(view){
  const tree=document.getElementById('geo');
  const flat=document.getElementById('geo-flat');
  const search=document.getElementById('geo-search');
  const btT=document.getElementById('geo-tab-tree');
  const btF=document.getElementById('geo-tab-table');
  if(view==='table'){
    tree.style.display='none'; flat.style.display='block'; search.style.display='block';
    btF.classList.add('on'); btT.classList.remove('on');
    renderGeoFlat();
  } else {
    tree.style.display='block'; flat.style.display='none'; search.style.display='none';
    btT.classList.add('on'); btF.classList.remove('on');
  }
}

// Плоская таблица связок с сортировкой и поиском.
// Без аргумента берёт данные из state.raw.geoFlat (вызывается из inline-обработчика поиска).
let geoSortKey='leads', geoSortDir=-1;
export function renderGeoFlat(rows){
  if(rows===undefined) rows = state.raw?.geoFlat || [];
  const el=document.getElementById('geo-flat');
  if(!el) return;
  if(!rows || !rows.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}

  // Фильтр по поиску
  const q=(document.getElementById('geo-search')?.value||'').toLowerCase().trim();
  let data=rows;
  if(q) data=rows.filter(r=>(r.city+' '+r.site+' '+r.source).toLowerCase().includes(q));

  // Сортировка
  data=[...data].sort((a,b)=>{
    let av=a[geoSortKey], bv=b[geoSortKey];
    if(typeof av==='string'){av=av.toLowerCase();bv=bv.toLowerCase();return geoSortDir*(av<bv?-1:av>bv?1:0);}
    return geoSortDir*(av-bv);
  });

  const cityIcon=c=>c==='Москва'?'🏙️':c==='Санкт-Петербург'?'🌊':'📍';
  const arrow=k=>geoSortKey===k?(geoSortDir<0?' ↓':' ↑'):'';

  el.innerHTML=`
    <table class="tbl fixed">
      <thead><tr>
        <th style="width:20%;cursor:pointer" onclick="setGeoSort('city')">Город${arrow('city')}</th>
        <th style="width:22%;cursor:pointer" onclick="setGeoSort('site')">Сайт${arrow('site')}</th>
        <th style="width:22%;cursor:pointer" onclick="setGeoSort('source')">Источник${arrow('source')}</th>
        <th style="width:11%;text-align:right;cursor:pointer" onclick="setGeoSort('leads')">Заявки${arrow('leads')}</th>
        <th style="width:11%;text-align:right;cursor:pointer" onclick="setGeoSort('bought')">Продажи${arrow('bought')}</th>
        <th style="width:14%;text-align:right;cursor:pointer" onclick="setGeoSort('conv')">Конверсия${arrow('conv')}</th>
      </tr></thead>
      <tbody>
        ${data.slice(0,60).map(r=>`<tr>
          <td>${cityIcon(r.city)} ${r.city}</td>
          <td style="color:var(--tx2)">${r.site}</td>
          <td style="font-weight:500">${r.source}</td>
          <td style="text-align:right">${drillNum(r.leads,r.leadIds,'var(--tx)')}</td>
          <td style="text-align:right">${drillNum(r.bought,r.boughtIds,'var(--green)')}</td>
          <td style="text-align:right;font-weight:600;color:${cc(r.conv)}">${r.conv}%</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:10px;color:var(--tx3);margin-top:8px">Показано ${Math.min(60,data.length)} из ${data.length} связок · клик по заголовку — сортировка · клик по цифре — сделки в AmoCRM</div>
  `;
}
export function setGeoSort(key){
  if(geoSortKey===key) geoSortDir*=-1;
  else { geoSortKey=key; geoSortDir=(key==='city'||key==='site'||key==='source')?1:-1; }
  renderGeoFlat();
}
