# p-backlog

[![npm](https://img.shields.io/npm/v/p-backlog)](https://www.npmjs.com/package/p-backlog) [![downloads](https://img.shields.io/npm/dm/p-backlog)](https://www.npmjs.com/package/p-backlog) [![CI](https://github.com/expatriate/p-backlog/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/p-backlog/actions/workflows/ci.yml) [![node](https://img.shields.io/node/v/p-backlog)](https://nodejs.org) [![license](https://img.shields.io/npm/l/p-backlog)](LICENSE)

**[English version](README.md)**

Беклог задач, который живёт markdown-файлами: их создаёт ИИ-агент во время работы над кодом, а человек
разбирает в локальном веб-приложении.

- **CLI `backlog`** — создаёт задачи, берёт их в работу, меняет статусы.
- **Скилл `backlog`** для Claude Code — объясняет агенту, когда и как звать CLI.
- **Веб-приложение** — список проектов, поиск, фильтры, эпики, связи, прогресс; задачи не создаёт.
- **Порядок в беклоге** — агент перепроверяет задачи, чей код изменился, и закрывает ненужные; закрытые
  задачи удаляются через 7 дней.

## Как начать

1. **Установка** (нужен Node.js 22.13 или новее):

   ```bash
   npm i -g p-backlog
   backlog setup --service
   ```

   `npm i -g p-backlog` ставит CLI глобально; `backlog setup --service` ставит скилл и хук Stop для Claude
   Code и запускает веб как службу автозапуска.

2. **Язык** — по умолчанию русский, если беклог уже есть, иначе язык берётся из локали системы. Сменить
   можно в любой момент:

   ```bash
   backlog config language en   # или ru
   ```

3. **Первый проект и первая задача** — откройте Claude Code в своём репозитории и попросите «запиши в
   беклог …», либо создайте задачу сами:

   ```bash
   backlog new --title "Таймаут загрузки не учитывает размер файла" --category bug <<<'Описание проблемы'
   ```

   Проект для текущего репозитория `backlog new` создаст сам, если его ещё нет.

4. **Веб-приложение** — уже работает на `http://localhost:4317`; проверить можно так:

   ```bash
   backlog service status
   ```

5. **Хук Stop и тревоги** — после каждого ответа агента в репозитории хук Stop проверяет, не изменился ли
   код у открытых задач этого проекта, и просит агента перепроверить их, если да. Он же показывает
   тревоги — сигналы о состоянии беклога (растущий долг, зависшие задачи, старые задачи с низким
   приоритетом и т. п.); их сводку показывает и `backlog stats`.

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
| `backlog new --title <t> --category <категория> [--type task\|epic] [--priority low\|medium\|high\|critical] [--tags a,b] [--found review\|incidental] [--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--force] [--json]` | Создаёт задачу, описание читается из stdin; похожая открытая задача — отказ (код 3), `--force` создаёт всё равно; `--found review` — находка ревью, по умолчанию `incidental` (замечено попутно) |
| `backlog list [--query q] [--status s,…] [--tag t,…] [--project id \| --all-projects] [--json]` | Список задач, по умолчанию открытые задачи текущего проекта |
| `backlog show <ID> [--json]` | Задача целиком: связи, блокеры, предупреждения |
| `backlog take <ID> \| --next [--project id] [--force] [--json]` | Берёт задачу в работу, проверяя блокеры |
| `backlog take --path <файл\|каталог> [--project id] [--json]` | Берёт в работу все открытые задачи внутри пути |
| `backlog status <ID> <backlog\|in-progress\|blocked\|done\|cancelled>` | Меняет статус |
| `backlog priority <ID> <low\|medium\|high\|critical>` | Меняет приоритет |
| `backlog category <ID> <категория\|none>` | Меняет категорию или убирает её |
| `backlog epic <ID> [<ID> …] --to <ID эпика\|none>` | Переносит задачи в эпик или вынимает из него |
| `backlog check [--changed] [--project id \| --all-projects] [--json]` | Чинит висячие ссылки и завершённые эпики, находит задачи, которые пора перепроверить |
| `backlog close <ID> --as fixed\|obsolete\|duplicate --reason <улика> [--duplicate-of ID]` | Закрывает задачу с причиной; `fixed` — только с хешем коммита из репозитория проекта |
| `backlog verify <ID> [<ID> …] [--source файл:строка]` | Отмечает, что задачи ещё актуальны, и запоминает фрагмент кода |
| `backlog prune [--project id \| --all-projects] [--apply]` | Задачи с низким приоритетом старше 30 дней; `--apply` отменяет их |
| `backlog stats [--project id \| --all-projects] [--json]` | Сводка статистики и тревоги |
| `backlog project list \| status <id> active\|inactive \| delete <id> --confirm <id>` | Активность проектов и удаление проекта вместе с задачами |
| `backlog hook stop` | Хук Stop для Claude Code: просит агента перепроверить задачи, чей код изменился |
| `backlog config language [ru\|en]` | Без значения — печатает текущий язык беклога; со значением — меняет его |
| `backlog setup [--service]` | Поставить скилл и Stop-хук; с `--service` — ещё и службу автозапуска |
| `backlog serve [--port N]` | Запускает веб-сервер в текущем процессе, порт — из `PORT`, иначе 4317 |
| `backlog service install \| uninstall \| status` | Автозапуск веб-сервера при входе: launchd на macOS, systemd --user на Linux, скрипт в папке «Автозагрузка» на Windows; `status` — установлена ли служба и отвечает ли сервер |

Коды выхода: `0` — успех, `1` — ошибка аргументов или правил, `2` — не найдено, `3` — отказ (задача
закрыта, заблокирована или все подходящие заблокированы), `4` — команда не выполнилась, `5` — у `check`
есть что перепроверить.

Проект, который больше не ведётся, помечается неактивным: его задачи не попадают в список и статистику
режима «Проекты», но страница проекта работает как обычно. Проверки (`backlog check`), Stop-хук и
удаление старых закрытых задач идут по всем проектам, включая неактивные. Удаление проекта сносит каталог
`~/backlog/<id>` со всеми задачами и журналом — и в интерфейсе, и в CLI оно требует ввести id проекта.

## Порядок в беклоге

- Агент заканчивает ответ в репозитории, где открытые задачи ссылаются на изменившийся код, — хук Stop
  просит его перепроверить эти задачи. По просьбе «проверь беклог» он проходит весь проект.
- Ненужную задачу агент закрывает через `backlog close` с уликой; в интерфейсе такие задачи видны по
  ссылке «Закрыты агентом», их можно вернуть в беклог.
- Эпик, все задачи которого закрыты, сервер при старте и раз в час закрывает сам; такие эпики тоже видны
  по ссылке «Закрыты агентом».
- Любая закрытая задача удаляется через 7 дней вместе с файлом: это делает сервер при старте и раз в час. Задачу завершённого эпика сервер держит, пока эпик не закроется (например, пока в беклоге есть неразобранные файлы), — тогда вместо отсчёта видно «удаление задержано».
  Номера удалённых задач повторно не выдаются.

## В паре с code-review-graph

[code-review-graph](https://github.com/tirth8205/code-review-graph) строит локальный граф кода (функции, классы, их
строки) в `.code-review-graph/graph.db` в корне репозитория. p-backlog без него работает, но если граф есть —
использует его, только на чтение:

- **Перепроверка по символу.** `source` задачи (`файл:строка`) сопоставляется с функцией или классом, в которых
  стоит. Stop-хук и `backlog check` предлагают перепроверить задачу, только когда изменился этот символ, а не
  любая строка файла, — лишних перепроверок меньше. Без графа проверка опирается на строки `source`, затем на весь
  файл.
- **Дубли по символу.** Две задачи, указывающие в одну функцию, предлагаются как возможные дубли.
- **Состояние графа в вебе.** Боковая панель предупреждает, если у проекта нет графа, он устарел или не читается
  (собран другой версией или для другого пути), и подсказывает команду, которая это исправит.
- **Точность проверки.** Вкладка «Качество» в статистике показывает, как часто был прав каждый способ проверки: по
  символу, по строкам `source`, по файлу.

Настройка, один раз на репозиторий (инструмент на Python; подойдёт и `pipx install code-review-graph`):

```bash
uv tool install code-review-graph
code-review-graph build                       # в корне репозитория
code-review-graph install --platform claude-code  # по желанию: его MCP-сервер и инструкции для Claude Code
```

Чтобы граф не устаревал, держите запущенным `code-review-graph watch` или выполняйте `code-review-graph update`
после изменений. Проверено с code-review-graph 2.3.

## Веб-приложение

```bash
backlog serve             # запускает веб-сервер в текущем процессе, порт — из PORT, иначе 4317
backlog serve --port 5000
```

Сервер слушает только `127.0.0.1` и показывает изменения каталога сразу: задача, созданная агентом,
появляется в открытой вкладке без перезагрузки.

Чтобы сервер поднимался сам при входе в систему, установите его как службу (поддерживаются macOS, Linux
и Windows):

```bash
backlog service install     # macOS: launchd, Linux: systemd --user, Windows: скрипт в папке «Автозагрузка»
backlog service status      # установлена ли служба, отвечает ли сервер
backlog service uninstall
```

Логи:

- macOS — `~/Library/Logs/p-backlog.log`
- Linux — `journalctl --user -u p-backlog`
- Windows — `%LOCALAPPDATA%\p-backlog\p-backlog.log`

## Переход с установки из клона

Если p-backlog был установлен из клона репозитория, переходите на пакет:

```bash
npm i -g p-backlog       # или, из клона: npm link
backlog setup --service
```

`setup` переставит ссылку скилла с клона на установленный пакет и не задублирует хук Stop; с
`--service` `install` перезаписывает службу автозапуска на месте, поэтому заодно заменяет и
LaunchAgent `local.p-backlog`, настроенный вручную по старому шаблону plist.

## Обновление

```bash
npm update -g p-backlog
backlog service install
```

Запущенная служба продолжает работать со старым `cli.js`, пока её не переустановят, — веб-ресурсы на
диске уже новые, но именно `backlog service install` переключает службу на новый код.

После обновления самого Node (например, через Homebrew) тоже запустите `backlog service install` —
служба хранит путь к бинарнику Node, с которым была установлена.

## Удаление

```bash
backlog service uninstall
npm uninstall -g p-backlog
```

Перед удалением пакета выполните `backlog service uninstall` — иначе `KeepAlive` у launchd (или
`Restart=on-failure` у systemd) продолжит перезапускать несуществующий `cli.js`. Затем вручную уберите
ссылку на скилл и хук Stop:

```bash
rm ~/.claude/skills/backlog   # или $CLAUDE_SKILLS_DIR / $CLAUDE_CONFIG_DIR/skills, если заданы
```

и удалите запись хука `Stop` из `~/.claude/settings.json` (или `$CLAUDE_SETTINGS_PATH`) — на
macOS/Linux это команда `command -v backlog >/dev/null && backlog hook stop || true`, на Windows —
команда PowerShell, начинающаяся с `if (Get-Command backlog.cmd ...)`.

На Windows скрипт в папке «Автозагрузка» не перезапускает сервер после падения — в отличие от `KeepAlive`
у launchd или `Restart=on-failure` у systemd; после сбоя запустите `backlog service install` заново или
`backlog serve`.

## Разработка

```bash
npm install
npm run build
npm link            # глобальная команда backlog
npm run install-skill   # ~/.claude/skills/backlog → skill/backlog и хук Stop в ~/.claude/settings.json
```

```bash
npm start           # сборка и сервер на http://localhost:4317
npm run dev         # сервер и Vite с горячей перезагрузкой
```

```bash
npm test            # модульные, серверные и интерфейсные тесты
npm run typecheck
npm run lint

npx playwright install chromium   # один раз, перед первым запуском e2e
npm run test:e2e                  # Playwright: живое обновление списка

npm run test:package              # весь путь установки из tarball на этой ОС (медленный)
```

Чтобы попробовать сборку так, будто это опубликованный пакет, без публикации:

```bash
npm pack && npm i -g ./p-backlog-0.2.0.tgz
```
