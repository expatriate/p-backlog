import { useRef } from "react";
import { BatchNotice } from "./BatchNotice";
import { BulkActions } from "./BulkActions";
import { useBatchResult } from "./use-batch-result";
import { useScrollSpaceFor } from "./use-scroll-space";
import type { TaskSelection } from "./use-task-selection";
import styles from "./ListFooter.module.css";

export function ListFooter({ selection }: { selection: TaskSelection }) {
  const batchResult = useBatchResult();
  const footer = useRef<HTMLDivElement>(null);
  useScrollSpaceFor(footer);

  return (
    <div ref={footer} className={styles.footer}>
      <BatchNotice result={batchResult.result} serial={batchResult.serial} onResult={batchResult.show} />
      <BulkActions
        selection={selection}
        onDone={(result) => {
          selection.clear();
          batchResult.show(result);
        }}
      />
    </div>
  );
}
