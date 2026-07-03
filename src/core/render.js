// Диспетчер рендера: по имени вкладки вызывает нужные рендереры на данных state.raw
import { state } from './state.js';
import { renderCRM } from '../tabs/crm.js';
import { renderCalls } from '../tabs/calls.js';
import { renderMetrika } from '../tabs/metrika.js';
import { renderDirect, renderCityChannels } from '../tabs/direct.js';
import { renderFaamoFunnel, renderSiteFunnel, renderRefusalReasons } from '../components/funnel.js';

export function renderTab(tab){
  const raw = state.raw, prev = state.prev;
  if(!raw) return;
  if(tab==='crm'){
    renderCRM(raw,prev);
    renderFaamoFunnel(raw.faamoFunnel||null);
    renderSiteFunnel(raw.alfaFunnel||null,'alfa-funnel-tbody','alfa-metrics','#a78bfa');
    renderCalls(raw.calltouch||{});
    renderRefusalReasons(raw.refusalReasons||[]);
  } else if(tab==='calls'){
    renderCalls(raw.calltouch||{});
  } else if(tab==='metrika'){
    renderMetrika(raw.metrika||{});
  } else if(tab==='direct'){
    renderDirect(raw.direct||{}, raw.directKeywords||[], raw.yandex||[]);
    renderCityChannels(raw.cityChannels||[], (raw.direct||{}).byId||{});
  }
}

export function renderAll(){ renderTab(state.currentTab); }
