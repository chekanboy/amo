// Навигация: подключение Apps Script, вкладки, периоды, произвольный диапазон дат
import { state } from './state.js';
import { load, loadTab } from './api.js';
import { renderTab } from './render.js';

export function connect(){
  const v=document.getElementById('aurl').value.trim();
  if(!v.startsWith('https://script.google.com')){document.getElementById('serr').textContent='Неверная ссылка';return;}
  state.API=v;localStorage.setItem('alfa_api_v2',v);
  document.getElementById('setup').style.display='none';
  document.getElementById('main').style.display='block';
  load();
}

export function resetSetup(){document.getElementById('setup').style.display='flex';document.getElementById('main').style.display='none';}

export function setPeriod(p){
  state.period=p; state.cFrom=null; state.cTo=null;
  state.raw=null; state.prev=null; state.loadedTabs={};
  document.getElementById('df').value='';
  document.getElementById('dt').value='';
  document.querySelectorAll('.ptab').forEach(x=>x.classList.remove('on'));
  document.querySelector(`.ptab[data-p="${p}"]`)?.classList.add('on');
}

export function applyRange(){
  const f=document.getElementById('df').value,t=document.getElementById('dt').value;
  if(!f||!t)return;
  state.cFrom=f;state.cTo=t;state.period='';
  document.querySelectorAll('.ptab').forEach(x=>x.classList.remove('on'));
  load();
}

// Навешивает обработчики на топбар и sub-табы
export function initNav(){
  // ── НАВИГАЦИЯ ПО ВКЛАДКАМ (ленивая загрузка через ?tab=) ──
  document.getElementById('navtabs').addEventListener('click',e=>{
    const t=e.target.closest('.ntab');if(!t)return;
    document.querySelectorAll('.ntab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('on'));
    document.getElementById('page-'+t.dataset.pg).classList.add('on');
    state.currentTab=t.dataset.pg;
    if(!state.loadedTabs[state.currentTab]){
      loadTab(state.currentTab); // lazy load при первом переходе
    } else {
      renderTab(state.currentTab); // уже загружено — просто рендерим
    }
  });

  // ── ПЕРИОДЫ ──
  ['ptabs1','ptabs2'].forEach(id=>{
    document.getElementById(id).addEventListener('click',e=>{
      const t=e.target.closest('.ptab');if(!t)return;
      setPeriod(t.dataset.p);
      load();
    });
  });

  // ── SUB-ТАБЫ: Звонки (сайт) ──
  document.getElementById('ct-stabs').addEventListener('click',e=>{
    const t=e.target.closest('.stab');if(!t)return;
    document.querySelectorAll('#ct-stabs .stab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    ['ct-alfa-collection.ru','ct-faamo.ru'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('ct-'+t.dataset.ct).style.display='block';
  });

  // ── SUB-ТАБЫ: Метрика (сайт) ──
  document.getElementById('m-stabs').addEventListener('click',e=>{
    const t=e.target.closest('.stab');if(!t)return;
    document.querySelectorAll('#m-stabs .stab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    ['ms-alfa-collection.ru','ms-faamo.ru'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('ms-'+t.dataset.ms).style.display='block';
  });

  // ── ПОД-ТАБЫ CRM (Обзор/Воронка/Источники/Города/Менеджеры) ──
  // Только показ/скрытие секций: данные CRM уже загружены (один fetch ?tab=crm),
  // ничего не перезагружаем. Графики (пончики responsive:false, тренд responsive:true
  // с ResizeObserver) переживают показ/скрытие — перерисовка не нужна.
  const CRM_SECS=['overview','funnel','sources','cities','managers'];
  document.getElementById('crm-stabs').addEventListener('click',e=>{
    const t=e.target.closest('.stab');if(!t)return;
    document.querySelectorAll('#crm-stabs .stab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
    CRM_SECS.forEach(s=>{const el=document.getElementById('crm-sec-'+s);if(el)el.style.display=(s===t.dataset.cs)?'':'none';});
  });
}
