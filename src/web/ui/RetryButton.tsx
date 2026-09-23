import { useMessages } from "../i18n";
import { Button } from "./Button";

export function RetryButton({ fetching, onRetry }: { fetching: boolean; onRetry: () => void }) {
  const { ui } = useMessages();
  return (
    <Button busy={fetching} onClick={onRetry}>
      {fetching ? ui.retrying : ui.retry}
    </Button>
  );
}
