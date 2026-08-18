// ═══════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════
// ── СЕКРЕТЫ ────────────────────────────────────────────────────────────────────
// Токены НЕ хранятся в коде: репозиторий публичный. Значения лежат в Script Properties
// этого проекта Apps Script: Настройки проекта → Свойства скрипта.
// Нужны 4 свойства: AMO_TOKEN, METRIKA_TOKEN, DIRECT_TOKEN, CT_TOKEN.
// Инструкция по настройке — README-APPS-SCRIPT.md в репозитории.
const PROPS_        = PropertiesService.getScriptProperties();
const AMO_TOKEN     = PROPS_.getProperty('AMO_TOKEN')     || '';
const METRIKA_TOKEN = PROPS_.getProperty('METRIKA_TOKEN') || '';
const DIRECT_TOKEN  = PROPS_.getProperty('DIRECT_TOKEN')  || '';
const CT_TOKEN      = PROPS_.getProperty('CT_TOKEN')      || '';

// Какие свойства забыли прописать. Проверяется в doGet, чтобы вместо пустых данных
// пришла понятная ошибка прямо в интерфейс дашборда.
function missingSecrets() {
  return [['AMO_TOKEN', AMO_TOKEN], ['METRIKA_TOKEN', METRIKA_TOKEN],
          ['DIRECT_TOKEN', DIRECT_TOKEN], ['CT_TOKEN', CT_TOKEN]]
    .filter(function(p){ return !p[1]; }).map(function(p){ return p[0]; });
}

// Не секреты — остаются в коде
const AMO_DOMAIN    = 'igormakarenko877.amocrm.ru';

// ID Google Таблицы для ежедневного отчёта (см. generateDailyReport ниже) — тоже в Script
// Properties, не в коде: репозиторий публичный, а ID таблицы вместе с правами доступа к ней
// давал бы больше, чем хотелось бы светить. НЕ входит в missingSecrets() — сам дашборд
// (doGet) от него не зависит, нужен только для функций отчёта/триггера.
const REPORT_SHEET_ID = PROPS_.getProperty('REPORT_SHEET_ID') || '';

// ── ВОРОНКИ AMOCRM ──────────────────────────────────────────────────────────────
// Раньше дашборд забирал сделки ТОЛЬКО из «Продажи» (filter[pipeline_id]=8708346) — остальные
// 6 воронок выпадали из аналитики и занижали цифры. Теперь забираем все РЕАЛЬНЫЕ воронки, а
// технические исключаем на уровне запроса к API (мультифильтр filter[pipeline_id][] работает).
const PIPE_SALES     = 8708346;   // Продажи — основная воронка, её этапы описывает STAGES
const PIPE_SUPPLY    = 10217954;  // Ждут поставку — клиент не подобрал товар, ждёт поставку
const PIPE_COND_LOST = 10217962;  // Условный отказ — вся воронка считается ОТКАЗОМ
const PIPE_DELIVERY  = 10809230;  // Доставка по РФ — «В доставке»: НЕ продажа и НЕ отказ
const PIPE_COLD      = 11157782;  // Х/Б (холодная база) — источник всегда «Холодный обзвон»
const PIPE_REGULARS  = 10234910;  // Постоянные клиенты — ИСКЛЮЧЕНА, см. ниже
const PIPE_ROBOCALL  = 10882086;  // Отказ для автопрозвона — ИСКЛЮЧЕНА (техническая, робот-прозвон)

// ПОЧЕМУ «Постоянные клиенты» (10234910) ИСКЛЮЧЕНА — проверено на реальных данных (июнь 2026):
//   • все 289 сделок созданы роботом (created_by=0), ни одной — человеком;
//   • название вида «Автосделка: 1,06 купил …» — ссылка на уже состоявшуюся покупку;
//   • 285 из 289 (98.6%) имеют сделку того же контакта в «Продажи», медиана — 1.4 дня ПОСЛЕ неё;
//   • у всех 53 сделок с ненулевой суммой price совпал с родительской выигранной сделкой 53/53.
// Т.е. это роботные КОПИИ уже учтённых продаж («База купивших» для прогрева), а не новая выручка.
// Если их учитывать, продажи за июнь раздуваются 503 → 734 (+46%) на том же самом доходе.
// Чтобы вернуть их в аналитику — перенесите PIPE_REGULARS из PIPES_EXCLUDED в PIPES_ALLOWED.
const PIPES_ALLOWED  = [PIPE_SALES, PIPE_SUPPLY, PIPE_COND_LOST, PIPE_DELIVERY, PIPE_COLD];
const PIPES_EXCLUDED = [PIPE_REGULARS, PIPE_ROBOCALL];
const PIPE_NAMES = {
  [PIPE_SALES]:'Продажи', [PIPE_SUPPLY]:'Ждут поставку', [PIPE_COND_LOST]:'Условный отказ',
  [PIPE_DELIVERY]:'Доставка по РФ', [PIPE_COLD]:'Х/Б (холодная база)',
  [PIPE_REGULARS]:'Постоянные клиенты', [PIPE_ROBOCALL]:'Отказ для автопрозвона'
};

const STATUS_BOUGHT = 142;      // «Купили» — системный статус, ОБЩИЙ для всех воронок
const STATUS_LOST   = 143;      // «Отказ»  — системный статус, ОБЩИЙ для всех воронок
const STATUS_NEW    = 70537282; // «Новая заявка» — необработанная сделка (Недозвон = уже касание менеджера, не считается)
const VISITED_IDS   = new Set([71298010, 142]);

const CT_SITES      = {'alfa-collection.ru': 60736, 'faamo.ru': 76080};
const METRIKA_IDS   = {'alfa-collection.ru': 53457376, 'faamo.ru': 99303719};

const STAGES = [
  {id:70537282, name:'Новая заявка'},
  {id:70895782, name:'Недозвон'},
  {id:80892854, name:'Взят в работу'},
  {id:70537278, name:'Пригласили в магазин'},
  {id:71298010, name:'Посетил магазин'},
  {id:142,      name:'Купили'}
];

// ═══════════════════════════════════════════════════════════
// РОУТИНГ — вычисляем даты по периоду
// ═══════════════════════════════════════════════════════════
// Ленивая загрузка по вкладке: фронт шлёт &tab= и мержит ответ в state.raw. Каждая вкладка тянет
// только свои источники, чтобы не дёргать все внешние API на каждый запрос:
//   crm     → buildAmoData (воронки/менеджеры/гео/geoFlat/источники/yandex/cityChannels/отказы/тренд)
//   calls   → Calltouch
//   metrika → Яндекс.Метрика
//   direct  → buildAmoData (нужны yandex + geoFlat) + кампании и ключи Директа
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const miss = missingSecrets();
    if (miss.length) throw new Error('В Apps Script не заданы свойства скрипта: ' + miss.join(', ') +
      '. Настройки проекта → Свойства скрипта.');

    const {fromTs, toTs, date1, date2} = resolvePeriod(p);
    const tab = p.tab || 'crm';
    let out = {};

    if (tab === 'fields_debug') {
      // ВРЕМЕННО (2026-08-18): узнать полный enum поля «Причина» (весь список опций выпадающего
      // списка в AmoCRM, а не только то, что встретилось в текущей выборке сделок) — нужно один
      // раз для калибровки classifyRefusal(). Убрать после того, как маппинг построен.
      const fd = amoFetch('/api/v4/leads/custom_fields?limit=250');
      const all = (fd && fd._embedded && fd._embedded.custom_fields) || [];
      out.fields = all.filter(f => /причин|отказ/i.test(f.name || '')).map(f => ({
        id: f.id, name: f.name, type: f.type,
        enums: (f.enums || []).map(e => ({id: e.id, value: e.value}))
      }));
    } else if (tab === 'report_debug') {
      // ВРЕМЕННО: даёт посмотреть, что посчитает generateDailyReport() за вчера, БЕЗ записи
      // в Google Таблицу (computeDailyReport ничего не пишет) — удобно свериться до передачи
      // заказчику. Не требует REPORT_SHEET_ID.
      out.report = computeDailyReport();
    } else if (tab === 'report_read_test') {
      // Только чтение (как fields_debug) — сколько строк в каждом листе отчёта и что в последней.
      // Полезно, чтобы свериться, что генератор пишет по одной строке на дату (идемпотентность).
      if (!REPORT_SHEET_ID) throw new Error('REPORT_SHEET_ID не задан');
      const ss = SpreadsheetApp.openById(REPORT_SHEET_ID);
      out.sheets = ['Общее','По городам','По сайтам','По источникам'].map(function(n){
        const sh = ss.getSheetByName(n);
        if (!sh) return {name:n, rows:0};
        const last = sh.getLastRow();
        return {name:n, rows: Math.max(0,last-1),
          lastRow: last>1 ? sh.getRange(last,1,1,sh.getLastColumn()).getValues()[0] : null};
      });
    } else if (tab === 'calls') {
      out.calltouch = buildCalltouchData(date1, date2);
    } else if (tab === 'metrika') {
      out.metrika = buildMetrikaData(date1, date2);
    } else if (tab === 'direct') {
      out = buildAmoData(fromTs, toTs);                    // yandex[] + geoFlat[] для ROI-разрезов
      out.direct = fetchDirectCampaigns(date1, date2);
      out.directKeywords = fetchDirectKeywords(date1, date2);
    } else { // crm (по умолчанию)
      out = buildAmoData(fromTs, toTs);
    }

    out.updatedAt = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Вычисляет fromTs/toTs/date1/date2 по параметру period или from/to
