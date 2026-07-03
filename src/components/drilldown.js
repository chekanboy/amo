// DRILL-DOWN: кликабельные цифры → ссылки на сделки в AmoCRM
import { AMO_BASE } from '../utils/constants.js';

// Открыть одну сделку (это работает в AmoCRM всегда)
export function amoLead(id){ return AMO_BASE + '/leads/detail/' + id; }

// Глобальный попап для списка сделок
export function showLeadsPopup(ids, anchorEl, label){
  closeLeadsPopup();
  if(!ids || !ids.length) return;
  const pop = document.createElement('div');
  pop.id = 'leadsPopup';
  pop.style.cssText = 'position:fixed;z-index:10000;background:var(--bg2);border:1px solid var(--br2);border-radius:10px;box-shadow:0 8px 32px #00000040;padding:8px;max-height:320px;overflow-y:auto;min-width:180px;max-width:260px';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;color:var(--tx3);padding:4px 8px 8px;border-bottom:1px solid var(--br);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em';
  title.textContent = (label||'Сделки') + ' · ' + ids.length;
  pop.appendChild(title);

  ids.forEach((id,i)=>{
    const a = document.createElement('a');
    a.href = amoLead(id);
    a.target = '_blank';
    a.style.cssText = 'display:block;padding:6px 8px;font-size:12px;color:var(--blue);text-decoration:none;border-radius:5px';
    a.onmouseover = ()=>a.style.background='var(--bg3)';
    a.onmouseout = ()=>a.style.background='transparent';
    a.textContent = '#'+id + ' →';
    pop.appendChild(a);
  });

  if(ids.length>=50){
    const more = document.createElement('div');
    more.style.cssText='font-size:10px;color:var(--tx3);padding:6px 8px;text-align:center';
    more.textContent='показаны первые 50';
    pop.appendChild(more);
  }

  document.body.appendChild(pop);

  // Позиционируем рядом с кликнутым элементом
  const r = anchorEl.getBoundingClientRect();
  let top = r.bottom + 4, left = r.left;
  if(left + 260 > window.innerWidth) left = window.innerWidth - 270;
  if(top + 320 > window.innerHeight) top = Math.max(8, r.top - 324);
  pop.style.top = top+'px';
  pop.style.left = left+'px';

  setTimeout(()=>document.addEventListener('click', closeLeadsPopupOnce), 10);
}
export function closeLeadsPopup(){ const p=document.getElementById('leadsPopup'); if(p)p.remove(); }
function closeLeadsPopupOnce(e){
  const p=document.getElementById('leadsPopup');
  if(p && !p.contains(e.target)){ p.remove(); document.removeEventListener('click', closeLeadsPopupOnce); }
}

// Кликабельная цифра: 1 сделка → прямая ссылка, несколько → попап
export function drillNum(count, ids, color){
  const c = color || 'inherit';
  if(!count || !ids || !ids.length) return `<span style="color:${c}">${count}</span>`;
  if(ids.length === 1){
    return `<a href="${amoLead(ids[0])}" target="_blank" style="color:${color||'var(--blue)'};text-decoration:none;border-bottom:1px dashed currentColor" title="Открыть сделку">${count}</a>`;
  }
  const idsAttr = ids.join(',');
  return `<span onclick="event.stopPropagation();showLeadsPopup('${idsAttr}'.split(',').map(Number),this,'Сделки')" style="color:${color||'var(--blue)'};border-bottom:1px dashed currentColor;cursor:pointer" title="Показать ${count} сделок">${count}</span>`;
}
