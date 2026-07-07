// Вкладка CRM: метрики-карточки, менеджеры + оркестрация вложенных блоков
import { dif, cc } from '../utils/format.js';
import { AC, FC, STAGES } from '../utils/constants.js';
import { renderFunnel, renderLost } from '../components/funnel.js';
import { renderGeo } from '../components/geo.js';
import { renderDonuts, renderTrendCRM } from '../components/charts.js';
import { drillNum } from '../components/drilldown.js';

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
  const el=document.getElementById('mgrs');
  if(!managers.length){el.innerHTML='<div class="nd">Нет данных</div>';return;}
  el.innerHTML=`
    <table class="tbl fixed">
      <thead><tr>
        <th style="width:20%">Менеджер</th>
        <th style="width:11%;text-align:right">Лиды</th>
        <th style="width:12%;text-align:right">В работе</th>
        <th style="width:12%;text-align:right">Не обраб.</th>
        <th style="width:11%;text-align:right">Купили</th>
        <th style="width:10%;text-align:right">Конв.</th>
        <th style="width:13%;text-align:right">В магазин</th>
        <th style="width:11%;text-align:right" title="Скорость обработки — требует событий AmoCRM">Скорость</th>
      </tr></thead>
      <tbody>${managers.map((m,i)=>managerRow(m,i)).join('')}</tbody>
    </table>
    <div style="font-size:10px;color:var(--tx3);margin-top:8px">💡 Клик по имени — мини-воронка менеджера · цифры кликабельны (сделки в AmoCRM)</div>`;
}

// Строка менеджера + скрытая строка с мини-воронкой (раскрывается кликом по имени)
function managerRow(m,i){
  const conv=m.leads>0?Math.round(m.bought/m.leads*100):0;
  const vis =m.leads>0?Math.round((m.visited||0)/m.leads*100):0;
  const c=AC[i%AC.length];
  // «Не обработанные»: >5 красным (не разгребает новые заявки), >0 жёлтым, 0 — приглушённо
  const un=m.unprocessed||0;
  const unColor=un>5?'var(--red)':un>0?'var(--amber)':'var(--tx3)';
  return `<tr>
    <td style="cursor:pointer" title="${m.name} — показать мини-воронку" onclick="var n=this.parentElement.nextElementSibling;n.style.display=n.style.display==='none'?'table-row':'none'">
      <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${c};flex-shrink:0"></span><span style="font-weight:500;border-bottom:1px dashed var(--tx3)">${m.name}</span></span>
    </td>
    <td style="text-align:right">${drillNum(m.leads,m.leadIds,'var(--tx)')}</td>
    <td style="text-align:right">${drillNum(m.active||0,m.activeIds,'var(--blue)')}</td>
    <td style="text-align:right;font-weight:600">${drillNum(un,m.unprocessedIds,unColor)}</td>
    <td style="text-align:right">${drillNum(m.bought,m.boughtIds,'var(--green)')}</td>
    <td style="text-align:right;font-weight:600;color:${cc(conv)}">${conv}%</td>
    <td style="text-align:right;color:var(--teal)">${vis}%</td>
    <td style="text-align:right;color:var(--tx3)" title="Требует /api/v4/events">—</td>
  </tr>
  <tr style="display:none"><td colspan="8" style="background:var(--bg3);padding:10px 12px">${managerFunnel(m)}</td></tr>`;
  // TODO ЭТАП 2: колонка «Скорость» — время до первого касания сделки. Требует /api/v4/events.
}

// Мини-воронка менеджера: накопительно по этапам (из byStage), видно, на каком этапе теряет
function managerFunnel(m){
  const bs=m.byStage||{};
  const cur=STAGES.map(s=>bs[s.id]||0);              // текущее распределение по этапам, в порядке прогрессии
  const cum=[]; let acc=0;                            // накопительно: достигли этапа i = сумма всех, кто на этапе ≥ i
  for(let i=STAGES.length-1;i>=0;i--){acc+=cur[i];cum[i]=acc;}
  const top=cum[0]||0;
  if(!top){return `<div style="font-size:11px;color:var(--tx3)">Нет данных по этапам${m.lost?` · отказов: ${m.lost}`:''}</div>`;}
  const bars=STAGES.map((s,i)=>{
    const reached=cum[i];
    const drop=i>0?cum[i-1]-cum[i]:0;
    const w=Math.max(3,Math.round(reached/top*100));
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
      <div style="width:110px;font-size:11px;color:var(--tx2);flex-shrink:0">${s.name}</div>
      <div style="flex:1;background:var(--bg2);border-radius:4px;height:14px;overflow:hidden"><div style="width:${w}%;height:100%;background:${FC[i%FC.length]};border-radius:4px"></div></div>
      <div style="width:34px;text-align:right;font-size:11px;font-weight:600">${reached}</div>
      <div style="width:52px;text-align:right;font-size:10px;color:var(--red)">${drop>0?'−'+drop:''}</div>
    </div>`;
  }).join('');
  return `<div style="font-size:10px;color:var(--tx3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">Мини-воронка · накопительно${m.lost?` · отказов: ${m.lost}`:''}</div>${bars}`;
}
