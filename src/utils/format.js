// Форматтеры, цветовые хелперы, расчёт дельт для метрик
import { state } from '../core/state.js';

export function fmtd(s){const d=new Date(s);return d.getDate().toString().padStart(2,'0')+'.'+(d.getMonth()+1).toString().padStart(2,'0')+'.'+(d.getFullYear()+'').slice(2);}
export function fmtSec(s){if(!s)return'0с';if(s<60)return s+'с';return Math.floor(s/60)+'м '+(s%60)+'с';}

// Цвет конверсии
export function cc(c){return c>=30?'var(--green)':c>=15?'var(--amber)':'var(--red)';}

// Цвета осей/сетки графиков в зависимости от темы
export function axisColor(){return document.documentElement.getAttribute('data-theme')==='dark'?'#646878':'#9499a8';}
export function gridColor(){return document.documentElement.getAttribute('data-theme')==='dark'?'#ffffff07':'#00000008';}

// Метка периода сравнения (что с чем сравниваем)
export function comparisonLabel(){
  const map={today:'вчера',this_week:'пр. неделей',this_month:'пр. месяцем'};
  return map[state.period] || 'пред.';
}

// dif: показывает разницу в штуках И процентах + стрелка + период
// isPercent: true для метрик-процентов (разница в пунктах, не в %)
// invert: true если рост = плохо (например, отказы)
export function dif(id,curr,pv,isPercent,invert){
  const el=document.getElementById(id); if(!el)return;
  if(pv==null||(pv===0&&curr===0)){el.textContent='';el.className='mdf eq';return;}
  const absDiff = curr-pv;
  const cmpLbl = comparisonLabel();

  if(isPercent){
    // Процентная метрика: разница в процентных пунктах
    const pts = absDiff;
    const good = invert ? pts<0 : pts>0;
    const cls = pts===0?'eq':(good?'up':'dn');
    const arrow = pts>0?'↑':pts<0?'↓':'';
    el.className='mdf '+cls;
    el.innerHTML=`${arrow} ${pts>0?'+':''}${pts} п.п. <span style="color:var(--tx3);font-weight:400">vs ${cmpLbl}</span>`;
  } else {
    // Штучная метрика: разница в штуках + процент
    const pctChange = pv!==0 ? Math.round(absDiff/pv*100) : (curr>0?100:0);
    const good = invert ? absDiff<0 : absDiff>0;
    const cls = absDiff===0?'eq':(good?'up':'dn');
    const arrow = absDiff>0?'↑':absDiff<0?'↓':'';
    const sign = absDiff>0?'+':'';
    el.className='mdf '+cls;
    el.innerHTML=`${arrow} ${sign}${absDiff.toLocaleString('ru')} (${sign}${pctChange}%) <span style="color:var(--tx3);font-weight:400">vs ${cmpLbl}</span>`;
  }
}
