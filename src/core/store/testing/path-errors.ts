import type { PathErrorHandler } from "../../errors";

export const failOnPathError: PathErrorHandler = (path, error) => {
  throw new Error(`unexpected path failure at ${path}`, { cause: error });
};
