type Failure = { failed: string };

export function isFailure<Done extends string, Failed extends Failure>(outcome: Done | Failed): outcome is Failed {
  return typeof outcome === "object";
}
