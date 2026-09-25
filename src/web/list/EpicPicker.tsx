import { useRef } from "react";
import type { TaskFilter } from "../../core/model/query";
import { useMessages } from "../i18n";
import { CloseIcon } from "../ui/CloseIcon";
import { MenuOption, MenuOptions } from "../ui/Menu";
import { Popover, useClosePopover } from "../ui/Popover";
import type { EpicChoices } from "./epic-choices";
import { EpicCount, EpicDot, EpicLabel } from "./EpicLabel";
import type { ListMessages } from "./messages.ru";
import styles from "./EpicPicker.module.css";

type EpicSelection = TaskFilter["epic"];

export type EpicPickerProps = { choices: EpicChoices; selected: EpicSelection; onSelect: (epic: EpicSelection) => void };

export function EpicPicker({ choices, selected, onSelect }: EpicPickerProps) {
  const { list } = useMessages();
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = choices.epics.find((epic) => epic.id === selected);

  return (
    <div className={styles.selection}>
      <Popover
        triggerRef={trigger}
        triggerProps={{
          className: styles.toggle,
          "aria-label": chosen === undefined ? undefined : list.epicPrefix(chosen.title),
          title: chosen === undefined ? undefined : list.epicTitle(chosen.id, chosen.title),
        }}
        trigger={
          chosen === undefined ? (
            list.epicPrefix(selectionLabel(list, selected))
          ) : (
            <>
              <EpicDot tone={chosen.tone} />
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
          aria-label={list.resetEpic}
          onClick={() => {
            onSelect(undefined);
            trigger.current?.focus();
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

function EpicOptions({ choices, selected, onSelect }: EpicPickerProps) {
  const { list } = useMessages();
  const closePopover = useClosePopover();
  const choose = (epic: EpicSelection) => {
    onSelect(epic);
    closePopover();
  };
  const foreignEpic = typeof selected === "string" && !choices.epics.some((epic) => epic.id === selected) ? selected : undefined;

  return (
    <MenuOptions label={list.epics}>
      <MenuOption pressed={selected === undefined} onChoose={() => choose(undefined)}>
        {list.anyEpic}
      </MenuOption>
      <MenuOption pressed={selected === null} onChoose={() => choose(null)}>
        {list.noEpic} <EpicCount count={choices.withoutEpicCount} />
      </MenuOption>
      {(choices.epics.length > 0 || foreignEpic !== undefined) && (
        <div className={styles.epics}>
          {foreignEpic !== undefined && (
            <MenuOption pressed onChoose={() => choose(foreignEpic)}>
              <EpicLabel id={foreignEpic} title={list.epicNotFound} />
            </MenuOption>
          )}
          {choices.epics.map((epic) => (
            <MenuOption key={epic.id} pressed={selected === epic.id} tone={epic.tone} onChoose={() => choose(epic.id)}>
              <EpicLabel id={epic.id} title={epic.title} count={epic.taskCount} />
            </MenuOption>
          ))}
        </div>
      )}
    </MenuOptions>
  );
}

function selectionLabel(list: ListMessages, selected: EpicSelection): string {
  if (selected === undefined) return list.anyEpicLabel;
  if (selected === null) return list.noEpicLabel;
  return selected;
}
