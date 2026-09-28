import { useRef } from "react";
import type { Task } from "../../core/model/types";
import type { TaskHref } from "../task/TaskRefs";
import type { EpicTones } from "../ui/epic-tone";
import { BatchNotice, useBatchResult } from "./BatchNotice";
import { BulkActions } from "./BulkActions";
import { useScrollSpaceFor } from "./use-scroll-space";
import type { TaskSelection } from "./use-task-selection";
import styles from "./ListFooter.module.css";

type ListFooterProps = { projectId: string | undefined; selection: TaskSelection; tasks: readonly Task[]; tones: EpicTones; taskHref: TaskHref };

export function ListFooter({ projectId, selection, tasks, tones, taskHref }: ListFooterProps) {
  const batchResult = useBatchResult(projectId ?? "");
  const footer = useRef<HTMLDivElement>(null);
  useScrollSpaceFor(footer);

  return (
    <div ref={footer} className={styles.footer}>
      <BatchNotice key={`notice-${projectId ?? ""}`} result={batchResult.result} serial={batchResult.serial} onResult={batchResult.show} taskHref={taskHref} />
      <BulkActions
        key={`actions-${projectId ?? ""}`}
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
