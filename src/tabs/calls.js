// Вкладка «Звонки» (Calltouch): метрики + таблицы по источникам и городам для двух сайтов
import { fmtSec } from '../utils/format.js';

export function renderCalls(ct){
  ['alfa-collection.ru','faamo.ru'].forEach(site=>{
    const key=site==='alfa-collection.ru'?'alfa':'faamo';
    const d=ct[site]||{total:0,answered:0,missed:0,unique:0,target:0,avgDuration:0,bySrc:[],byCity:[]};
    const ar=d.total>0?Math.round(d.answered/d.total*100):0;
    const mEl=document.getElementById('ct-m-'+key);
    if(mEl)mEl.innerHTML=`
      <div class="mc"><div class="mlb">Всего звонков</div><div class="mv">${d.total}</div></div>
      <div class="mc"><div class="mlb">Принято</div><div class="mv" style="color:var(--green)">${d.answered}</div></div>
      <div class="mc"><div class="mlb">Пропущено</div><div class="mv" style="color:var(--red)">${d.missed}</div></div>
      <div class="mc"><div class="mlb">Целевых</div><div class="mv" style="color:var(--purple)">${d.target}</div></div>
      <div class="mc"><div class="mlb">Уникальных</div><div class="mv" style="color:var(--blue)">${d.unique}</div></div>
      <div class="mc"><div class="mlb">% принятых</div><div class="mv" style="color:${ar>=80?'var(--green)':ar>=60?'var(--amber)':'var(--red)'}">${ar}%</div></div>
      <div class="mc"><div class="mlb">Ср. длит.</div><div class="mv">${fmtSec(d.avgDuration)}</div></div>
    `;
    const sEl=document.getElementById('ct-src-'+key);
    if(sEl){
      if(!d.bySrc.length)sEl.innerHTML='<tr><td colspan="6" style="color:var(--tx3);padding:8px">Нет данных</td></tr>';
      else sEl.innerHTML=d.bySrc.map(r=>{const p=r.calls>0?Math.round(r.answered/r.calls*100):0;return`<tr><td style="font-weight:500">${r.src}</td><td style="text-align:right">${r.calls}</td><td style="text-align:right;color:var(--green)">${r.answered}</td><td style="text-align:right;color:var(--red)">${r.missed}</td><td style="text-align:right;color:var(--purple)">${r.target}</td><td style="text-align:right;color:${p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)'};">${p}%</td></tr>`;}).join('');
    }
    const cEl=document.getElementById('ct-city-'+key);
    if(cEl){
      if(!d.byCity.length)cEl.innerHTML='<tr><td colspan="4" style="color:var(--tx3);padding:8px">Нет данных</td></tr>';
      else cEl.innerHTML=d.byCity.map(r=>{const p=r.calls>0?Math.round(r.answered/r.calls*100):0;return`<tr><td style="text-transform:capitalize">${r.city}</td><td style="text-align:right">${r.calls}</td><td style="text-align:right;color:var(--green)">${r.answered}</td><td style="text-align:right;color:${p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)'}">${p}%</td></tr>`;}).join('');
    }
  });
}
