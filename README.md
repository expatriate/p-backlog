# p-backlog

Беклог задач, который живёт markdown-файлами: их создаёт ИИ-агент во время работы над кодом, а человек
разбирает в локальном веб-приложении.

- **CLI `backlog`** — создаёт задачи, берёт их в работу, меняет статусы.
- **Скилл `backlog`** для Claude Code — объясняет агенту, когда и как звать CLI.
- **Веб-приложение** — список проектов, поиск, фильтры, эпики, связи, прогресс; задачи не создаёт.

## Установка

```bash
npm install
npm run build
npm link            # глобальная команда backlog
npm run install-skill   # ~/.claude/skills/backlog → skill/backlog
```

## Где лежат задачи

Каталог беклога — `~/backlog` или путь из переменной `BACKLOG_DIR`. Внутри — по каталогу на проект:

```
~/backlog/spa/project.md   # name, prefix, repos
~/backlog/spa/SPA-12.md    # задача: frontmatter + markdown
```

Проект для текущей директории определяется по git-корню и полю `repos` в `project.md`. Если проекта нет,
`backlog new` создаёт его сам.

## Команды CLI

| Команда | Что делает |
|---|---|
| `backlog new --title <t> [--type task\|epic] [--priority low\|medium\|high\|critical] [--tags a,b] [--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--json]` | Создаёт задачу, описание читается из stdin |
| `backlog list [--query q] [--status s,…] [--tag t,…] [--project id \| --all-projects] [--json]` | Список задач, по умолчанию открытые задачи текущего проекта |
| `backlog show <ID> [--json]` | Задача целиком: связи, блокеры, предупреждения |
| `backlog take <ID> \| --next [--force] [--json]` | Берёт задачу в работу, проверяя блокеры |
| `backlog status <ID> <backlog\|in-progress\|blocked\|done\|cancelled>` | Меняет статус |

Коды выхода: `0` — успех, `1` — ошибка аргументов или правил, `2` — не найдено, `3` — `take` отклонён.

## Веб-приложение

```bash
npm start           # сборка и сервер на http://localhost:4317
npm run dev         # сервер и Vite с горячей перезагрузкой
```

Сервер слушает только `127.0.0.1` и показывает изменения каталога сразу: задача, созданная агентом,
появляется в открытой вкладке без перезагрузки.

## Разработка

```bash
npm test            # модульные, серверные и интерфейсные тесты
npm run typecheck
npm run lint

npx playwright install chromium   # один раз, перед первым запуском e2e
npm run test:e2e                  # Playwright: живое обновление списка
```
