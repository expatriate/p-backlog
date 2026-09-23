import { Button } from "./Button";

export function RetryButton({ fetching, onRetry }: { fetching: boolean; onRetry: () => void }) {
  return (
    <Button busy={fetching} onClick={onRetry}>
      {fetching ? "Повторяем…" : "Повторить"}
    </Button>
  );
}
