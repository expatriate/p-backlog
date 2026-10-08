import { Fragment, useMemo } from "react";
import type { ProjectView } from "../../core/api/contract";
import { useProjects } from "../app/queries";
import { useMessages } from "../i18n";
import type { GraphTrouble, HintPart } from "./messages.ru";
import styles from "./GraphNotes.module.css";

const GRAPH_TROUBLES: readonly GraphTrouble[] = ["none", "stale", "unreadable"];

export function GraphNotes() {
  const { layout, core } = useMessages();
  const projects = useProjects();
  const graphTroubles = useMemo(() => graphTroubleCounts(projects.data ?? []), [projects.data]);
  if (graphTroubles.length === 0) return null;

  return (
    <div className={styles.graphNotes}>
      {graphTroubles.map(([state, count]) => {
        const note = layout.graphNotes[state];
        return (
          <p key={state} className={styles.graphNote}>
            {note.title}: {core.count(count, "project")}
            <span>
              <GraphHint parts={note.hint} />
            </span>
          </p>
        );
      })}
    </div>
  );
}

function GraphHint({ parts }: { parts: readonly HintPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{"code" in part ? <code>{part.code}</code> : part.text}</Fragment>
      ))}
    </>
  );
}

function graphTroubleCounts(projects: readonly ProjectView[]): [GraphTrouble, number][] {
  const watched = projects.filter((project) => project.active && project.repos.length > 0);
  return GRAPH_TROUBLES.flatMap((state): [GraphTrouble, number][] => {
    const count = watched.filter((project) => project.codeGraph === state).length;
    return count === 0 ? [] : [[state, count]];
  });
}
