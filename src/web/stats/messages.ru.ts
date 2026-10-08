import { formatDecimal } from "../../core/i18n/format";
import { countRu, NBSP, pluralRu } from "../../core/i18n/plural";
import type { FoundHow } from "../../core/journal/events";
import type { Priority } from "../../core/model/types";
import type { AgeBucket, ClosingReason } from "../../core/api/contract";
import type { ChartId, ChartStep, Grain } from "./charts/chart-style";
import type { FigureTone } from "./Figure";
import type { StatsConstants } from "./stats-constants";
import type { AccuracySummary, CodeAndTestsLines, IntakeSummary, LinesAmount, PendingEstimate } from "./summaries";

const dayCount = (n: number): string => countRu(n, "день", "дня", "дней");
const CHART_STEPS: Record<ChartStep, string> = { day: "дням", week: "неделям", sample: "замерам" };

type FlowSummary = { grain: Grain; periodCount: number; created: number; closed: number; openNow: number };
type SpendSummary = { grain: Grain; periodCount: number; hookTokens: number; cliTokens: string; approxMoney: string; hookRuns: string; cliRuns: string };

const PERIOD_FORMS: Record<Grain, [string, string, string]> = { week: ["неделя", "недели", "недель"], day: ["день", "дня", "дней"] };
const OVER_PERIOD_FORMS: Record<Grain, [string, string, string]> = { week: ["неделю", "недели", "недель"], day: ["день", "дня", "дней"] };
const PER_PERIOD: Record<Grain, string> = { week: "в неделю", day: "в день" };
const LAST_PERIOD: Record<Grain, string> = { week: "на последней неделе с решениями", day: "в последний день с решениями" };

const periods = (grain: Grain, n: number): string => countRu(n, ...PERIOD_FORMS[grain]);
const tasks = (n: number): string => countRu(n, "задача", "задачи", "задач");
const tokens = (n: number): string => countRu(n, "токен", "токена", "токенов");

function linesText({ formatted, count }: LinesAmount): string {
  return `${formatted}${NBSP}${pluralRu(count, "строка", "строки", "строк")}`;
}

