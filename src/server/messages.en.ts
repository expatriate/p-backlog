import type { ServerMessages } from "./messages.ru";

export const serverEn: ServerMessages = {
  taskNotFound: (id) => `Task ${id} not found`,
  taskChangedOnDisk: "The task changed on disk",
  projectNotFound: (id) => `Project ${id} not found`,
  confirmMismatch: "Confirmation does not match the project id",
  bodyNotParsed: "Request body could not be parsed: JSON expected",
  batchSkipped: {
    changed: (id) => `${id} changed on disk`,
    "not-found": (id) => `${id} not found`,
    "already-closed": (id) => `${id} is already closed`,
    invalid: (id) => `${id}: the action doesn't apply to it`,
    busy: (id) => `${id} is busy in another process`,
  },
  unknownRoute: (path) => `Unknown API route: ${path}`,
  hostRejected: (host) => `Requests from host ${host} are not accepted`,
  jsonContentTypeExpected: "Content-Type: application/json is expected",

  runsTrimFailed: (detail) => `Could not trim the run log: ${detail}`,
  serverStarted: (port, root) => `p-backlog: http://localhost:${port}\nBacklog directory: ${root}\n`,
  settingsFileInvalid: (path) => `${path} could not be parsed, the language for this run was detected automatically. The file was not changed — fix it manually.`,

  sweepFailed: (detail) => `Could not delete closed tasks: ${detail}`,
  closedEpics: (ids) => `Closed completed epics: ${ids}`,
  epicsBlockedByFiles: (paths) => `Epics will not close until these files are fixed: ${paths}`,
  deletedClosedTasks: (ids) => `Deleted closed tasks: ${ids}`,
  conflictedDuringSweep: (ids) => `Tasks changed during the sweep, will retry next time: ${ids}`,
  invalidAfterSweep: (detail) => `Could not update tasks, fix the files: ${detail}`,

  transcriptsScanFailed: (detail) => `Could not read Claude Code transcripts: ${detail}`,
  watcherError: (root, detail) => `Watcher for directory ${root}: ${detail}`,

  invalidPort: (source, value) => `${source}: expected a number from 1 to 65535, got "${value}"`,
  listenFailed: (reason) => `p-backlog failed to start: ${reason}`,
  portBusy: (port) => `port ${port} is already in use`,

  codeCacheReadFailed: (detail) => `Could not read the git cache: ${detail}`,
  codeCacheWriteFailed: (detail) => `Could not save the git cache: ${detail}`,
};
