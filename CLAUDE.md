# amo — дашборд alfa.crm

Самостоятельный проект. **Не связан с RIALO HEROES** (это другой Next.js-проект в соседней папке — сюда его не подмешивать).

## Что это
Дашборд для AmoCRM / Calltouch / Яндекс.Метрика / Яндекс.Директ. Ванильный JS + Chart.js, сборка через Vite. Раньше был одним HTML-файлом (`amocrm_final_v2.html`), теперь разбит на модули.

Бэкенд — отдельное **Google Apps Script** веб-приложение; фронт ходит к нему через `fetch`. Логику запросов (URL, параметры `period/tab/from/to`) и формат данных с бэкенда **менять нельзя** без явной просьбы.

## Команды
```bash
npm install
npm run dev       # разработка → http://localhost:5173
npm run build     # прод-сборка → dist/ (один бандл)
npm run preview   # посмотреть собранный dist/
```
Node.js 18+. На Windows node обычно по пути `C:\Program Files\nodejs\node.exe`.

## Архитектура
- `index.html` — только каркас-разметка. Использует inline-обработчики (`onclick`/`oninput`) → соответствующие функции регистрируются в `window` в `src/main.js`.
- `src/styles/` — `theme.css` (переменные light/dark), `base.css`, `components.css`, `mobile.css`.
- `src/core/` — `state.js` (общее состояние вместо глобальных `let`), `api.js` (fetch + ленивая загрузка вкладок), `render.js` (диспетчер), `nav.js`, `theme.js`, `gate.js`.
- `src/tabs/` — по файлу на вкладку: `crm.js`, `calls.js`, `metrika.js`, `direct.js`.
- `src/components/` — `drilldown.js`, `funnel.js`, `geo.js`, `charts.js`.
- `src/utils/` — `constants.js`, `format.js`.

Общее состояние — объект `state` из `src/core/state.js`; все модули читают/пишут через него.

## Ключевые детали
- **Пароль** входа задан в `src/core/gate.js` (константа `DASHBOARD_PASSWORD`). Авторизация — в `sessionStorage` (`alfa_authed`).
- **Apps Script URL** вводится через кнопку ⚙, хранится в `localStorage` (`alfa_api_v2`).
- **Тема** (light/dark) — в `localStorage` (`alfa_theme`).
- **Chart.js** подключён через CDN в `index.html` (глобальный `Chart`). Как перевести на npm-пакет — см. README.
- Ссылки drill-down ведут на AmoCRM, базовый URL — `AMO_BASE` в `src/utils/constants.js`.

## Деплой
GitHub Pages. Автодеплой настроен в `.github/workflows/deploy.yml` (пуш в `main`). В `vite.config.js` `base: './'` — пути относительные, работает и на субпути `/amo/`, и в корне. Подробности в README.md.