function resolvePeriod(p) {
  // Московское время
  const nowUtc = new Date();
  const mskOffset = 3 * 3600000;
  const nowMsk = new Date(nowUtc.getTime() + mskOffset);

  // Вспомогательные функции
  function mskDate(y, m, d) { // returns Date in UTC representing MSK midnight
    return new Date(Date.UTC(y, m, d) - mskOffset);
  }
  function toYMD(d) {
    const msk = new Date(d.getTime() + mskOffset);
    return msk.toISOString().slice(0,10);
  }

  const Y = nowMsk.getUTCFullYear();
  const M = nowMsk.getUTCMonth(); // 0-based
  const D = nowMsk.getUTCDate();
  const DOW = nowMsk.getUTCDay(); // 0=Sun
  const mondayOffset = DOW === 0 ? -6 : 1 - DOW; // days to last Monday

  let from, to;

  if (p.from && p.to) {
    from = mskDate(...p.from.split('-').map(Number).map((v,i)=>i===1?v-1:v));
    to   = new Date(mskDate(...p.to.split('-').map(Number).map((v,i)=>i===1?v-1:v)).getTime() + 86399999);
  } else {
    const period = p.period || 'today';
    switch(period) {
      case 'today':
        from = mskDate(Y, M, D);
        to   = new Date(from.getTime() + 86399999);
        break;
      case 'yesterday':
        from = mskDate(Y, M, D - 1);
        to   = new Date(from.getTime() + 86399999);
        break;
      case 'this_week': // Пн–сегодня
        from = mskDate(Y, M, D + mondayOffset);
        to   = new Date(mskDate(Y, M, D).getTime() + 86399999);
        break;
      case 'last_week': // Прошлая Пн–Вс
        from = mskDate(Y, M, D + mondayOffset - 7);
        to   = new Date(mskDate(Y, M, D + mondayOffset - 1).getTime() + 86399999);
        break;
      case 'this_month':
        from = mskDate(Y, M, 1);
        to   = new Date(mskDate(Y, M, D).getTime() + 86399999);
        break;
      case 'last_month':
        from = mskDate(Y, M - 1, 1);
        to   = new Date(mskDate(Y, M, 0).getTime() + 86399999); // last day of prev month
        break;
      case '90days':
        from = mskDate(Y, M, D - 89);
        to   = new Date(mskDate(Y, M, D).getTime() + 86399999);
        break;
      default:
        from = mskDate(Y, M, D);
        to   = new Date(from.getTime() + 86399999);
    }
  }

  return {
    fromTs: Math.floor(from.getTime() / 1000),
    toTs:   Math.floor(to.getTime()   / 1000),
    date1:  toYMD(from),
    date2:  toYMD(to)
  };
}

