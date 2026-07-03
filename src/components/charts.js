// ГРАФИКИ CRM: доунаты по источникам, таблица эффективности источников, тренд лидов.
// Chart — глобальный объект из Chart.js (подключён через CDN в index.html).
import { AC } from '../utils/constants.js';
import { cc, axisColor, gridColor } from '../utils/format.js';
import { drillNum } from './drilldown.js';

let tChart=null;

export function renderDonuts(sources){
  const rows=sources.slice(0,8);
  const other=sources.slice(8).reduce((a,s)=>({leads:a.leads+s.leads,bought:a.bought+s.bought}),{leads:0,bought:0});
  const all=other.leads>0?[...rows,{name:'другие',...other}]:rows;
  if(!all.length)return;
  const labels=all.map(r=>r.name);
  const lD=all.map(r=>r.leads),bD=all.map(r=>r.bought);
  const tL=lD.reduce((a,b)=>a+b,0),tB=bD.reduce((a,b)=>a+b,0);
  function mk(id,data,total,legId){
    const ctx=document.getElementById(id);if(!ctx)return;
    const ex=Chart.getChart(ctx);if(ex)ex.destroy();
    new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:AC,borderWidth:2,borderColor:document.documentElement.getAttribute('data-theme')==='dark'?'#16161b':'#ffffff'}]},options:{responsive:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed} (${total>0?Math.round(c.parsed/total*100):0}%)`}}}}});
    const leg=document.getElementById(legId);if(!leg)return;
    leg.innerHTML=all.map((r,i)=>`<div class="dl-row"><div class="dl-dot" style="background:${AC[i%AC.length]}"></div><div class="dl-name" title="${r.name}">${r.name}</div><div class="dl-pct">${total>0?Math.round(data[i]/total*100):0}%</div><div class="dl-cnt">${data[i]}</div></div>`).join('');
  }
  mk('dleads',lD,tL,'dleads-leg');mk('dbought',bD,tB,'dbought-leg');
  renderSrcQuality(sources);
}

// Таблица эффективности источников с drill-down и оценкой качества
export function renderSrcQuality(sources){
  const el=document.getElementById('src-quality');
  if(!el) return;
  if(!sources.length){el.innerHTML='<tr><td colspan="6" style="color:var(--tx3);padding:8px">Нет данных</td></tr>';return;}
  const maxLeads=Math.max(...sources.map(s=>s.leads));
  el.innerHTML=sources.slice(0,12).map(s=>{
    const conv=s.conv!==undefined?s.conv:(s.leads>0?Math.round(s.bought/s.leads*100):0);
    const lost=s.lost||0;
    // Оценка качества: много заявок но мало конверсии = плохо
    let quality, qColor;
    if(s.leads<3){ quality='мало данных'; qColor='var(--tx3)'; }
    else if(conv>=40){ quality='отличный'; qColor='var(--green)'; }
    else if(conv>=20){ quality='хороший'; qColor='var(--teal)'; }
    else if(conv>=10){ quality='средний'; qColor='var(--amber)'; }
    else { quality='⚠ объём без продаж'; qColor='var(--red)'; }
    const barW=Math.round(s.leads/maxLeads*100);
    return `<tr>
      <td style="font-weight:500" title="${s.name}">${s.name}</td>
      <td style="text-align:right">${drillNum(s.leads, s.leadIds, 'var(--tx)')}</td>
      <td style="text-align:right">${drillNum(s.bought, s.boughtIds, 'var(--green)')}</td>
      <td style="text-align:right">${drillNum(lost, s.lostIds, 'var(--red)')}</td>
      <td style="text-align:right;font-weight:600;color:${cc(conv)}">${conv}%</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:var(--bg3);border-radius:3px;height:4px;overflow:hidden"><div style="width:${barW}%;height:100%;background:${qColor}"></div></div>
          <span style="font-size:10px;color:${qColor};white-space:nowrap;min-width:90px">${quality}</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

export function renderTrendCRM(trend){
  if(tChart){tChart.destroy();tChart=null;}
  if(!trend.length)return;
  tChart=new Chart(document.getElementById('tchart'),{type:'line',data:{labels:trend.map(t=>t.date),datasets:[{label:'Лидов',data:trend.map(t=>t.leads),borderColor:'#a78bfa',backgroundColor:'#a78bfa12',borderWidth:2,pointRadius:3,tension:.4,fill:true},{label:'Купили',data:trend.map(t=>t.bought),borderColor:'#4ade80',backgroundColor:'#4ade8010',borderWidth:2,pointRadius:3,tension:.4,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:axisColor(),font:{size:10}},grid:{color:gridColor()}},y:{ticks:{color:axisColor(),font:{size:10}},grid:{color:gridColor()}}}}});
}
