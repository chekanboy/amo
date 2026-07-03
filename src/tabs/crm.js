// Вкладка CRM: метрики-карточки, менеджеры + оркестрация вложенных блоков
import { dif, cc } from '../utils/format.js';
import { AC } from '../utils/constants.js';
import { renderFunnel, renderLost } from '../components/funnel.js';
import { renderGeo } from '../components/geo.js';
import { renderDonuts, renderTrendCRM } from '../components/charts.js';

export function renderCRM(d,p){
  const conv=d.total>0?Math.round(d.bought/d.total*100):0;
  const pconv=p&&p.total>0?Math.round(p.bought/p.total*100):0;
  document.getElementById('m0').textContent=(d.total||0).toLocaleString('ru');
  document.getElementById('m1').textContent=(d.bought||0).toLocaleString('ru');
  document.getElementById('m2').textContent=conv+'%'; document.getElementById('m2s').textContent=d.bought+' из '+d.total;
  document.getElementById('m3').textContent=(d.visitedPct||0)+'%'; document.getElementById('m3s').textContent=(d.visitedCount||0)+' чел.';
  document.getElementById('m4').textContent=(d.lost||0).toLocaleString('ru'); document.getElementById('m4s').textContent=(d.total>0?Math.round(d.lost/d.total*100):0)+'%';
  document.getElementById('m5').textContent=(d.active||0).toLocaleString('ru');
  if(p){
    dif('m0d',d.total,p.total);                                  // Лиды — штуки
    dif('m1d',d.bought,p.bought);                                // Купили — штуки
    dif('m2d',conv,pconv,true);                                  // Конверсия — проценты (пункты)
    dif('m3d',d.visitedPct,p.visitedPct||0,true);                // В магазин % — пункты
    dif('m4d',d.lost,p.lost,false,true);                         // Отказы — штуки, рост=плохо
    dif('m5d',d.active,p.active);                                // В работе — штуки
  }
  renderFunnel(d.funnel||[]);
  renderManagers(d.managers||[]);
  renderGeo(d.geo||[]);
  renderDonuts(d.sources||[]);
  renderTrendCRM(d.trendAmo||[]);
  renderLost(d.funnel||[]);
}

export function renderManagers(managers){
  const el=document.getElementById('mgrs'); if(!managers.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}
  el.innerHTML=managers.map((m,i)=>{
    const conv=m.leads>0?Math.round(m.bought/m.leads*100):0;
    const vis=m.leads>0?Math.round((m.visited||0)/m.leads*100):0;
    const ini=(m.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const c=AC[i%AC.length];
    return`<div class="mr"><div class="av" style="background:${c}22;color:${c}">${ini}</div><div class="mn">${m.name}</div><div class="mss"><div class="mst"><div class="msv">${m.leads}</div><div class="msl">Лидов</div></div><div class="mst"><div class="msv" style="color:var(--green)">${m.bought}</div><div class="msl">Купили</div></div><div class="mst"><div class="msv" style="color:${cc(conv)}">${conv}%</div><div class="msl">Конв.</div></div><div class="mst"><div class="msv" style="color:var(--teal)">${vis}%</div><div class="msl">В магазин</div></div></div></div>`;
  }).join('');
}