export function createStatsRu(constants: StatsConstants) {
  const churnPeriod = dayCount(constants.churnDays);
  const statsPeriod = countRu(constants.statsWeeks, "неделю", "недели", "недель");
  const statsPeriodGenitive = countRu(constants.statsWeeks, "недели", "недель", "недель");
  const memoryHistoryPeriod = countRu(constants.memoryHistoryHours, "час", "часа", "часов");
  const effectWindow = `${statsPeriod} (с внедрения, если оно позже)`;
  const estimateLater = `оценка появится после ${constants.minFixesForEstimate} исправлений`;

  return {
    docTitle: (heading: string): string => `${heading} — Беклог`,
    heading: (scopeName: string): string => `Статистика · ${scopeName}`,
    alerts: "Тревоги",
    tabsLabel: "Разделы статистики",
    tabs: { overview: "Обзор", code: "Код", quality: "Качество", effect: "Эффект", cost: "Стоимость" },

    invalidJournalLines: (n: number): string => `Не удалось разобрать строк журнала: ${n}. Они не входят в статистику — проверьте формат строк в journal.jsonl проекта.`,
    unknownJournalLines: (n: number): string => `Строк журнала с неизвестным значением: ${n}. Переименованное значение (категория, «как найдена», резолюция) показано как «неизвестно», но учтено в разбивках.`,
    unparsedTasks: (n: number): string => `Не удалось разобрать файлов задач: ${n}. Для них в статистике — последний статус из журнала; исправьте файлы, команда backlog check покажет ошибки.`,
    noTasks: "Задач пока нет.",
    projectNotFound: "Проект не найден.",
    loading: "Считаем статистику…",
    journalEmpty: "Журнал ещё пуст; всё построено по датам в файлах задач.",
    journalSince: (date: string): string => `Журнал ведётся с ${date}; раньше — по датам в файлах задач. Удалённые до этого задачи в статистику не попали.`,
    unavailableRepo: (repo: string): string => `Нет доступа к репозиторию: ${repo}. Проверьте путь в repos файла project.md и что это git-репозиторий.`,
    tableLabel: (label: string): string => `Таблица «${label}»`,
    noCodeData: "Нет данных о коде: у проектов нет доступных репозиториев",
    folders: "Папки",
    projects: "Проекты",

    periodWindows: {
      weeks: countRu(constants.statsWeeks, "неделя", "недели", "недель"),
      days: dayCount(constants.statsDays),
      lastWeek: dayCount(constants.costTotalsDays),
      churn: churnPeriod,
    },
    periodCaption: (window: string, range: string): string => `${window} · ${range}`,
    periodNow: "сейчас",
    chartLabel: (name: string, step: ChartStep): string => `${name}. Стрелки влево и вправо — по ${CHART_STEPS[step]}`,
    periodOf: (grain: Grain, day: string): string => (grain === "week" ? `неделя с ${day}` : day),
    weekTrend: (arrow: string, size: string): string => `${arrow}${NBSP}${size}${NBSP}за${NBSP}неделю`,
    weekTrendSpeech: {
      decline: (size: string): string => `на ${size} меньше, чем неделю назад — лучше`,
      growth: (size: string): string => `на ${size} больше, чем неделю назад — хуже`,
    } satisfies Record<FigureTone, (size: string) => string>,

    tasksToday: "Задачи сегодня",
    createdAndClosed: "создано и закрыто",
    thisWeek: "За неделю",
    weekNote: (created: number, closed: number): string => `создано ${created}, закрыто ${closed}`,
    debtBy: { week: "Долг по неделям", day: "Долг по дням" } satisfies Record<Grain, string>,
    flowCreated: "создано",
    flowClosed: "закрыто",
    flowOpen: "открыто",
    flowOpenAtEnd: { week: "открыто на конец недели", day: "открыто на конец дня" } satisfies Record<Grain, string>,
    flowSummary: ({ grain, periodCount, created, closed, openNow }: FlowSummary): string => `${periods(grain, periodCount)}: создано ${created}, закрыто ${closed}, открыто сейчас ${openNow}`,
    createdBy: { week: "Создано по неделям", day: "Создано по дням" } satisfies Record<Grain, string>,
    createdTasks: "создано задач",
    intakeSummary: ({ grain, periodCount, created, perPeriod }: IntakeSummary): string => {
      const period = periods(grain, periodCount);
      if (perPeriod === null) return `${period}: задач не создавали`;
      return `${period}: создано ${created}, в среднем ${formatDecimal("ru", perPeriod)} ${PER_PERIOD[grain]}`;
    },
    hotspots: "Где болит",
    noSourceFolders: "У открытых задач нет source",
    tags: "Теги",
    noTags: "У открытых задач нет тегов",
    openAge: "Возраст открытых",
    ageBuckets: { week: "до 7 дней", month: "7–30 дней", quarter: "30–90 дней", older: "больше 90 дней" } satisfies Record<AgeBucket, string>,
    priorityCounts: { critical: "критичных", high: "высоких", medium: "средних", low: "низких" } satisfies Record<Priority, string>,
    urgentStale: (n: number): string => `Критичные и высокие старше ${constants.staleUrgentDays} дней: ${n}`,
    closing: "Как закрываются",
    closingReasons: { done: "сделано", cancelled: "отменено", unknown: "резолюция не распознана" } satisfies Record<Extract<ClosingReason, "done" | "cancelled" | "unknown">, string>,
    noiseAndReopens: "Шум и возвраты",
    duplicatesAmongClosed: "Дубли среди закрытых",
    noSourceAmongCreated: "Без source среди созданных",
    reopened: "Возвраты",

    codeNote: `Изменения — коммиты за ${churnPeriod}; строки — на последнем коммите.`,
    churnTitle: "Долг в часто меняемом коде",
    churnHint: `Место в списке — коммиты за ${churnPeriod} × вес открытых задач папки`,
    churnEmpty: `Долг не лежит в коде, который меняли за ${churnPeriod}`,
    commits: (n: number): string => countRu(n, "коммит", "коммита", "коммитов"),
    churnTasks: (n: number, weight: number): string => `${tasks(n)}, вес ${weight}`,
    densityTitle: "Плотность долга",
    perKloc: (value: number): string => `${formatDecimal("ru", value)} на 1000${NBSP}строк`,

    accuracyTitle: "Точность проверки",
    noCandidates: "Проверка ещё не находила кандидатов",
    accuracyHint: "Доля кандидатов проверки, после которых задача закрылась; остальные подтверждены как актуальные",
    accuracyTable: (period: string): string => `Точность проверки, ${period}`,
    accuracyHead: ["Улика", "Кандидатов", "Закрыто", "Подтверждено", "Без решения", "Точность"],
    splitRow: (label: string): string => `└ из них ${label}`,
    beforeMethodRecorded: "до записи способа",
    checkedBy: (method: string): string => `проверено ${method}`,
    beforeMatchRecorded: "до записи признака",
    matchedBy: (match: string): string => `совпали ${match}`,
    decidedCandidates: "решено кандидатов",
    precision: "точность",
    accuracySummary: ({ grain, periodCount, decided, latestPrecision }: AccuracySummary): string =>
      latestPrecision === null ? `${periods(grain, periodCount)}: решённых кандидатов нет` : `${periods(grain, periodCount)}: решено ${decided}, точность ${LAST_PERIOD[grain]} ${latestPrecision}`,
    graphTitle: "Граф кода",
    graphMissing: <T>(code: (text: string) => T): Array<string | T> => [
      "Графа кода нет: проверка сравнивает строки source и файл целиком. ",
      code("code-review-graph build"),
      " в репозитории проекта включит проверку по символу",
    ],
    graphHint: "Граф убирает кандидата «код изменился», если правка задела другой символ того же файла, — агенту не нужно перечитывать задачу",
    filteredTitle: `Отсеяно за ${statsPeriod}`,
    nothingFiltered: "Граф не отсеял ни одного кандидата",
    filteredTable: "Что стало с отсеянными кандидатами",
    filteredHead: ["Исход", "Кандидатов"],
    filteredByGraph: "Отсеяно графом",
    filteredCaught: "└ позже всё же стал кандидатом",
    filteredMissed: "└ закрыта без сигнала проверки — возможный промах",
    filteredQuiet: "└ без последствий",
    graphByProject: "Граф кода по проектам",
    graphHead: ["Проект", "Граф", "Задач со строками source", "Символ найден"],
    categoriesTitle: "Категории",
    categoriesEmpty: `За ${statsPeriod} задач не было`,
    categoriesHead: ["Категория", "Открыто", "Вес", "Создано", "Закрыто"],
    originTitle: "Происхождение",
    foundTitle: "Как найдены",
    foundHead: ["Как найдена", "Создано", "Открыто", "Исправлено"],
    foundLabels: { review: "на ревью", incidental: "попутно", manual: "вручную" } satisfies Record<FoundHow, string>,
    foundNotRecorded: "не записано",
    foundUnknown: "неизвестно",
    branchesTitle: "Ветки",
    branchesEmpty: "Ветки появятся у задач, заведённых через backlog new в репозитории",
    branchesHead: ["Ветка", "Создано", "Открыто"],

    linesText,
    codeAndTests: ({ code, tests }: CodeAndTestsLines): string => `код ${code}, тесты ${tests}`,
    keptOut: "Посторонних правок вынесено",
    keptOutPending: (fixed: string): string => `исправлено ${fixed}; оценка ожидающих появится после ${constants.minFixesForEstimate} исправлений`,
    keptOutEstimated: (fixed: string, pending: string): string => `исправлено ${fixed} + ожидают ${pending}`,
    noiseWithoutBacklog: "Шум без беклога",
    noiseNote: "доля посторонних правок в пулреквестах",
    deferredToBacklog: "Вынесено в беклог",
    deferredNote: (fixed: number, pending: number): string => `исправлено ${fixed}, ожидают ${pending}`,
    pullRequestLines: "Строк в пулреквестах",
    effectWindow: `за ${effectWindow}`,
    chartScale: (chart: string): string => `Масштаб графика «${chart}»`,
    chartNames: { flow: "Долг", intake: "Создано", accuracy: "Точность проверки", effect: "Эффект", spend: "Расход" } satisfies Record<ChartId, string>,
    grainNames: { week: "неделя", day: "день" } satisfies Record<Grain, string>,
    effectTitle: "Эффективность",
    byProject: "По проектам",
    projectsHead: ["Проект", "Вынесено задач", "Исправлено строк", "Оценка ожидающих", "Строк в пулреквестах", "Шум без беклога"],
    onTopicSeries: "по теме пулреквестов",
    deferredSeries: "вынесено в беклог",
    codeLines: "код",
    testLines: "тесты",
    deferredTasks: "задач вынесено",
    effectSummary: (realLines: number, deferred: string, noise: string): string =>
      `За ${effectWindow}: в пулреквестах ${countRu(realLines, "строка", "строки", "строк")}, вынесено ${deferred}, шум без беклога ${noise}`,
    effectDaysSummary: (days: number, onTopicLines: number, deferred: string): string =>
      `За ${periods("day", days)}: по теме пулреквестов ${countRu(onTopicLines, "строка", "строки", "строк")}, вынесено ${deferred}`,
    noDeferredTasks:
      "Задач, вынесенных агентом попутно, пока нет — выигрыш считать не из чего. Агент выносит в беклог проблемы вне текущей работы, которые замечает сам (backlog new --found incidental); находки ревью и аудитов и задачи, заведённые по просьбе пользователя, сюда не входят.",
    explainerTitle: "Как считается выигрыш",
    explainerTask:
      "Каждая задача, которую агент попутно вынес из работы, — правка, которую без беклога он сделал бы в текущем пулреквесте. Выигрыш — строки, которые туда не попали. Не считаются находки ревью и аудитов и задачи, заведённые по просьбе пользователя, — они видны во вкладке «Качество», в «Происхождении».",
    explainerFixed:
      "Исправленные — точно: строки коммита из причины закрытия, без lock-файлов, документации и картинок; коммит на несколько задач делится поровну. Не считаются задачи, закрытые без исправления, и исправленные без найденного коммита.",
    explainerPending: `Ожидающие — оценка: медиана исправлений той же категории (если их не меньше ${constants.minFixesForEstimate}), иначе всех исправлений.`,
    explainerTests: `Код и тесты: тестовые файлы — ${constants.testFileGlobs.join(", ")} и каталоги ${constants.testDirectories.join(", ")}. Для ожидающих — доля тестов в тех же исправлениях.`,
    explainerNoise: `Шум без беклога = вынесено ÷ (строк в пулреквестах + оценка ожидающих); исправления уже внутри пулреквестов и не удваиваются. Окно — с внедрения беклога в проекте, не раньше ${statsPeriodGenitive} назад.`,
    now: "Сейчас:",
    fixedNow: (fixedTasks: number, fixedLines: LinesAmount): string => `${tasks(fixedTasks)} — ${linesText(fixedLines)}`,
    noPending: "ожидающих нет",
    pendingWithoutEstimate: (openTasks: number): string => `${tasks(openTasks)}, ${estimateLater}`,
    pendingEstimated: ({ openTasks, estimated, perTask }: PendingEstimate): string => `${tasks(openTasks)} ${linesText(estimated)}, в среднем ${perTask} на задачу`,
    estimateLater,
    noCommitsSinceAdoption: "нет коммитов после внедрения",
    noiseFormula: (deferred: string, real: string, estimated: string, share: string): string => `${deferred} ÷ (${real} + ${estimated}) ${share}`,

    scanStarting: "Считаем расход по расшифровкам Claude Code…",
    noTranscripts: "Расшифровки Claude Code не найдены.",
    scanProgress: (done: number, total: number): string => `Считаем расход по расшифровкам Claude Code: прочитано ${done} из ${countRu(total, "файла", "файлов", "файлов")}`,
    costNote:
      "Токены из расшифровок Claude Code: ходы, запущенные Stop-хуком беклога, — точно; вывод команд backlog и скилла — оценка по длине текста. Деньги — по ценам Claude API, подписка может стоить иначе. Расходы других агентов (Codex, Cursor) не учитываются.",
    backlogTokens: "Токены из-за беклога",
    backlogTokensNote: (hook: string, cli: string): string => `ходы хука ${hook}, вывод CLI и скилл ${cli}`,
    apiPrice: "По ценам API",
    unpricedNote: "без моделей с неизвестной ценой",
    hookTurns: "Ходов из-за хука",
    hookRunsNote: (runs: string): string => `запусков хука ${runs}`,
    cliCalls: "Вызовов CLI",
    costSince: (date: string): string => `Данные о расходе есть с ${date}`,
    byModel: "По моделям",
    noModels: "Моделей пока нет",
    modelsHead: ["Модель", "Токены", "По ценам API"],
    fastModel: (model: string): string => `${model} (быстрый режим)`,
    commandsTitle: "Команды",
    noCommands: "Команд пока не было",
    commandsHead: ["Команда", "Запусков", "Среднее время", "Средняя память", "Пиковая память"],
    megabytes: (value: number): string => `${formatDecimal("ru", value)}${NBSP}МБ`,
    milliseconds: (amount: string): string => `${amount}${NBSP}мс`,
    spendBy: { week: "Расход по неделям", day: "Расход по дням" } satisfies Record<Grain, string>,
    hookTurnTokens: "токены ходов хука",
    cliOutputTokens: "токены вывода CLI и скилла",
    hookRuns: "запуски хука",
    otherCommands: "другие команды",
    hookTurnsTooltip: "ходы хука",
    cliOutput: "вывод CLI и скилл",
    apiPriceTooltip: "по ценам API",
    tokens,
    spendSummary: ({ grain, periodCount, hookTokens, cliTokens, approxMoney, hookRuns, cliRuns }: SpendSummary): string =>
      `За ${countRu(periodCount, ...OVER_PERIOD_FORMS[grain])}: из-за хука ${tokens(hookTokens)}, вывод CLI и скилл ${cliTokens}, ${approxMoney}; запусков хука ${hookRuns}, других команд ${cliRuns}`,
    serverMemory: "Память сервера",
    memoryRestartNote: "После перезапуска сервера история начинается заново",
    memorySummary: (current: string, max: string): string => `Сейчас ${current}, максимум за ${memoryHistoryPeriod} ${max}`,
    processMemory: "память процесса",
    jsHeap: "куча JavaScript",
  };
}

export type StatsMessages = ReturnType<typeof createStatsRu>;
