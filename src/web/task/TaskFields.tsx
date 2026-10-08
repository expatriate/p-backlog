import { useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import { epicProblems } from "../../core/model/integrity";
import { PRIORITIES, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, type Task } from "../../core/model/types";
import { useAllTasks } from "../app/all-tasks";
import { useMessages } from "../i18n";
import { FieldError, useFieldError } from "../ui/FieldError";
import type { Draft } from "../ui/use-draft";
import { parseTagInput } from "./tag-input";
import styles from "./TaskFields.module.css";

export type TaskFieldsProps = {
  task: Task;
  epicListId: string;
  onChange: (changes: TaskChangesRequest) => Promise<boolean>;
  tags: Draft;
  epic: Draft;
};

export function TaskFields({ task, epicListId, onChange, tags, epic }: TaskFieldsProps) {
  const { core, task: taskMessages } = useMessages();
  const { index } = useAllTasks();
  const { ref: epicRef } = epic;
  const { ref: tagsRef } = tags;
  const [epicError, setEpicError] = useState<string | null>(null);
  const epicField = useFieldError(epicError);

  const saveEpic = () => {
    const value = epic.canonical;
    const problems = value === "" ? [] : epicProblems({ ...task, epic: value }, (id) => index.byId.get(id));
    setEpicError(problems.length === 0 ? null : core.problems(problems));
    if (problems.length > 0) return;
    epic.commit((next) => onChange({ epic: next === "" ? null : next }));
  };

  const saveTags = () => tags.commit((next) => onChange({ tags: parseTagInput(next) }));

  return (
    <>
      <div className={styles.grid}>
        <ChoiceSelect label={taskMessages.statusField} value={task.status} choices={TASK_STATUSES} labelFor={core.statusLabel} onChange={(status) => void onChange({ status })} />
        <ChoiceSelect label={taskMessages.priorityField} value={task.priority} choices={PRIORITIES} labelFor={core.priorityLabel} onChange={(priority) => void onChange({ priority })} />
        <OptionalChoiceSelect
          label={taskMessages.categoryField}
          value={task.category}
          choices={TASK_CATEGORIES}
          labelFor={core.categoryLabel}
          emptyLabel={core.categoryLabel(undefined)}
          onChange={(category) => void onChange({ category })}
        />
        <ChoiceSelect label={taskMessages.typeField} value={task.type} choices={TASK_TYPES} labelFor={core.typeLabel} onChange={(type) => void onChange({ type })} />
        <label>
          {taskMessages.epicField}
          <input
            ref={epicRef}
            list={epicListId}
            value={epic.value}
            placeholder={taskMessages.epicPlaceholder}
            {...epicField.inputProps}
            onChange={(event) => {
              epic.set(event.target.value);
              setEpicError(null);
            }}
            onBlur={saveEpic}
          />
          <FieldError {...epicField.error} />
        </label>
      </div>

      <label className={styles.tags}>
        {taskMessages.tagsField}
        <input ref={tagsRef} value={tags.value} onChange={(event) => tags.set(event.target.value)} onBlur={saveTags} />
      </label>
    </>
  );
}

type ChoiceSelectProps<T extends string> = {
  label: string;
  value: T;
  choices: readonly T[];
  labelFor: (choice: T) => string;
  onChange: (value: T) => void;
};

function ChoiceSelect<T extends string>({ label, value, choices, labelFor, onChange }: ChoiceSelectProps<T>) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => {
          const choice = choiceOf(choices, event.target.value);
          if (choice !== undefined) onChange(choice);
        }}
      >
        <ChoiceOptions choices={choices} labelFor={labelFor} />
      </select>
    </label>
  );
}

type OptionalChoiceSelectProps<T extends string> = Omit<ChoiceSelectProps<T>, "value" | "onChange"> & {
  value: T | undefined;
  emptyLabel: string;
  onChange: (value: T | null) => void;
};

function OptionalChoiceSelect<T extends string>({ label, value, choices, labelFor, emptyLabel, onChange }: OptionalChoiceSelectProps<T>) {
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(choiceOf(choices, event.target.value) ?? null)}>
        <option value="">{emptyLabel}</option>
        <ChoiceOptions choices={choices} labelFor={labelFor} />
      </select>
    </label>
  );
}

function ChoiceOptions<T extends string>({ choices, labelFor }: Pick<ChoiceSelectProps<T>, "choices" | "labelFor">) {
  return choices.map((choice) => (
    <option key={choice} value={choice}>
      {labelFor(choice)}
    </option>
  ));
}

function choiceOf<T extends string>(choices: readonly T[], value: string): T | undefined {
  return choices.find((choice) => choice === value);
}
