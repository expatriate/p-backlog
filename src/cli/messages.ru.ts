export const cliRu = {
  usageHeader: "Использование:",
  extraArguments: (args: readonly string[]): string => `Лишние аргументы: ${args.join(" ")}`,
  argumentProblem: {
    unknownOption: (option: string): string => `Неизвестный параметр ${option}`,
    missingValue: (option: string): string => `У параметра ${option} нет значения`,
    takesNoValue: (option: string): string => `Параметр ${option} не принимает значения`,
  },
  invalidChoice: (label: string, allowed: readonly string[], value: string): string =>
    `${label}: ожидается одно из ${allowed.join(", ")}, получено «${value}»`,
  invalidPort: (value: string): string => `--port: ожидается число от 1 до 65535, получено «${value}»`,
  commandFailed: (name: string, reason: string): string => `Команда ${name} не выполнена: ${reason}`,
  runNotRecorded: (error: string): string => `Не удалось записать запуск: ${error}`,
  runsNotTrimmed: (error: string): string => `Не удалось обрезать журнал запусков: ${error}`,
  settingsFileInvalid: (path: string): string => `${path} не разобран, язык для этого запуска определён автоматически. Файл не изменён — поправьте его вручную.`,

  optionLabel: { status: "статус", category: "категория", priority: "приоритет", language: "язык" },
  skillForeign: (target: string): string => `${target} — чужой каталог, скилл не переставлен`,

  installSkillLinked: (target: string, source: string): string => `Скилл установлен: ${target} → ${source}`,
  installSkillKept: (target: string): string => `Скилл уже установлен: ${target}`,
  installSkillForeign: (target: string, source: string): string => `${target} уже существует и не ведёт в ${source}. Уберите его вручную и повторите.`,
  installSkillLinkFailed: (target: string, detail: string): string => `Не удалось создать ссылку ${target} (${detail}).`,
  installHookExists: (settingsPath: string): string => `Хук Stop уже есть в ${settingsPath}`,
  installHookAdded: (settingsPath: string): string => `Хук Stop добавлен в ${settingsPath}`,
  installSettingsUnreadable: (settingsPath: string, detail: string): string => `${settingsPath} не прочитать (${detail}), хук Stop не добавлен.`,
  installSettingsInvalid: (settingsPath: string): string => `${settingsPath} — не объект JSON, хук Stop не добавлен. Исправьте файл и повторите.`,

  serviceInstalled: (file: string): string => `Служба установлена: ${file}`,
  serviceLogs: (path: string): string => `Логи: ${path}`,
  serviceUninstalled: "Служба удалена",
  serviceNotInstalled: "Служба не установлена",
  serviceUnsupported: "Автозапуск на этой системе не поддерживается — запускайте веб командой backlog serve",
  serviceCommandFailed: (command: string, code: number, output: string): string => `${command} завершился с кодом ${code}: ${output}`,
  serviceStatus: (registered: boolean, responding: boolean, port: number): string =>
    `Служба: ${registered ? "установлена" : "не установлена"} · сервер на порту ${port}: ${responding ? "отвечает" : "не отвечает"}`,

  taskNotFound: (id: string): string => `Задача ${id} не найдена`,
  fileConflict: (id: string): string => `Файл задачи ${id} изменился во время записи, повторите команду`,

  statsTitle: (scopeName: string): string => `${scopeName} · статистика`,
  statsOpenLine: ({ open, weight, net, created, closed }: { open: number; weight: number; net: string; created: number; closed: number }): string =>
    `Открыто: ${open} (вес ${weight}) · за неделю: ${net} (создано ${created}, закрыто ${closed})`,
  statsAgeLine: (ageMedian: string, leadMedian: string, tail: string): string =>
    `Возраст, медиана: ${ageMedian} · до закрытия, медиана: ${leadMedian}${tail}`,
  statsP90Tail: (p90: string): string => ` (90% — ${p90})`,
  statsForecastLine: (forecast: string, tail: string): string => `Прогноз: ${forecast} (${tail})`,
  noAlerts: "Тревог нет",
  alertsHeader: "Тревоги:",
  moreAt: (url: string): string => `Подробнее: ${url}`,
  projectsFallbackName: "Проекты",

  blockedSuffix: " [заблокирована]",
  fileLine: (path: string): string => `Файл: ${path}`,
  summaryLine: ({
    type,
    status,
    priority,
    progress,
    categoryTail,
  }: {
    type: string;
    status: string;
    priority: string;
    progress: string;
    categoryTail: string;
  }): string => `Тип: ${type} · Статус: ${status} · Приоритет: ${priority} · Прогресс: ${progress}${categoryTail}`,
  categoryTail: (label: string): string => ` · Категория: ${label}`,
  closedLine: (closed: string, deletesAt: string): string => `Закрыта: ${closed} · удалится ${deletesAt}`,
  reasonLine: (resolution: string, reason: string): string => `Причина закрытия: ${resolution} — ${reason}`,
  verifiedLine: (verified: string): string => `Проверена: ${verified}`,
  tagsLine: (tags: string): string => `Теги: ${tags}`,
  epicLine: (ref: string): string => `Эпик: ${ref}`,
  epicNotFound: (epicId: string): string => `${epicId} (не найден)`,
  openBlockersLine: (list: string): string => `Открытые блокеры: ${list}`,
  inactiveBlockersLine: (list: string): string => `Закрытые или ненайденные блокеры: ${list}`,
  blocksLine: (list: string): string => `Блокирует: ${list}`,
  relatedLine: (list: string): string => `Связанные: ${list}`,
  epicChildrenLine: (list: string): string => `Задачи эпика: ${list}`,
  warningsLine: (list: string): string => `Предупреждения: ${list}`,

  stopReasonMore: (hidden: number): string => ` и ещё ${hidden}`,
  stopReasonBody: (items: string, more: string): string =>
    `после последней проверки менялся код задач — ${items}${more}. Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».`,
  candidateChanged: (path: string): string => `изменён ${path}`,
  candidateMissing: (path: string): string => `нет файла ${path}`,
  candidateRenamed: (path: string, to: string): string => `${path} переименован в ${to}`,
  candidateSimilarTo: (otherId: string): string => `похожа на ${otherId}`,

  taskFileUnparsed: (id: string, problems: string): string => `Файл задачи ${id} не разобран: ${problems}`,
  projectNotFoundForCwd: (cwd: string): string => `Проект для ${cwd} не найден. Укажите --project <id> или добавьте путь в repos нужного project.md`,
  projectNotFound: (id: string): string => `Проект ${id} не найден`,
  notInGitRepo: (cwd: string): string => `${cwd} не в git-репозитории: проект не создан. Укажите --project <id> или запустите команду из репозитория`,
  projectCreated: (id: string, prefix: string): string => `Создан проект ${id} (${prefix})`,
  projectNotCreatedFileUnparsed: (path: string, problems: string): string =>
    `Проект не создан: ${path} не разобран (${problems}). Исправьте файл — иначе новый проект может повторить его префикс и номера задач`,

  needProjectOrAllProjects: "Укажите либо --project, либо --all-projects",

  candidateEvidenceSameLocation: "то же место в коде",
  candidateEvidenceSimilarTitles: "похожие заголовки",
  candidateEvidenceSameSymbol: "тот же символ в коде",
  candidateUncommitted: "есть незакоммиченные правки",
  candidateDescribeChanged: (path: string, details: string): string => `код менялся (${path}): ${details}`,
  candidateDescribeMissing: (path: string): string => `файла ${path} нет`,
  candidateDescribeRenamed: (path: string, to: string): string => `файла ${path} нет — переименован в ${to}`,
  candidateDescribeDuplicate: (otherId: string, match: string): string => `похоже на дубль ${otherId} (${match})`,

  projectUsage: (): readonly string[] => [
    "list",
    "status <id> active|inactive   (неактивные не входят в общую область)",
    "delete <id> --confirm <id>    (удаляет каталог проекта со всеми задачами)",
  ],
  noProjects: "Проектов нет",
  projectListLine: ({
    id,
    name,
    prefix,
    statusWord,
    open,
  }: {
    id: string;
    name: string;
    prefix: string;
    statusWord: string;
    open: number;
  }): string => `${id} · ${name} · ${prefix} · ${statusWord} · открытых ${open}`,
  confirmProjectDelete: (id: string): string => `Подтвердите удаление: backlog project delete ${id} --confirm ${id}`,
  projectDeleted: (id: string, taskCount: number): string => `${id} удалён: задач ${taskCount}`,
  projectActive: "активен",
  projectInactive: "неактивен",

  checklistWarning: (count: number): string => `Внимание: не отмечено пунктов чеклиста — ${count}`,

  pruneUsage: (days: number): string => `[--project id | --all-projects] [--apply]   (задачи с низким приоритетом старше ${days} дней)`,
  pruneReason: (days: number): string => `Низкий приоритет, не брали в работу ${days}+ дней (backlog prune)`,
  noStaleTasks: "Застоявшихся задач нет",
  staleTaskLine: (id: string, title: string, created: string): string => `${id} — ${title} (создана ${created})`,
  cancelStaleHint: "Отменить эти задачи: backlog prune --apply",
  taskCancelled: (id: string): string => `${id}: отменена`,

  verifyUsage: (): string => "<ID> [<ID> …] [--source файл:строка — только для одной задачи]",
  sourceEmpty: "--source не может быть пустым",
  alreadyInStatusNothingToVerify: (id: string, status: string): string => `${id} уже в статусе ${status}: подтверждать нечего`,
  verified: (id: string): string => `${id}: подтверждена`,
  verifiedWithSource: (id: string, source: string): string => `${id}: подтверждена, source → ${source}`,

  takeUsage: (): readonly string[] => [
    "<ID> [--force] [--json]",
    "--next [--project id] [--json]",
    "--path <файл|каталог> [--project id] [--json]   (все открытые задачи внутри пути)",
  ],
  chooseOnlyOne: (chosen: string): string => `Укажите что-то одно: ${chosen}`,
  noOpenTasksAt: (path: string): string => `Открытых задач по ${path} нет`,
  epicTakeChildren: (id: string): string => `${id} — эпик. Возьмите в работу одну из его задач:`,
  noOpenChildren: "  открытых задач нет",
  alreadyInStatus: (id: string, status: string): string => `${id} уже в статусе ${status}`,
  blockedByOpenTasks: (id: string): string => `${id} заблокирована открытыми задачами:`,
  noTakeableInProject: (id: string): string => `В проекте ${id} нет задач, которые можно взять в работу`,

  hookUsage: (stopEvent: string): string => `${stopEvent}   (для хука Stop в Claude Code, событие читается из stdin)`,
  sessionShownReadFailed: (error: string): string => `Не удалось прочитать показанные задачи сессии: ${error}`,
  sessionShownWriteFailed: (error: string): string => `Не удалось запомнить показанные задачи сессии: ${error}`,
  alertsComputeFailed: (error: string): string => `Не удалось посчитать тревоги: ${error}`,
  alertsShownWriteFailed: (error: string): string => `Не удалось сохранить показанные тревоги: ${error}`,

  newUsage: (types: string, priorities: string, found: string): string =>
    [
      `--title <заголовок> [--type ${types}] [--priority ${priorities}] [--tags a,b]`,
      `--category <категория> (для задач обязателен) [--found ${found}]`,
      "[--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--json]",
      "[--force — создать, даже если похожая открытая задача уже есть]",
      "(описание задачи читается из stdin)",
    ].join("\n"),
  titleRequired: "--title обязателен",
  categoryRequired: "--category обязателен: bug или категория запаха из каталога code-smells",
  bugNeedsSourceWarning: "У бага нет --source: без файла:строки проверка не увидит, что код задачи изменился",
  sameSource: "тот же source",
  similarTitle: "похожий заголовок",
  similarTaskWarning: (id: string, title: string, why: string): string =>
    `Похоже на ${id} — «${title}» (${why}). Если это другая задача — добавьте --force`,

  epicUsage: (noEpic: string): string => `<ID> [<ID> …] --to <ID эпика|${noEpic}>   (переносит задачи в эпик или вынимает из него)`,
  notAnEpic: (id: string): string => `${id} не эпик — перенести задачи можно только в эпик`,
  epicCannotContainEpic: (id: string): string => `${id} — эпик, эпик не может входить в другой эпик`,
  noEpicWord: "без эпика",

  closeUsage: (resolutions: string): string => `<ID> --as ${resolutions} --reason <улика> [--duplicate-of <ID>]`,
  reasonRequired: "--reason обязателен: коммит, строка или факт, по которому задача закрыта",
  duplicateOfRule: "--duplicate-of задаётся вместе с --as duplicate и только с ним",
  epicClosesOnItsOwn: (id: string): string => `${id} — эпик: он закроется сам, когда закроются все его задачи (backlog check)`,
  cannotDuplicateSelf: "задача не может быть дублем самой себя",
  fromAnotherProject: (id: string): string => `${id} из другого проекта`,
  originalAlreadyClosed: (id: string, taskId: string): string => `${id} уже закрыта — закройте ${taskId} как fixed или obsolete`,
  fixCommitRequired: 'Укажите коммит исправления: --reason "Исправлено в <sha>: …" (коммит должен быть в репозитории проекта)',
  deletesAtTail: (date: string): string => `. Удалится ${date}`,

  listUsage: (): string => "[--query текст] [--status s,…] [--tag t,…] [--project id | --all-projects] [--json]",
  parseErrorLine: (path: string, problems: string): string => `Ошибка разбора ${path}: ${problems}`,
  noTasksFound: "Задач не найдено",

  fixedHeader: "Исправлено:",
  problemsHeader: "Проблемы:",
  candidatesHeader: "Кандидаты на закрытие:",
  backlogOk: "Беклог в порядке",
};

export type CliMessages = typeof cliRu;
