# alfa.crm — дашборд

Модульный дашборд AmoCRM / Calltouch / Яндекс.Метрика / Яндекс.Директ.
Собран на [Vite](https://vitejs.dev/) (ванильный JS + Chart.js). Раньше был одним HTML-файлом (`amocrm_final_v2.html`) — теперь разбит на модули, `npm run build` собирает всё в один бандл для GitHub Pages.

Бэкенд — отдельное Google Apps Script веб-приложение; фронт ходит к нему через `fetch`. Логика запросов и формат данных при миграции **не менялись**.

---

## Команды

```bash
npm install       # установить зависимости (один раз)
npm run dev       # локальная разработка с hot-reload → http://localhost:5173
npm run build     # продакшн-сборка в папку dist/
npm run preview   # локально посмотреть собранный dist/
```

Нужен Node.js 18+ (проверено на Node 20/24).

---

## Структура

```
index.html               каркас-разметка (топбар, вкладки, контейнеры)
vite.config.js           конфиг сборки (base: './' — работает на любом субпути)
src/
├── main.js              точка входа: импорт стилей, регистрация обработчиков, init
├── styles/
│   ├── theme.css        CSS-переменные светлой/тёмной темы
│   ├── base.css         reset, топбар, периоды, навигация, setup, каркас
│   ├── components.css   метрики, карточки, воронка, гео, доунаты, таблицы, бейджи
│   └── mobile.css       адаптив (@media)
├── core/
│   ├── state.js         общее состояние (period / tab / raw / prev …)
│   ├── api.js           fetch к Apps Script, ленивая загрузка вкладок
│   ├── render.js        диспетчер рендера по вкладкам
│   ├── nav.js           вкладки, периоды, диапазон дат, подключение URL
│   ├── theme.js         светлая/тёмная тема (localStorage)
│   └── gate.js          пароль-гейт
├── tabs/                по файлу на вкладку
│   ├── crm.js           метрики, менеджеры, оркестрация CRM-блоков
│   ├── calls.js         Calltouch
│   ├── metrika.js       Яндекс.Метрика
│   └── direct.js        Яндекс.Директ + Город→Канал→Результат
├── components/          переиспользуемые блоки
│   ├── drilldown.js     попап со ссылками на сделки AmoCRM
│   ├── funnel.js        воронки (с «узким местом»), потери, причины отказов
│   ├── geo.js           Город→Сайт→Источник: дерево + таблица (сорт/поиск)
│   └── charts.js        доунаты, таблица эффективности, тренд (Chart.js)
└── utils/
    ├── constants.js     палитры, метки периодов, базовый URL AmoCRM
    └── format.js        форматтеры, цвета, расчёт дельт метрик
```

---

## Настройка при первом запуске

1. Откройте приложение → введите пароль (по умолчанию `MisterChe2026`, меняется в
   [`src/core/gate.js`](src/core/gate.js)).
2. Кнопкой **⚙** откройте экран подключения и вставьте ссылку на Apps Script
   веб-приложение (`https://script.google.com/macros/s/…/exec`). Ссылка сохраняется
   в `localStorage` (`alfa_api_v2`), тема — в `alfa_theme`.

---

## Chart.js

Подключён через CDN в `index.html` (глобальный `Chart`). Если хотите вшить его в
бандл вместо CDN:

```bash
npm install chart.js
```

убрать `<script src="…chart.umd.js">` из `index.html` и добавить в начало
`src/components/charts.js` (и `src/tabs/metrika.js`):

```js
import Chart from 'chart.js/auto';
```

---

## Деплой на GitHub Pages

### Вариант A — автодеплой через GitHub Actions (рекомендуется)

Уже настроен в [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
Один раз включите Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Дальше каждый пуш в `main` сам собирает `dist/` и публикует. Сайт будет доступен по
адресу `https://<username>.github.io/<repo>/` (например `https://chekanboy.github.io/amo/`).

### Вариант B — вручную

```bash
npm run build
# скопировать содержимое dist/ в ветку/папку, которую отдаёт Pages
```

> `base: './'` в `vite.config.js` делает пути к ассетам относительными, поэтому
> сборка работает и в корне домена, и на субпути `/amo/` без правок.
