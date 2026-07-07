// Общие константы приложения

// Базовый URL AmoCRM для ссылок drill-down
export const AMO_BASE = 'https://igormakarenko877.amocrm.ru';

// Палитры графиков/аватаров
export const AC = ['#a78bfa','#2dd4bf','#fbbf24','#60a5fa','#4ade80','#f87171','#f97316','#f472b6','#818cf8','#34d399'];
export const FC = ['#a78bfa','#60a5fa','#fbbf24','#f97316','#f472b6','#4ade80'];

// Этапы воронки AmoCRM (status_id → название), в порядке прогрессии.
// Зеркалит STAGES из бэкенда (amocrm_final_v2.gs) — нужно для мини-воронки менеджера,
// которая приходит как byStage:{status_id: кол-во} и раскладывается по этому порядку.
export const STAGES = [
  { id:70537282, name:'Новая заявка' },
  { id:70895782, name:'Недозвон' },
  { id:80892854, name:'Взят в работу' },
  { id:70537278, name:'Пригласили' },
  { id:71298010, name:'Посетил магазин' },
  { id:142,      name:'Купили' },
];

// Человекочитаемые названия периодов
export const PERIOD_LABELS = {
  today:'Сегодня',
  yesterday:'Вчера',
  this_week:'Эта неделя',
  last_week:'Прошлая неделя',
  this_month:'Этот месяц',
  last_month:'Прошлый месяц',
  '90days':'90 дней',
};
