import { createContext, useContext, type ReactNode } from "react";
import type { BacklogIndex } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import type { EpicTones } from "../list/epic-tone";

export type AllTasks = { tasks: readonly Task[]; index: BacklogIndex; tones: EpicTones };

const AllTasksContext = createContext<AllTasks | null>(null);

export function AllTasksProvider({ value, children }: { value: AllTasks; children: ReactNode }) {
  return <AllTasksContext.Provider value={value}>{children}</AllTasksContext.Provider>;
}

export function useAllTasks(): AllTasks {
  const allTasks = useContext(AllTasksContext);
  if (!allTasks) throw new Error("AllTasksProvider is not mounted");
  return allTasks;
}
