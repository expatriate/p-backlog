import { useState } from "react";
import { useMessages } from "../i18n";
import { Button } from "./Button";

export function RetryButton({ failure, onRetry }: { failure: Error; onRetry: () => Promise<unknown> }) {
  const { ui } = useMessages();
  const [retriedFailure, setRetriedFailure] = useState<Error | null>(null);
  const retrying = retriedFailure === failure;
  const retry = () => {
    setRetriedFailure(failure);
    void onRetry().finally(() => setRetriedFailure((current) => (current === failure ? null : current)));
  };
  return (
    <Button busy={retrying} onClick={retry}>
      {retrying ? ui.retrying : ui.retry}
    </Button>
  );
}
