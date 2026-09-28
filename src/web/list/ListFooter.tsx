import { useRef } from "react";
import type { Task } from "../../core/model/types";
import type { TaskHref } from "../task/TaskRefs";
import type { EpicTones } from "../ui/epic-tone";
import { BatchNotice } from "./BatchNotice";
import { BulkActions } from "./BulkActions";
import { useBatchResult } from "./use-batch-result";
import { useScrollSpaceFor } from "./use-scroll-space";
import type { TaskSelection } from "./use-task-selection";
import styles from "./ListFooter.module.css";

type ListFooterProps = { selection: TaskSelection; tasks: readonly Task[]; tones: EpicTones; taskHref: TaskHref };

export function ListFooter({ selection, tasks, tones, taskHref }: ListFooterProps) {
  const batchResult = useBatchResult();
  const footer = useRef<HTMLDivElement>(null);
  useScrollSpaceFor(footer);

  return (
    <div ref={footer} className={styles.footer}>
      <BatchNotice result={batchResult.result} serial={batchResult.serial} onResult={batchResult.show} taskHref={taskHref} />
      <BulkActions
        selection={selection}
        tasks={tasks}
        tones={tones}
        onDone={(result) => {
          selection.clear();
          batchResult.show(result);
        }}
      />
    </div>
  );
}
