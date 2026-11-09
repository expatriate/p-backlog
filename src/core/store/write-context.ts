import type { PathErrorHandler } from "../errors";

export type WriteContext = { now: Date; onError: PathErrorHandler };
