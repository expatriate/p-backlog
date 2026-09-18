import { useRef, type ReactNode } from "react";
import type { TaskFilter } from "../../core/model/query";
import { cx } from "../ui/cx";
import { Popover, POPOVER_INITIAL_FOCUS, useClosePopover } from "../ui/Popover";
import type { EpicChoices } from "./epic-choices";
import styles from "./EpicPicker.module.css";

export type EpicSelection = TaskFilter["epic"];

export type EpicPickerProps = { choices: EpicChoices; selected: EpicSelection; onSelect: (epic: EpicSelection) => void };

export function EpicPicker({ choices, selected, onSelect }: EpicPickerProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = choices.epics.find((epic) => epic.id === selected);

  return (
    <div className={styles.selection}>
      <Popover
        triggerRef={trigger}
        triggerProps={{
          className: styles.toggle,
          "aria-label": chosen === undefined ? undefined : `Эпик: ${chosen.title}`,
          title: chosen === undefined ? undefined : `${chosen.id} — ${chosen.title}`,
        }}
        trigger={
          chosen === undefined ? (
            `Эпик: ${selectionLabel(selected)}`
          ) : (
            <>
              <span className={styles.dot} data-epic-tone={chosen.tone} aria-hidden="true" />
              <span className={styles.chosenTitle}>{chosen.title}</span>
            </>
          )
        }
      >
        <EpicOptions choices={choices} selected={selected} onSelect={onSelect} />
      </Popover>
      {selected !== undefined && (
        <button
          type="button"
          className={styles.reset}
          aria-label="Сбросить эпик"
          onClick={() => {
            onSelect(undefined);
            trigger.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function EpicOptions({ choices, selected, onSelect }: EpicPickerProps) {
  const closePopover = useClosePopover();
  const choose = (epic: EpicSelection) => {
    onSelect(epic);
    closePopover();
  };

  return (
    <div className={styles.options} role="group" aria-label="Эпики">
      <EpicOption pressed={selected === undefined} onChoose={() => choose(undefined)}>
        Любой эпик
      </EpicOption>
      <EpicOption pressed={selected === null} onChoose={() => choose(null)}>
        Без эпика <span className={styles.count}>{choices.withoutEpicCount}</span>
      </EpicOption>
      <div className={styles.epics}>
        {choices.epics.map((epic) => (
          <EpicOption key={epic.id} pressed={selected === epic.id} tone={epic.tone} onChoose={() => choose(epic.id)}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.id}>{epic.id}</span>
            <span className={styles.title}>{epic.title}</span>
            <span className={styles.count}>{epic.taskCount}</span>
          </EpicOption>
        ))}
      </div>
    </div>
  );
}

function EpicOption({ pressed, tone, onChoose, children }: { pressed: boolean; tone?: number; onChoose: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(styles.option, pressed && styles.pressed)}
      aria-pressed={pressed}
      data-epic-tone={tone}
      {...(pressed ? POPOVER_INITIAL_FOCUS : {})}
      onClick={onChoose}
    >
      {children}
    </button>
  );
}

function selectionLabel(selected: EpicSelection): string {
  if (selected === undefined) return "любой";
  if (selected === null) return "без эпика";
  return selected;
}