// ═══════════════════════════════════════════════════════════
// CALLTOUCH
// ═══════════════════════════════════════════════════════════
function buildCalltouchData(date1, date2) {
  const result = {};
  for (const [site, siteId] of Object.entries(CT_SITES)) {
    const out = {total:0, answered:0, missed:0, unique:0, target:0, avgDuration:0, bySrc:[], byCity:[]};
    try {
      let page = 1, all = [];
      while (true) {
        // Calltouch требует формат DD/MM/YYYY
        const toCtDate = d => d.split('-').reverse().join('/');
        const df = toCtDate(date1), dt = toCtDate(date2);
        const url = `https://api.calltouch.ru/calls-service/RestAPI/${siteId}/calls-diary/calls?clientApiId=${CT_TOKEN}&dateFrom=${df}&dateTo=${dt}&page=${page}&perPage=1000`;
        const r = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
        if (r.getResponseCode() !== 200) { Logger.log('CT '+site+' err: '+r.getResponseCode()); break; }
        const d = JSON.parse(r.getContentText());
        const recs = d.records || [];
        all = all.concat(recs);
        if (recs.length < 1000 || page >= (d.pageTotal||1)) break;
        page++; if (page > 10) break;
      }

      out.total    = all.length;
      out.answered = all.filter(c => c.successful === true).length;
      out.missed   = all.filter(c => c.successful === false).length;
      out.unique   = all.filter(c => c.uniqueCall === true).length;
      out.target   = all.filter(c => c.targetCall === true).length;

      const durs = all.filter(c => c.successful && c.duration > 0).map(c => c.duration);
      out.avgDuration = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0;

      // По источникам
      const srcMap = {};
      for (const c of all) {
        let src = (c.source || 'не указано').toLowerCase();
        if (src.includes('yandex') && (src.includes('direkt') || src.includes('direct') || c.medium === 'cpc')) src = 'Яндекс Директ';
        else if (src === 'yandex') src = 'Яндекс SEO';
        else if (src === 'google') src = 'Google SEO';
        else if (src.includes('google')) src = 'Google';
        else if (src.includes('2gis')) src = '2GIS';
        else if (src.includes('vk')) src = 'VK';
        else if (src.includes('instagram') || src === 'ig') src = 'Instagram';
        else if (src.includes('telegram')) src = 'Telegram';
        else if (src === 'direct' || src === '(direct)') src = 'Прямой';
        else if (!src || src === 'не указано') src = 'Не указано';
        if (!srcMap[src]) srcMap[src] = {calls:0, answered:0, target:0};
        srcMap[src].calls++;
        if (c.successful) srcMap[src].answered++;
        if (c.targetCall) srcMap[src].target++;
      }
      out.bySrc = Object.entries(srcMap)
        .map(([src,v]) => ({src, calls:v.calls, answered:v.answered, missed:v.calls-v.answered, target:v.target}))
        .sort((a,b) => b.calls-a.calls).slice(0,15);

      // По городам
      const cityMap = {};
      for (const c of all) {
        const city = (c.city || 'не указано');
        if (!cityMap[city]) cityMap[city] = {calls:0, answered:0};
        cityMap[city].calls++;
        if (c.successful) cityMap[city].answered++;
      }
      out.byCity = Object.entries(cityMap)
        .map(([city,v]) => ({city, calls:v.calls, answered:v.answered}))
        .sort((a,b) => b.calls-a.calls).slice(0,10);

    } catch(e) { Logger.log('CT err '+site+': '+e.message); }
    result[site] = out;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// ЯНДЕКС ДИРЕКТ
// ═══════════════════════════════════════════════════════════
function directReport(body) {
  const r = UrlFetchApp.fetch('https://api.direct.yandex.com/json/v5/reports', {
    method:'POST',
    headers:{'Authorization':'Bearer '+DIRECT_TOKEN,'Accept-Language':'ru',
      'processingMode':'auto','returnMoneyInMicros':'false',
      'skipReportHeader':'true','skipReportSummary':'true'},
    payload: JSON.stringify(body), muteHttpExceptions:true
  });
  if (![200,201,202].includes(r.getResponseCode())) return null;
  return r.getContentText().trim();
}

function parseTsv(tsv) {
  if (!tsv) return {headers:[], rows:[]};
  const lines = tsv.split('\n').filter(l=>l.trim());
  if (!lines.length) return {headers:[], rows:[]};
  const headers = lines[0].split('\t').map(h=>h.trim());
  const rows = lines.slice(1).map(l => {
    const cols = l.split('\t');
    const obj = {};
    headers.forEach((h,i) => obj[h] = (cols[i]||'').trim());
    return obj;
  });
  return {headers, rows};
}

function fetchDirectCampaigns(date1, date2) {
  const tsv = directReport({method:'get',params:{
    SelectionCriteria:{DateFrom:date1,DateTo:date2},
    FieldNames:['CampaignId','CampaignName','CampaignType','Clicks','Impressions','Ctr','Cost','AvgCpc'],
    ReportName:'campaigns_'+date1+'_'+date2,   // Директ требует уникальное имя отчёта, иначе ошибка
    ReportType:'CAMPAIGN_PERFORMANCE_REPORT',DateRangeType:'CUSTOM_DATE',
    Format:'TSV',IncludeVAT:'YES',IncludeDiscount:'YES'
  }});
  const {rows} = parseTsv(tsv);
  const camps = rows.map(r => ({
    id: r.CampaignId||'', name: r.CampaignName||'—', type: r.CampaignType||'—',
    clicks: parseInt(r.Clicks)||0, impressions: parseInt(r.Impressions)||0,
    ctr: Math.round((parseFloat(r.Ctr)||0)*100)/100,
    cost: Math.round(parseFloat(r.Cost)||0),
    avgCpc: Math.round(parseFloat(r.AvgCpc)||0)
  })).sort((a,b)=>b.clicks-a.clicks);
  const totals = {
    clicks: camps.reduce((s,r)=>s+r.clicks,0),
    cost:   camps.reduce((s,r)=>s+r.cost,0),
    impressions: camps.reduce((s,r)=>s+r.impressions,0)
  };
  return {campaigns: camps, totals};
}

function fetchDirectKeywords(date1, date2) {
  const tsv = directReport({method:'get',params:{
    SelectionCriteria:{DateFrom:date1,DateTo:date2},
    FieldNames:['CampaignName','Criterion','Clicks','Impressions','Ctr','Cost','AvgCpc'],
    ReportName:'keywords_'+date1+'_'+date2,   // уникальное имя отчёта (требование API Директа)
    ReportType:'SEARCH_QUERY_PERFORMANCE_REPORT',DateRangeType:'CUSTOM_DATE',
    Format:'TSV',IncludeVAT:'YES',IncludeDiscount:'YES'
  }});
  const {rows} = parseTsv(tsv);
  return rows.map(r => ({
    keyword: r.Criterion||'—', campaign: r.CampaignName||'—',
    clicks: parseInt(r.Clicks)||0, impressions: parseInt(r.Impressions)||0,
    ctr: Math.round((parseFloat(r.Ctr)||0)*100)/100,
    cost: Math.round(parseFloat(r.Cost)||0),
    avgCpc: Math.round(parseFloat(r.AvgCpc)||0)
  })).sort((a,b)=>b.clicks-a.clicks).slice(0,100);
}

// ═══════════════════════════════════════════════════════════
// ЯНДЕКС МЕТРИКА
// ═══════════════════════════════════════════════════════════
function mFetch(id, params) {
  const qs = Object.entries({ids:id,...params}).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  const r = UrlFetchApp.fetch('https://api-metrika.yandex.net/stat/v1/data?'+qs,
    {headers:{'Authorization':'OAuth '+METRIKA_TOKEN}, muteHttpExceptions:true});
  return r.getResponseCode()===200 ? JSON.parse(r.getContentText()) : null;
}

function buildMetrikaData(date1, date2) {
  const result = {};
  const SRC_NAMES = {'ad':'Реклама','direct':'Прямые заходы','organic':'Поиск (SEO)',
    'internal':'Внутренние','referral':'Ссылки','social':'Соцсети',
    'email':'Email','recommendation':'Рекомендации','undefined':'Не определено'};

  for (const [site, cid] of Object.entries(METRIKA_IDS)) {
    const d = {visits:0,users:0,bounceRate:0,pageDepth:0,avgDuration:0,bySource:[],byUtm:[],trend:[]};

    const sum = mFetch(cid,{metrics:'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds',date1,date2,accuracy:'full'});
    if (sum&&sum.totals) {
      d.visits=Math.round(sum.totals[0]||0); d.users=Math.round(sum.totals[1]||0);
      d.bounceRate=Math.round(sum.totals[2]||0); d.pageDepth=Math.round((sum.totals[3]||0)*10)/10;
      d.avgDuration=Math.round(sum.totals[4]||0);
    }

    const bySrc = mFetch(cid,{dimensions:'ym:s:lastSignificantSource',metrics:'ym:s:visits,ym:s:users,ym:s:bounceRate',date1,date2,limit:20,sort:'-ym:s:visits',accuracy:'full'});
    if (bySrc&&bySrc.data) d.bySource=bySrc.data.map(row=>({
      source: SRC_NAMES[(row.dimensions[0].name||'').toLowerCase()]||row.dimensions[0].name||'—',
      visits:Math.round(row.metrics[0]),users:Math.round(row.metrics[1]),bounceRate:Math.round(row.metrics[2])
    }));

    const byUtm = mFetch(cid,{dimensions:'ym:s:UTMSource',metrics:'ym:s:visits,ym:s:users,ym:s:bounceRate',date1,date2,limit:20,sort:'-ym:s:visits',accuracy:'full'});
    if (byUtm&&byUtm.data) d.byUtm=byUtm.data
      .filter(row=>row.dimensions[0].name&&row.dimensions[0].name!=='(none)'&&row.dimensions[0].name!=='not set')
      .map(row=>({source:row.dimensions[0].name,visits:Math.round(row.metrics[0]),users:Math.round(row.metrics[1]),bounceRate:Math.round(row.metrics[2])}));

    const trend = mFetch(cid,{dimensions:'ym:s:date',metrics:'ym:s:visits,ym:s:users',date1,date2,sort:'ym:s:date',limit:100,accuracy:'full'});
    if (trend&&trend.data) d.trend=trend.data.map(row=>{
      const raw=row.dimensions[0].name||'';
      const dt=raw.length===8?raw.slice(6,8)+'.'+raw.slice(4,6):raw.slice(8,10)+'.'+raw.slice(5,7);
      return{date:dt,visits:Math.round(row.metrics[0]),users:Math.round(row.metrics[1])};
    });

    result[site]=d;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// AMO CRM
// ═══════════════════════════════════════════════════════════
// ВРЕМЕННАЯ ДИАГНОСТИКА (2026-08-18): amoFetch раньше молча глотал ошибки AmoCRM (401/400/…),
// из-за чего пустой ответ AmoCRM выглядел как «нет сделок за период» вместо явной ошибки.
// lastAmoError запоминает код и тело последнего неудачного запроса — buildAmoData прикладывает
// его к ответу, только если leads в итоге не нашлось (total===0), чтобы не засорять обычный ответ.
let lastAmoError = null;
function amoFetch(path) {
  try {
    const r=UrlFetchApp.fetch('https://'+AMO_DOMAIN+path,{headers:{'Authorization':'Bearer '+AMO_TOKEN},muteHttpExceptions:true});
    const code=r.getResponseCode();
    if(code!==200){ lastAmoError={path, code, body:r.getContentText().slice(0,500)}; return null; }
    return JSON.parse(r.getContentText());
  } catch(e){ lastAmoError={path, code:'exception', body:e.message}; return null; }
}

// Собирает признаки источника сделки за ОДИН проход по полям (раньше отдавал только строку):
//   raw      — строка источника: utm_source, иначе «Источник сделки Название» (кроме тех.значений)
//   medium   — utm_medium (платный трафик Директа помечен 'cpc')
//   srcName  — сырое «Источник сделки Название» (значение 'Интерфейс' → сделка заведена вручную)
//   campaign — utm_campaign (числовой = ID кампании Директа → тоже платная реклама; на будущее)
//
// ПРИОРИТЕТ источника (utm_source разложен на несколько полей AmoCRM):
//   1) «(utm_source) Сводный» — консолидированное значение (самое чистое)
//   2) «Источник (utm_source)» / «utm_source» — сырые поля
// «Запись на время» — это виджет онлайн-записи YClients, а НЕ источник трафика. На реале (июнь)
// он проставлен в Сводный у 174 сделок и маскирует реальный источник (у 108 он лежит в следующем
// поле: google / yandex_faamo_msk / (direct) …). Поэтому если поле = «запись» — пропускаем его.
function getSource(fields) {
  if (!fields) return {raw:'', medium:'', srcName:'', campaign:'', svod:''};
  let svod='', utmOther='', ct='', medium='', srcName='', campaign='';
  for (const f of fields) {
    const fn=(f.field_name||'').toLowerCase();
    const val=f.values&&f.values[0]?String(f.values[0].value||'').trim():'';
    if (!val||val==='<не заполнено>'||val==='0') continue;
    if (fn.includes('utm_source')) {                                         // «источник» — несколько полей
      if (fn.includes('сводн')) { if(!svod)svod=val; }                       //   Сводный — приоритет
      else if (!utmOther) utmOther=val;                                      //   Источник(utm_source) / utm_source
    }
    if (fn.includes('utm_medium'))   { if(!medium)medium=val; }
    if (fn.includes('utm_campaign')) { if(!campaign)campaign=val; }
    if (fn==='источник сделки название') {
      if(!srcName)srcName=val;                                              // сырое, включая 'Интерфейс'
      if(!ct&&!['Интерфейс','Виртуальная АТС МегаФон','Calltouch'].includes(val))ct=val;
    }
  }
  const isZap = v => v.toLowerCase().includes('запись');                    // «Запись на время» — не источник
  let utm='';
  for (const cand of [svod, utmOther]) { if (cand && !isZap(cand)) { utm=cand; break; } }
  return {raw: utm||ct||'', medium, srcName, campaign, svod};
}

// Классифицирует источник сделки. Вход — объект из getSource() {raw, medium, srcName, campaign, svod}.
//
// ПРИНЦИП 1 — тип трафика, а не «в строке встретилось yandex». Прежняя версия валила в «Яндекс
// Директ» ВСЁ яндексовое (реклама + органика + карты + ручной ввод) → 475/173 на июне вместо
// ~130/31 настоящей рекламы. Теперь по приоритету (важен порядок!):
//   а) карты (я.карты / гугл карты) → всегда ОРГАНИКА, даже если вдруг cpc;
//   б) платный признак utm_medium=cpc → реклама («Яндекс Директ» / «Google Ads»);
//   в) иначе → органика («Яндекс (органика)» / «Google (органика)»).
// Категории «Созданы вручную» БОЛЬШЕ НЕТ (это способ создания сделки, а не источник): ручные
// яндекс-сделки без cpc уходят в органику, где им и место.
//
// ПРИНЦИП 2 — склейка дублей ручного ввода. Менеджеры пишут источник кто как (регистр,
// сокращения, латиница/кириллица) — приводим к нижнему регистру и склеиваем по includes:
// direct/(direct)/прямой → «Прямой заход», любой «постоян» → «Постоянный клиент», и т.д.
// Внутренний мусор (*.amocrm.ru, utm_source='Интерфейс') → «Не указано».
function normSrc(src) {
  src = src || {};
  const raw    = src.raw || '';
  const medium = (src.medium || '').toLowerCase();
  const svod   = (src.svod || '').toLowerCase().trim();
  const s   = raw.toLowerCase().trim();
  const hay = (raw + ' ' + (src.medium || '')).toLowerCase();   // источник+канал: признак «карт» бывает и в utm_medium

  if (!s||s==='<не заполнено>'||s==='0') return 'Не указано';
  if (s.includes('amocrm.ru')||s==='интерфейс') return 'Не указано';   // внутренний мусор, не источник

  const isPaid = medium.includes('cpc');                              // платный трафик = utm_medium содержит cpc

  // ── КАРТЫ — всегда органика, приоритет ВЫШЕ cpc ──────────────────────────────
  if (hay.includes('geoadv')) return 'GeoAdv';
  if (hay.includes('карт')||hay.includes('/maps'))
    return (hay.includes('google')||hay.includes('гугл')) ? 'Google Карты' : 'Яндекс Карты';

  // ── ЯВНАЯ МЕТКА В «(UTM_SOURCE) СВОДНЫЙ» ─────────────────────────────────────
  // Значение 'Direct' или 'Яндекс Директ' в самом надёжном поле (Сводный) — это уже готовая
  // классификация от интеграции/оператора, доверяем ей раньше общей эвристики по utm_medium=cpc
  // (у части таких сделок medium не проставлен, и без этой проверки они уезжали бы в «Прямой
  // заход» через правило-склейку ниже вместо «Яндекс Директ»).
  if (svod.includes('direct')||svod.includes('директ')) return 'Яндекс Директ';

  // ── ЯНДЕКС по типу трафика ───────────────────────────────────────────────────
  const isYandex = s.includes('yandex')||s.includes('яндекс')||
                   s.includes('ya_')||/(^|[^a-zа-яё])ya([^a-zа-яё]|$)/.test(s)||
                   s.includes('директ')||s.includes('direkt')||s.includes('контекст');
  if (isYandex) return isPaid ? 'Яндекс Директ' : 'Яндекс (органика)';

  // ── GOOGLE по типу трафика ───────────────────────────────────────────────────
  if (s.includes('google')||s.includes('гугл')) return isPaid ? 'Google Ads' : 'Google (органика)';

  // ── Склейка дублей ручного ввода ─────────────────────────────────────────────
  if (s.includes('direct')||s.includes('прям')) return 'Прямой заход';            // Direct / (direct) / Прямой переход
  if (s.includes('постоян')||/пост\.\s*клиент/.test(s)) return 'Постоянный клиент';// постоянник / Пост. клиент
  if (s.includes('рекоменд')||s.includes('реферал')) return 'Рекомендации';
  if (s.includes('2гис')||s.includes('2gis')||s.includes('2 гис')) return '2GIS';
  if (s==='вк'||s.includes('vk')) return 'VK';                                     // вк / vk / vk.com / away.vk
  if (s.includes('telegram')||s.includes('тг')) return 'Telegram';
  if (s.includes('instagram')||s.includes('инстаграм')||s==='ig') return 'Instagram';
  if (s.includes('chatgpt')||s.includes('deepseek')||s.includes('deep seek')||
      s.includes('нейросет')||s.includes('perplexity')||
      /(^|[^а-яё])ии([^а-яё]|$)/.test(s)) return 'Нейросети (ИИ)';               // любые ИИ
  if (s.includes('whatsapp')) return 'WhatsApp';
  if (s.includes('max')) return 'MAX';                                            // Max: Рабочий Max / [MAX] Мах_Bot
  if (s.includes('запись на время')||s.includes('yclients')) return 'Запись YClients';
  if (s.includes('улиц')||s.includes('трафик магазин')) return 'С улицы / офлайн';
  return raw.trim()||'Другое';
}

function normCity(raw) {
  const s=(raw||'').toLowerCase().trim();
  if (s.includes('москв')||s.includes('msk')) return 'Москва';
  if (s.includes('петербург')||s.includes('спб')||s.includes('spb')||s.includes('питер')) return 'Санкт-Петербург';
  return raw.trim()||'Не указано';
}

function normSite(raw) {
  const s=(raw||'').toLowerCase().trim();
  if (/^\d+$/.test(s)||!s) return 'Не указано';
  if (s.includes('faamo')) return 'faamo.ru';
  if (s.includes('alfa')) return 'alfa-collection.ru';
  if (s.includes('kurtki')) return 'kurtki-i-parki.ru';
  if (s.includes('.ru')||s.includes('.com')) return raw.trim();
  return 'Не указано';
}

// Определяет сайт сделки КАСКАДОМ (первое поле, где сайт распознан) — раньше смотрели только
// «Название сайта в Calltouch», а оно заполнено лишь у 625 из 1488 сделок, поэтому воронки сайтов
// были почти пустыми. Порядок (важен!):
//   1) «Название сайта в Calltouch» — текст (faamo/alfa/kurtki) через normSite
//   2) «ID сайта в Calltouch» — числовой ID Calltouch (76080=faamo, 60736=alfa, 61430=kurtki)
//   3) «Ютм» — подстрока faamo/alfa (терпимо к опечаткам: 'alfa-collection' без .ru, 'faamo.r')
//   4) иначе — «Не указано» (в воронки сайтов не попадёт; в гео — отдельный бакет)
// Реал (июнь, 1488 сделок): распознавание alfa 446→723, faamo 179→274.
const CT_SITE_BY_ID = {'76080':'faamo.ru', '60736':'alfa-collection.ru', '61430':'kurtki-i-parki.ru'};
function getSite(fields) {
  const byName = normSite(gf(fields,['название сайта в calltouch','название сайта calltouch']));
  if (byName!=='Не указано') return byName;
  const id = (gf(fields,['id сайта в calltouch','id сайта calltouch'])||'').trim().replace(/\.0+$/,'');
  if (CT_SITE_BY_ID[id]) return CT_SITE_BY_ID[id];
  const utm = (gf(fields,['ютм'])||'').toLowerCase();
  if (utm.includes('faamo')) return 'faamo.ru';
  if (utm.includes('alfa'))  return 'alfa-collection.ru';
  return 'Не указано';
}

function gfRaw(fields, names) {
  if (!fields) return null;
  for (const f of fields) {
    const fn=(f.field_name||'').toLowerCase();
    for (const n of names) if (fn.includes(n.toLowerCase())) return (f.values && f.values[0]) || null;
  }
  return null;
}
function gf(fields, names) {
  const v = gfRaw(fields, names);
  return v ? String(v.value||'').trim() : '';
}
// enum_id варианта выпадающего списка (для select-полей типа «Причина») — устойчив к любым
// расхождениям в ТЕКСТЕ значения (регистр, опечатка, лишний пробел — в т.ч. и в самой опции
// AmoCRM). Раньше «Причина» сравнивалась по тексту через PRICHINA_MAP, и из-за этого «Тест»/
// «Передумал» не склеивались с одноимёнными сделками — см. историю. enum_id таких проблем не даёт.
function gfEnumId(fields, names) {
  const v = gfRaw(fields, names);
  return (v && v.enum_id != null) ? v.enum_id : null;
}

// ═══════════════════════════════════════════════════════════
// ПРИЧИНЫ ОТКАЗОВ — гибридная классификация
// ═══════════════════════════════════════════════════════════
// ШАГ 1 — поле «Причина» (выпадающий список, id 849145 в AmoCRM). Если оператор выбрал конкретное
// значение (не «Другая причина» и не пусто) — доверяем ему напрямую, текст не разбираем.
// Полный список опций получен из API (GET /api/v4/leads/custom_fields, см. tab=fields_debug) —
// намеренно НЕ ограничивались значениями из одной выборки сделок, чтобы не пропустить редкие
// опции вроде «Спам»/«Тест», которые в конкретном экспорте могли не встретиться.
// isJunk=true → «мусорный лид» (не реальный отказ от покупки, в бизнес-метрику продаж не идёт).
//
// Решения по неоднозначным значениям (согласованы с заказчиком 2026-08-18):
//   • «В ожидание» → «Передумал / отложил решение» (решение ещё не принято, клиент думает)
//   • «Возврат» → отдельная категория «Возврат» (это не отказ от покупки, а уже состоявшаяся
//     продажа, которую вернули, — смешивать с обычными отказами некорректно)
//   • «Пришел но не купил» → «Не понравился ассортимент / модель» (визит состоялся, но товар
//     не подошёл — по смыслу то же самое, что и обычное «не понравился ассортимент»)
function stripSp(s) { return (s||'').toLowerCase().replace(/[^a-zа-яё0-9]/g,''); }

// Ключ — enum_id варианта из AmoCRM (см. tab=fields_debug), а НЕ текст: раньше карта была на
// строках (типа 'тест') и «Тест»/«тест» или «Передумал»/«Передумал / отложил решение» не
// склеивались в одну категорию при малейшем расхождении в написании самой опции AmoCRM (регистр,
// опечатка, лишний пробел — эти расхождения бывают в самом списке, а не только в комментариях
// операторов). enum_id такой проблемы не имеет вообще. textKey — резервный путь на случай, если
// у какой-то сделки AmoCRM почему-то не прислал enum_id; сравнение там тоже идёт через stripSp().
const PRICHINA_RULES = [
  {id:1304877, textKey:'не подошёл размер',                  category:'Нет в наличии / нет нужного размера', isJunk:false},
  {id:1304879, textKey:'не понравился ассортимент / модель', category:'Не понравился ассортимент / модель',  isJunk:false},
  {id:1304881, textKey:'передумал / отложил решение',        category:'Передумал / отложил решение',         isJunk:false},
  {id:1304883, textKey:'не приехал',                         category:'Не приехал / не дошёл',               isJunk:false},
  {id:1304887, textKey:'в ожидание',                         category:'Передумал / отложил решение',         isJunk:false},
  {id:1305005, textKey:'дорого',                             category:'Дорого',                              isJunk:false},
  {id:1320971, textKey:'возврат',                            category:'Возврат',                             isJunk:false},
  {id:1320973, textKey:'пришел но не купил',                 category:'Не понравился ассортимент / модель',  isJunk:false},
  {id:1321191, textKey:'уже купил в другом месте',           category:'Уже купил в другом месте',            isJunk:false},
  {id:1321193, textKey:'передумал',                          category:'Передумал / отложил решение',         isJunk:false},
  {id:1321195, textKey:'не дозвонились',                     category:'Не дозвонились (финально)',           isJunk:false},
  {id:1323321, textKey:'спам',                               category:'Спам / реклама',                      isJunk:true},
  {id:1323323, textKey:'тест',                               category:'Тест',                                isJunk:true}
  // id:1304885 «Другая причина» намеренно НЕ в списке — для него идём на ШАГ 2 (текст)
];
const PRICHINA_BY_ID = {}; PRICHINA_RULES.forEach(function(r){ PRICHINA_BY_ID[r.id]=r; });
const PRICHINA_BY_TEXT = {}; PRICHINA_RULES.forEach(function(r){ PRICHINA_BY_TEXT[stripSp(r.textKey)]=r; });

// ШАГ 2 — если «Причина» = «Другая причина» или пусто, разбираем «Комментарий отказа» (свободный
// текст оператора колл-центра) по ключевым словам. ПОРЯДОК ВАЖЕН: правила проверяются по очереди,
// побеждает первое совпадение. «Дубль» стоит первым намеренно — это явная, однозначная пометка
// оператора, и без приоритета над «Ошиблись номером» комментарии вида «дубль, сказал не оставлял
// заявки» уезжали бы не в ту категорию. Сравнение — по строке БЕЗ пробелов/пунктуации (см.
// stripSp), это гасит разрывы пробелами внутри слов у операторов («не ост авлял заявки»).
//
// Откалибровано на реальном экспорте 97 отказов (2026-08-18) — сверено с пользователем построчно.
// Часть комментариев (единичные, без обобщаемого паттерна, или с опечаткой, которую substring-
// сравнение не ловит: например «арнду» вместо «аренду») намеренно НЕ покрыты отдельным ключевым
// словом — заводить под один нетипичный пример узкое правило рискованнее (ложные срабатывания на
// не связанных комментариях), чем оставить его в «Другая причина». Дополнять список по мере
// появления НОВЫХ повторяющихся формулировок — больше ничего в коде трогать не нужно.
const REFUSAL_TEXT_RULES = [
  {category:'Тест',              isJunk:true,  keywords:['тест']},
  {category:'Дубль / задвоение', isJunk:false, keywords:['дубль','уже записывались','звонила на себя']},
  {category:'Спам / реклама',    isJunk:true,  keywords:['спам','реклама']},
  {category:'Ошиблись номером',  isJunk:true,  keywords:['ошиб','не оставля','номер не найден','не понимаю что за обращен','не в курсе','не помнит']},

  {category:'Другой город / география',            isJunk:false, keywords:['екб','из курска','в ростове','из ростова','другой город']}, // дополнять городами по мере появления; НЕ 'ростов' само по себе — коллизия с «ростовок» (размерная сетка по росту, см. строку 26 калибровочного набора)
  {category:'Дорого',                              isJunk:false, keywords:['дорог','не устроила цен','цена-качеств','цена качеств']},
  {category:'Нет в наличии / нет нужного размера', isJunk:false, keywords:['нет в наличи','нет размер','не оказалось','нет таких','нет их','нет того']},
  {category:'Не понравился ассортимент / модель',  isJunk:false, keywords:['не подходит модел','не нашёл что хотел','не нашел что хотел','не устроил вариант','нет нужной модел','мало ассортимента']},
  {category:'Уже купил в другом месте',            isJunk:false, keywords:['купил в др месте','купила в','купил в другом месте','неактуально купили','сделал заказ','сделала заказ']},
  {category:'Не по теме / не наша услуга',         isJunk:false, keywords:['аренда','прокат','интересовался работой','вакансия']},
  {category:'Не дозвонились (финально)',           isJunk:false, keywords:['игнор','не отвечает']},
  {category:'Передумал / отложил решение',         isJunk:false, keywords:['передумал','будет думать','не актуально','неактуально','вернет']},
  {category:'Не приехал / не дошёл',               isJunk:false, keywords:['не приехал','не пришёл','не пришел']}
];

function classifyByText(comment) {
  const c = stripSp(comment);
  if (!c) return {category:'Другая причина', isJunk:false};
  for (const rule of REFUSAL_TEXT_RULES) {
    for (const kw of rule.keywords) {
      if (c.includes(stripSp(kw))) return {category:rule.category, isJunk:rule.isJunk};
    }
  }
  return {category:'Другая причина', isJunk:false};
}

// Гибридная классификация: ШАГ 1 (поле «Причина», по enum_id) приоритетнее ШАГ 2 (текст).
function classifyRefusal(prichinaId, prichinaText, comment) {
  if (prichinaId!=null && PRICHINA_BY_ID[prichinaId]) return PRICHINA_BY_ID[prichinaId];
  const t = stripSp(prichinaText);
  if (t && t!==stripSp('другая причина') && PRICHINA_BY_TEXT[t]) return PRICHINA_BY_TEXT[t];
  return classifyByText(comment);
}

// Забирает сделки из ВСЕХ реальных воронок (PIPES_ALLOWED) — технические воронки отсекаются
// самим API через мультифильтр filter[pipeline_id][]=…, поэтому лишние сделки даже не качаются
// (на июне это экономит ~891 сделку автопрозвона + 289 роботных копий = 1180 из 2637).
// Лимит страниц поднят с 20 до 40: воронок стало больше, объём вырос.
function fetchLeads(fromTs, toTs) {
  const pipeQs = PIPES_ALLOWED.map(id=>`filter[pipeline_id][]=${id}`).join('&');
  const all=[]; let page=1;
  while (true) {
    const d=amoFetch(`/api/v4/leads?with=custom_fields&limit=250&page=${page}&filter[created_at][from]=${fromTs}&filter[created_at][to]=${toTs}&${pipeQs}`);
    if (!d) break;
    const items=d._embedded&&d._embedded.leads?d._embedded.leads:[];
    if (!items.length) break;
    all.push(...items); if(items.length<250)break; page++; if(page>40)break;
  }
  return all;
}

// Классификация сделки с учётом воронки. Возвращает одно из:
//   'bought'   — продажа
//   'lost'     — отказ
//   'supply'   — «Ждут поставку»: ни продажа, ни отказ, и НЕ «в работе»
//   'delivery' — «В доставке»: заказ оформлен, товар в пути, продажа ещё НЕ засчитана
//   'active'   — в работе
//
// Решения по воронкам (заданы заказчиком):
//   • Условный отказ (10217962) — вся воронка = ОТКАЗ, статус внутри не смотрим.
//   • Доставка по РФ (10809230) — НИКОГДА не продажа, даже если статус внутри = 142. Продажа
//     засчитывается только когда сделка физически переедет в «Продажи» со статусом 142.
//     (на реале это 4 сделки со статусом 142 за 7.5 мес — они сознательно не идут в bought)
//   • Ждут поставку (10217954) — если поставка пришла и сделку закрыли (142) или отказались (143),
//     это уже состоявшийся исход и он считается; всё остальное = категория «Ждут поставку».
//   • Продажи (8708346) и Х/Б (11157782) — обычная логика по status_id.
function classifyLead(l) {
  const p = l.pipeline_id;
  if (p === PIPE_COND_LOST) return 'lost';
  if (p === PIPE_DELIVERY)  return 'delivery';
  if (p === PIPE_SUPPLY) {
    if (l.status_id === STATUS_BOUGHT) return 'bought';
    if (l.status_id === STATUS_LOST)   return 'lost';
    return 'supply';
  }
  if (l.status_id === STATUS_BOUGHT) return 'bought';
  if (l.status_id === STATUS_LOST)   return 'lost';
  return 'active';
}

// Источник сделки с учётом воронки: у сделок Х/Б источник — всегда «Холодный обзвон»,
// независимо от utm-полей (это обзвон холодной базы, а не рекламный трафик, и смешивать его
// с Директом/Google нельзя). Для остальных воронок — обычная классификация по полям.
function leadSource(l) {
  if (l.pipeline_id === PIPE_COLD) return 'Холодный обзвон';
  return normSrc(getSource(l.custom_fields_values||[]));
}

// Воронка по конкретному сайту: накопительно по этапам (Заявка → Пригласили → Посетил → Купили).
// siteName — значение из normSite ('faamo.ru' | 'alfa-collection.ru'). Логика та же, что у общей
// воронки CRM: этап засчитан, если текущий статус сделки достиг его порядка (o >= порог); «Отказ»
// (143) в STAGES отсутствует, поэтому в этапы не попадает, но в total (все заявки сайта) учтён.
// Формат ответа = то, что ждёт renderSiteFunnel во фронте: {total,invited,visited,bought,conv1..4}.
function calcSiteFunnel(leads, siteName) {
  const stOrd={}; STAGES.forEach((s,i)=>stOrd[s.id]=i);
  const oInvited=stOrd[70537278];        // «Пригласили в магазин»
  const oVisited=stOrd[71298010];        // «Посетил магазин»
  const oBought =stOrd[STATUS_BOUGHT];   // «Купили»
  let total=0,invited=0,visited=0,bought=0;
  for(const l of leads){
    if(l.pipeline_id!==PIPE_SALES)continue;   // этапы STAGES существуют только в воронке «Продажи»
    const f=l.custom_fields_values||[];
    if(getSite(f)!==siteName)continue;
    total++;
    const o=stOrd[l.status_id];
    if(o===undefined)continue;           // «Отказ» (143) — нет в этапах, как и в общей воронке
    if(o>=oInvited)invited++;
    if(o>=oVisited)visited++;
    if(o>=oBought )bought++;
  }
  const pct=(a,b)=>b>0?Math.round(a/b*100):0;
  return {total,invited,visited,bought,
    conv1:pct(invited,total),     // Заявка → Пригласили
    conv2:pct(visited,invited),   // Пригласили → Посетил
    conv3:pct(bought,visited),    // Посетил → Купили
    conv4:pct(bought,total)};     // Заявка → Купили (итого)
}

function buildAmoData(fromTs, toTs) {
  const leads=fetchLeads(fromTs,toTs);
  const umap={}; const ud=amoFetch('/api/v4/users?limit=50');
  if(ud&&ud._embedded) for(const u of ud._embedded.users||[]) umap[u.id]=u.name;

  // Счётчики по классификации с учётом воронки (см. classifyLead).
  // «Ждут поставку» и «В доставке» — отдельные категории: они НЕ входят ни в bought, ни в active,
  // поэтому total = bought + lost + active + supply + delivery.
  const total=leads.length;
  let bought=0, lost=0, active=0, supply=0, delivery=0;
  const supplyIds=[], deliveryIds=[];
  for(const l of leads){
    switch(classifyLead(l)){
      case 'bought':   bought++; break;
      case 'lost':     lost++;   break;
      case 'supply':   supply++;   if(supplyIds.length<50)supplyIds.push(l.id);   break;
      case 'delivery': delivery++; if(deliveryIds.length<50)deliveryIds.push(l.id); break;
      default:         active++;
    }
  }
  // «Посетил магазин» — этап воронки «Продажи»; статус 142 общий для всех воронок, поэтому без
  // фильтра по воронке сюда попадали бы покупки из Х/Б и «Ждут поставку», которые в магазине не были.
  const visitedCount=leads.filter(l=>l.pipeline_id===PIPE_SALES&&VISITED_IDS.has(l.status_id)).length;
  const visitedPct=total>0?Math.round(visitedCount/total*100):0;

  // Воронка накопительно — ТОЛЬКО по воронке «Продажи»: STAGES описывает её этапы, а у остальных
  // воронок свои статусы. Статусы 142/143 общие, поэтому без этого фильтра сделки из Х/Б,
  // «Ждут поставку» и «Условного отказа» протекали бы через все этапы и раздували воронку.
  const stOrd={}; STAGES.forEach((s,i)=>stOrd[s.id]=i);
  const stMap={};
  for(const l of leads){
    if(l.pipeline_id!==PIPE_SALES)continue;
    const o=stOrd[l.status_id];if(o===undefined)continue;
    for(let i=0;i<=o;i++)stMap[STAGES[i].id]=(stMap[STAGES[i].id]||0)+1;
  }
  const funnel=STAGES.map(s=>({name:s.name,count:stMap[s.id]||0})).filter(s=>s.count>0);

  // Менеджеры — операционная аналитика
  const mgrMap={};
  for(const l of leads){
    const uid=l.responsible_user_id; if(!uid)continue;
    if(!mgrMap[uid])mgrMap[uid]={
      name:umap[uid]||'ID:'+uid,
      leads:0,bought:0,lost:0,visited:0,active:0,unprocessed:0,supply:0,delivery:0,
      byStage:{},                                    // {status_id: кол-во} — текущее распределение по этапам (мини-воронка)
      leadIds:[],boughtIds:[],activeIds:[],unprocessedIds:[]
    };
    const m=mgrMap[uid];
    const cls=classifyLead(l);
    m.leads++;
    if(m.leadIds.length<50)m.leadIds.push(l.id);
    // Мини-воронка и «Посетил магазин» — только по «Продажам» (STAGES = её этапы, см. выше)
    if(l.pipeline_id===PIPE_SALES){
      m.byStage[l.status_id]=(m.byStage[l.status_id]||0)+1;
      if(VISITED_IDS.has(l.status_id))m.visited++;
    }
    if(cls==='bought'){m.bought++;if(m.boughtIds.length<50)m.boughtIds.push(l.id);}
    if(cls==='lost')m.lost++;
    if(cls==='supply')m.supply++;
    if(cls==='delivery')m.delivery++;
    // В работе: не продажа, не отказ, и НЕ «ждут поставку»/«в доставке» (это отдельные категории)
    if(cls==='active'){m.active++;if(m.activeIds.length<50)m.activeIds.push(l.id);}
    // Необработанные: ТОЛЬКО «Новая заявка» (Недозвон = уже касание менеджера, НЕ считаем)
    if(l.status_id===STATUS_NEW){m.unprocessed++;if(m.unprocessedIds.length<50)m.unprocessedIds.push(l.id);}
  }
  const managers=Object.values(mgrMap).sort((a,b)=>b.leads-a.leads);

  // ГЕО: дерево (город→сайт→источник) + плоская таблица связок geoFlat (для сорт/поиск и разреза
  // по сайтам в Директе). Обе структуры строим за один проход. getSource/getSite считаем 1 раз.
  const geoMap={}, flatMap={};
  for(const l of leads){
    const f=l.custom_fields_values||[];
    const city=normCity(gf(f,['регион','город','city','region']));
    const site=getSite(f);
    const src=leadSource(l);
    const cls=classifyLead(l);
    const isB=cls==='bought', isL=cls==='lost';
    if(!geoMap[city])geoMap[city]={leads:0,bought:0,sites:{}};
    geoMap[city].leads++;if(isB)geoMap[city].bought++;
    if(!geoMap[city].sites[site])geoMap[city].sites[site]={leads:0,bought:0,sources:{}};
    geoMap[city].sites[site].leads++;if(isB)geoMap[city].sites[site].bought++;
    if(!geoMap[city].sites[site].sources[src])geoMap[city].sites[site].sources[src]={leads:0,bought:0};
    geoMap[city].sites[site].sources[src].leads++;if(isB)geoMap[city].sites[site].sources[src].bought++;
    // плоская связка город|сайт|источник
    const fk=city+'|||'+site+'|||'+src;
    if(!flatMap[fk])flatMap[fk]={city,site,source:src,leads:0,bought:0,lost:0,leadIds:[],boughtIds:[]};
    const fm=flatMap[fk];
    fm.leads++; if(fm.leadIds.length<50)fm.leadIds.push(l.id);
    if(isB){fm.bought++;if(fm.boughtIds.length<50)fm.boughtIds.push(l.id);}
    if(isL)fm.lost++;
  }
  const geo=Object.entries(geoMap).sort((a,b)=>b[1].leads-a[1].leads).map(([city,cv])=>({
    city,leads:cv.leads,bought:cv.bought,
    sites:Object.entries(cv.sites).sort((a,b)=>b[1].leads-a[1].leads).map(([site,sv])=>({
      site,leads:sv.leads,bought:sv.bought,
      sources:Object.entries(sv.sources).sort((a,b)=>b[1].leads-a[1].leads).map(([s,v])=>({source:s,leads:v.leads,bought:v.bought}))
    }))
  }));
  const geoFlat=Object.values(flatMap).map(r=>({
    city:r.city, site:r.site, source:r.source, leads:r.leads, bought:r.bought, lost:r.lost,
    conv:r.leads>0?Math.round(r.bought/r.leads*100):0, leadIds:r.leadIds, boughtIds:r.boughtIds
  })).sort((a,b)=>b.leads-a.leads);

  // Источники — с отказами, конверсией и drill-down ID (заявки/продажи/отказы кликабельны)
  const srcMap={};
  for(const l of leads){
    const s=leadSource(l);
    const cls=classifyLead(l);
    if(!srcMap[s])srcMap[s]={leads:0,bought:0,lost:0,leadIds:[],boughtIds:[],lostIds:[]};
    const sm=srcMap[s]; sm.leads++; if(sm.leadIds.length<50)sm.leadIds.push(l.id);
    if(cls==='bought'){sm.bought++;if(sm.boughtIds.length<50)sm.boughtIds.push(l.id);}
    if(cls==='lost'){sm.lost++;if(sm.lostIds.length<50)sm.lostIds.push(l.id);}
  }
  const sources=Object.entries(srcMap).map(([name,v])=>({
    name, leads:v.leads, bought:v.bought, lost:v.lost,
    conv:v.leads>0?Math.round(v.bought/v.leads*100):0,
    leadIds:v.leadIds, boughtIds:v.boughtIds, lostIds:v.lostIds
  })).sort((a,b)=>b.leads-a.leads);

  // ГОРОД → КАНАЛ (источник+кампания): для ROI-разреза «город × канал» на вкладке Директ
  const ccMap={};
  for(const l of leads){
    const f=l.custom_fields_values||[];
    const city=normCity(gf(f,['регион','город','city','region']));
    const so=getSource(f);
    const src=leadSource(l), camp=so.campaign||'';
    const isB=classifyLead(l)==='bought';
    if(!ccMap[city])ccMap[city]={};
    const k=src+'|||'+camp;
    if(!ccMap[city][k])ccMap[city][k]={src,camp,leads:0,bought:0};
    ccMap[city][k].leads++; if(isB)ccMap[city][k].bought++;
  }
  const cityChannels=Object.entries(ccMap).map(([city,chans])=>({
    city, channels:Object.values(chans).sort((a,b)=>b.leads-a.leads)
  })).sort((a,b)=>b.channels.reduce((s,c)=>s+c.leads,0)-a.channels.reduce((s,c)=>s+c.leads,0));

  // Причины отказов (только сделки в статусе «Отказ») — гибридная классификация classifyRefusal()
  // (ШАГ 1: поле «Причина», ШАГ 2: текст «Комментарий отказа»). Считаем отказом всё, что
  // классифицировано как 'lost' — включая целиком воронку «Условный отказ» (её сделки лежат в
  // статусе «Клиент в отказе», а не в системном 143); там «Причина»/«Комментарий» обычно не
  // заполнены, поэтому такие сделки маркируем явно, не гоняя пустой текст через ШАГ 2.
  // byCity/bySite — для разрезов «Причины отказов» по городам/сайтам на новой вкладке.
  // refusalFlat — связка город|сайт|источник|причина (по образцу geoFlat выше), нужна для
  // дерева на вкладке «Отказы» (разрезы Города/Сайты/Источники, каждая причина внутри группы
  // кликабельна отдельно — иначе drill-down показывал бы сделки этой причины СО ВСЕХ городов).
  const refMap={}, refFlatMap={};
  for(const l of leads){
    if(classifyLead(l)!=='lost')continue;
    const f=l.custom_fields_values||[];
    const prichinaId=gfEnumId(f,['причина']);
    const prichinaText=gf(f,['причина']);
    const comment=gf(f,['комментарий отказа']);
    const cls = (prichinaId==null && !prichinaText && !comment && l.pipeline_id===PIPE_COND_LOST)
      ? {category:'Условный отказ', isJunk:false}
      : classifyRefusal(prichinaId, prichinaText, comment);
    const city=normCity(gf(f,['регион','город','city','region']));
    const site=getSite(f);
    const src=leadSource(l);
    const key=cls.category;
    const item={id:l.id, comment:(comment||'').slice(0,200)};

    if(!refMap[key])refMap[key]={reason:key,isJunk:cls.isJunk,count:0,byCity:{},bySite:{},bySource:{},ids:[],items:[]};
    const rm=refMap[key];
    rm.count++;
    rm.byCity[city]=(rm.byCity[city]||0)+1;
    rm.bySite[site]=(rm.bySite[site]||0)+1;
    rm.bySource[src]=(rm.bySource[src]||0)+1;
    // items — для попапа drill-down с текстом комментария; ids оставлены отдельно для обратной
    // совместимости со старым блоком «Причины отказов» на CRM/Воронка.
    if(rm.ids.length<50){rm.ids.push(l.id); rm.items.push(item);}

    const fk=city+'|||'+site+'|||'+src+'|||'+key;
    if(!refFlatMap[fk])refFlatMap[fk]={city,site,source:src,reason:key,isJunk:cls.isJunk,count:0,ids:[],items:[]};
    const fm=refFlatMap[fk];
    fm.count++;
    if(fm.ids.length<50){fm.ids.push(l.id); fm.items.push(item);}
  }
  const refusalReasons=Object.values(refMap).sort((a,b)=>b.count-a.count);
  const refusalFlat=Object.values(refFlatMap);

  // Яндекс из CRM
  const ydMap={};
  for(const l of leads){
    const f=l.custom_fields_values||[];
    if(leadSource(l)!=='Яндекс Директ')continue;
    const term=gf(f,['utm_term','ключевое слово','keyword'])||'—';
    const camp=gf(f,['utm_campaign','кампания'])||'—';
    const isB=classifyLead(l)==='bought';
    const key=term+'|||'+camp;
    if(!ydMap[key])ydMap[key]={term,campaign:camp,leads:0,bought:0};
    ydMap[key].leads++;if(isB)ydMap[key].bought++;
  }
  const yandex=Object.values(ydMap).sort((a,b)=>b.leads-a.leads).map(r=>({...r,conv:r.leads>0?Math.round(r.bought/r.leads*100):0}));

  // Тренд
  const tMap={};
  for(const l of leads){
    if(!l.created_at)continue;
    const d=new Date(l.created_at*1000);
    const key=d.getDate().toString().padStart(2,'0')+'.'+(d.getMonth()+1).toString().padStart(2,'0');
    if(!tMap[key])tMap[key]={leads:0,bought:0,ts:l.created_at};
    tMap[key].leads++;if(classifyLead(l)==='bought')tMap[key].bought++;
  }
  const trendAmo=Object.entries(tMap).sort((a,b)=>a[1].ts-b[1].ts).map(([date,v])=>({date,leads:v.leads,bought:v.bought}));

  // Воронки по сайтам (под-вкладка CRM → Воронка): faamo.ru и alfa-collection.ru
  const faamoFunnel=calcSiteFunnel(leads,'faamo.ru');
  const alfaFunnel =calcSiteFunnel(leads,'alfa-collection.ru');

  // Диагностика по воронкам: сколько сделок пришло из каждой. Позволяет убедиться, что технические
  // воронки действительно отсечены (их id здесь отсутствуют) и увидеть объём новых категорий.
  const byPipeline={};
  for(const l of leads){
    const nm=PIPE_NAMES[l.pipeline_id]||('id:'+l.pipeline_id);
    byPipeline[nm]=(byPipeline[nm]||0)+1;
  }

  return{total,bought,lost,active,supply,delivery,supplyIds,deliveryIds,
    visitedCount,visitedPct,funnel,faamoFunnel,alfaFunnel,
    managers,geo,geoFlat,sources,yandex,cityChannels,refusalReasons,refusalFlat,trendAmo,
    byPipeline, excludedPipelines:PIPES_EXCLUDED.map(id=>PIPE_NAMES[id]),
    debugAmoError: total===0 ? lastAmoError : undefined};
}

// ═══════════════════════════════════════════════════════════
// ЕЖЕДНЕВНЫЙ ОТЧЁТ В GOOGLE ТАБЛИЦУ (для CEO)
// ═══════════════════════════════════════════════════════════
// Живой журнал: раз в день (триггер 23:30 МСК, см. installDailyTrigger) дописывает по одной
// строке в каждый из 4 листов за ПРОШЕДШИЕ сутки. Источник данных — buildAmoData(), та же самая
// проверенная логика, что и у дашборда; здесь ничего не пересчитывается заново.
//
// Настройка (см. README-APPS-SCRIPT.md):
//   1. Создать отдельную Google Таблицу (НЕ ту, что уже используется под звонки МегаФона).
//   2. ID таблицы — из URL (.../spreadsheets/d/ЭТОТ_ID/edit) → Script Properties → REPORT_SHEET_ID.
//   3. Прогнать testDailyReport() вручную, свериться с числами.
//   4. Прогнать installDailyTrigger() один раз — ставит ежедневный триггер на 23:30.
//   5. ВАЖНО: 23:30 — это 23:30 часового пояса ПРОЕКТА Apps Script (Настройки проекта → Часовой
//      пояс), не обязательно МСК! Если у проекта другой часовой пояс — либо смените его на
//      Europe/Moscow, либо поменяйте час в installDailyTrigger() под нужное МСК-время.

// Укрупнение источников (normSrc даёт более дробные категории) — порядок не важен, это плоский
// маппинг конкретных значений. 'Другие' — всё, что не перечислено явно (Telegram/MAX/VK/
// WhatsApp/2GIS/Рекомендации/Нейросети/Не указано/GeoAdv и т.д.). Дополнять по мере появления
// новых категорий в normSrc, если заказчик попросит вынести что-то из «Другие» отдельно.
const SOURCE_BUCKETS = ['Яндекс Директ','Яндекс (органика+Карты)','Google','Прямой заход',
  'Постоянный клиент','Холодный обзвон','Запись YClients','Другие'];
function mapSourceBucket(name) {
  if (name==='Яндекс Директ') return 'Яндекс Директ';
  if (name==='Яндекс (органика)'||name==='Яндекс Карты') return 'Яндекс (органика+Карты)';
  if (name==='Google Ads'||name==='Google (органика)'||name==='Google Карты') return 'Google';
  if (name==='Прямой заход') return 'Прямой заход';
  if (name==='Постоянный клиент') return 'Постоянный клиент';
  if (name==='Холодный обзвон') return 'Холодный обзвон';
  if (name==='Запись YClients') return 'Запись YClients';
  return 'Другие';
}

// Считает все 4 среза за вчера (00:00–23:59 МСК). Ничего не пишет — можно дёргать сколько
// угодно раз для проверки (в т.ч. через ?tab=report_debug в doGet, без REPORT_SHEET_ID).
function computeDailyReport() {
  const period = resolvePeriod({period:'yesterday'});
  const raw = buildAmoData(period.fromTs, period.toTs);
  const dateLabel = Utilities.formatDate(new Date(period.fromTs*1000), 'Europe/Moscow', 'dd.MM.yyyy');

  // ОБЩЕЕ: «Спам» = ВЕСЬ мусор (Спам/реклама + Тест + Ошиблись номером — isJunk=true одним числом)
  const refusals = raw.refusalReasons || [];
  const realRefusals = refusals.filter(r=>!r.isJunk).reduce((s,r)=>s+r.count,0);
  const junkRefusals = refusals.filter(r=>r.isJunk).reduce((s,r)=>s+r.count,0);
  const conv = raw.total>0 ? Math.round(raw.bought/raw.total*10000)/100 : 0; // % с 2 знаками
  const overall = {leads:raw.total, bought:raw.bought, realRefusals, junkRefusals, conv};

  // ПО ГОРОДАМ: заявки/продажи из geo[], отказы/спам агрегируем из refusalFlat по city.
  // Только Москва и СПб (как в ТЗ) — прочие города («Не указано», региональные) в отчёт не идут.
  const CITIES = ['Москва','Санкт-Петербург'];
  const geoByCity = {}; (raw.geo||[]).forEach(g=>{ geoByCity[g.city]=g; });
  const cityRefusal = {};
  (raw.refusalFlat||[]).forEach(r=>{
    const c = cityRefusal[r.city] || (cityRefusal[r.city]={real:0,junk:0});
    if (r.isJunk) c.junk+=r.count; else c.real+=r.count;
  });
  const cities = {};
  CITIES.forEach(c=>{
    const g = geoByCity[c] || {leads:0,bought:0};
    const rf = cityRefusal[c] || {real:0,junk:0};
    cities[c] = {leads:g.leads||0, bought:g.bought||0, realRefusals:rf.real, junkRefusals:rf.junk};
  });

  // ПО САЙТАМ: заявки/продажи агрегируем из geoFlat по site (несколько city → один site),
  // отказы/спам — из refusalFlat по site. Только faamo.ru и alfa-collection.ru (как в ТЗ).
  const SITES = ['faamo.ru','alfa-collection.ru'];
  const siteLeads = {};
  (raw.geoFlat||[]).forEach(r=>{
    const s = siteLeads[r.site] || (siteLeads[r.site]={leads:0,bought:0});
    s.leads += r.leads; s.bought += r.bought;
  });
  const siteRefusal = {};
  (raw.refusalFlat||[]).forEach(r=>{
    const s = siteRefusal[r.site] || (siteRefusal[r.site]={real:0,junk:0});
    if (r.isJunk) s.junk+=r.count; else s.real+=r.count;
  });
  const sites = {};
  SITES.forEach(s=>{
    const l = siteLeads[s] || {leads:0,bought:0};
    const rf = siteRefusal[s] || {real:0,junk:0};
    sites[s] = {leads:l.leads, bought:l.bought, realRefusals:rf.real, junkRefusals:rf.junk};
  });

  // ПО ИСТОЧНИКАМ: укрупняем sources[] (там уже leads/bought по normSrc-категориям) через
  // mapSourceBucket. Отказы/спам по источникам в ТЗ не запрошены — только заявки+продажи.
  const sources = {};
  SOURCE_BUCKETS.forEach(b=>{ sources[b]={leads:0,bought:0}; });
  (raw.sources||[]).forEach(s=>{
    const bucket = mapSourceBucket(s.name);
    sources[bucket].leads += s.leads;
    sources[bucket].bought += s.bought;
  });

  return {date:dateLabel, overall, cities, sites, sources};
}

// БЫЛО: сравнение через Utilities.formatDate(cellVal,'Europe/Moscow',...) — сломалось, потому что
// Google Таблицы сами превращают текст "17.08.2026" в дату по ЧАСОВОМУ ПОЯСУ ТАБЛИЦЫ (у заказчика
// это оказался Asia/Bangkok, не Europe/Moscow), и обратное форматирование в MSK съезжало на день.
// СТАЛО: сравниваем в часовом поясе САМОЙ ТАБЛИЦЫ (ss.getSpreadsheetTimeZone()) — том же самом,
// по которому Таблицы её и распознали при автоконвертации, поэтому день не съезжает независимо
// от того, в каком часовом поясе живёт сама таблица. setNumberFormat('@') в upsertRow_ ниже
// выставлен как попытка вообще не дать Таблицам конвертировать текст в дату — на практике Таблицы
// иногда всё равно конвертируют при записи через API, поэтому нельзя полагаться только на него;
// именно поэтому сравнение по часовому поясу таблицы — основная защита, а не текстовый формат.
function sameDate_(ss, cellVal, dateLabel) {
  if (cellVal instanceof Date) return Utilities.formatDate(cellVal, ss.getSpreadsheetTimeZone(), 'dd.MM.yyyy') === dateLabel;
  return String(cellVal||'').trim() === dateLabel;
}

// Идемпотентная запись строки: ищет строку с такой же датой в столбце A — если нашла,
// перезаписывает её значения; если нет — дописывает новую. headers пишутся один раз (на
// новый/пустой лист) и не трогаются при повторных запусках. Столбец A принудительно текстовый —
// см. пояснение в sameDate_ выше.
function upsertRow_(ss, sheetName, headers, dateLabel, rowValues) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('@');
  }

  const fullRow = [dateLabel].concat(rowValues);
  const lastRow = sheet.getLastRow();
  let targetRow = -1;
  if (lastRow > 1) {
    const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      if (sameDate_(ss, dates[i][0], dateLabel)) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) sheet.getRange(targetRow, 1, 1, fullRow.length).setValues([fullRow]);
  else sheet.appendRow(fullRow);
}

// Пишет посчитанный computeDailyReport() во все 4 листа отчётной таблицы.
function writeDailyReport_(data) {
  if (!REPORT_SHEET_ID) throw new Error('Не задано свойство скрипта REPORT_SHEET_ID — укажите ' +
    'ID Google Таблицы для отчёта (Настройки проекта → Свойства скрипта).');
  const ss = SpreadsheetApp.openById(REPORT_SHEET_ID);

  upsertRow_(ss, 'Общее',
    ['Дата','Заявки','Продажи','Отказы (реальные)','Спам (весь мусор)','Конверсия %'],
    data.date,
    [data.overall.leads, data.overall.bought, data.overall.realRefusals, data.overall.junkRefusals, data.overall.conv]);

  const cityDefs = [['Москва','МСК'], ['Санкт-Петербург','СПб']];
  const cityHeaders = ['Дата']; const cityRow = [];
  cityDefs.forEach(([key,short])=>{
    cityHeaders.push(short+' Заявки', short+' Продажи', short+' Отказы', short+' Спам');
    const d = data.cities[key];
    cityRow.push(d.leads, d.bought, d.realRefusals, d.junkRefusals);
  });
  upsertRow_(ss, 'По городам', cityHeaders, data.date, cityRow);

  const siteDefs = [['faamo.ru','faamo'], ['alfa-collection.ru','alfa']];
  const siteHeaders = ['Дата']; const siteRow = [];
  siteDefs.forEach(([key,short])=>{
    siteHeaders.push(short+' Заявки', short+' Продажи', short+' Отказы', short+' Спам');
    const d = data.sites[key];
    siteRow.push(d.leads, d.bought, d.realRefusals, d.junkRefusals);
  });
  upsertRow_(ss, 'По сайтам', siteHeaders, data.date, siteRow);

  const srcHeaders = ['Дата']; const srcRow = [];
  SOURCE_BUCKETS.forEach(b=>{
    srcHeaders.push(b+' Заявки', b+' Продажи');
    const d = data.sources[b];
    srcRow.push(d.leads, d.bought);
  });
  upsertRow_(ss, 'По источникам', srcHeaders, data.date, srcRow);
}

// Точка входа для триггера — считает вчера и пишет в таблицу. Идемпотентна: повторный вызов
// в тот же день перезаписывает те же 4 строки, а не плодит новые (см. upsertRow_/sameDate_).
function generateDailyReport() {
  const data = computeDailyReport();
  writeDailyReport_(data);
  return data;
}

// Ручной тестовый прогон ДО включения автотриггера — фактически пишет в таблицу (тот же путь,
// что и триггер), просто вызывается руками из редактора Apps Script. Результат — в Логах
// выполнения (Вид → Журналы выполнения) и в возвращаемом значении.
function testDailyReport() {
  const data = generateDailyReport();
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}

// Запустить ОДИН РАЗ вручную из редактора — ставит ежедневный триггер на 23:30 часового пояса
// ПРОЕКТА (см. предупреждение в шапке блока). Удаляет прежние триггеры generateDailyReport
// перед установкой новой, чтобы повторный запуск этой функции не создал дубль триггера.
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t=>{
    if (t.getHandlerFunction()==='generateDailyReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generateDailyReport').timeBased().atHour(23).nearMinute(30).everyDays(1).create();
}
