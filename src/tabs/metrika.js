// Вкладка «Метрика» (Яндекс.Метрика): метрики, источники (каналы/UTM), график визитов
import { fmtSec, axisColor, gridColor } from '../utils/format.js';

export function renderMetrika(m){
  ['alfa-collection.ru','faamo.ru'].forEach(site=>{
    const key=site==='alfa-collection.ru'?'alfa':'faamo';
    const d=m[site]||{};
    const mm=document.getElementById('mm-'+key);
    if(mm)mm.innerHTML=`<div class="mc"><div class="mlb">Визиты</div><div class="mv">${(d.visits||0).toLocaleString('ru')}</div></div><div class="mc"><div class="mlb">Посетители</div><div class="mv" style="color:var(--blue)">${(d.users||0).toLocaleString('ru')}</div></div><div class="mc"><div class="mlb">Отказы</div><div class="mv" style="color:var(--amber)">${d.bounceRate||0}%</div></div><div class="mc"><div class="mlb">Глубина</div><div class="mv">${d.pageDepth||0}</div></div><div class="mc"><div class="mlb">Ср. время</div><div class="mv">${fmtSec(d.avgDuration||0)}</div></div>`;
    const sEl=document.getElementById('src-'+key);
    if(sEl){const rows=d.bySource||[];sEl.innerHTML=rows.length?rows.map(r=>`<tr><td>${r.source}</td><td style="text-align:right;font-weight:500">${r.visits.toLocaleString('ru')}</td><td style="text-align:right">${r.users.toLocaleString('ru')}</td><td style="text-align:right;color:${r.bounceRate>70?'var(--red)':r.bounceRate>50?'var(--amber)':'var(--green)'}">${r.bounceRate}%</td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--tx3);padding:8px">Нет данных</td></tr>';}
    const uEl=document.getElementById('utm-'+key);
    if(uEl){const rows=d.byUtm||[];uEl.innerHTML=rows.length?rows.map(r=>`<tr><td>${r.source}</td><td style="text-align:right;font-weight:500">${r.visits.toLocaleString('ru')}</td><td style="text-align:right">${r.users.toLocaleString('ru')}</td><td style="text-align:right;color:${r.bounceRate>70?'var(--red)':r.bounceRate>50?'var(--amber)':'var(--green)'}">${r.bounceRate}%</td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--tx3);padding:8px">Нет UTM данных</td></tr>';}
    const ctx=document.getElementById('mchart-'+key);
    if(ctx){const ex=Chart.getChart(ctx);if(ex)ex.destroy();const trend=d.trend||[];if(trend.length)new Chart(ctx,{type:'line',data:{labels:trend.map(t=>t.date),datasets:[{label:'Визиты',data:trend.map(t=>t.visits),borderColor:'#60a5fa',backgroundColor:'#60a5fa12',borderWidth:2,pointRadius:2,tension:.4,fill:true},{label:'Польз.',data:trend.map(t=>t.users),borderColor:'#a78bfa',backgroundColor:'#a78bfa10',borderWidth:2,pointRadius:2,tension:.4,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:axisColor(),font:{size:10}},grid:{color:gridColor()}},y:{ticks:{color:axisColor(),font:{size:10}},grid:{color:gridColor()}}}}});}
  });
}

export function switchSrcTab(key,tab){
  document.getElementById('src-ch-'+key).style.display=tab==='ch'?'block':'none';
  document.getElementById('src-utm-'+key).style.display=tab==='utm'?'block':'none';
  document.querySelectorAll('#src-tabs-'+key+' .stab').forEach((b,i)=>b.classList.toggle('on',i===(tab==='ch'?0:1)));
}
