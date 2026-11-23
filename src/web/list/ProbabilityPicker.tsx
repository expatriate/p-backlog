import { useState, type SubmitEvent } from "react";
import { formatProbabilityFilter, MAX_PROBABILITY, parseProbabilityFilter, type ProbabilityFilter } from "../../core/model/probability";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { FieldError, useFieldError } from "../ui/FieldError";
import { Popover, POPOVER_INITIAL_FOCUS, useClosePopover } from "../ui/Popover";
import styles from "./Toolbar.module.css";

type PickerProps = { selected: ProbabilityFilter | undefined; onSelect: (filter: ProbabilityFilter | undefined) => void };

export function ProbabilityPicker({ selected, onSelect }: PickerProps) {
  const { list } = useMessages();
  const trigger = selected === "none" ? list.probabilityUnestimated : selected ? list.probabilityRange(selected.min ?? 0, selected.max ?? MAX_PROBABILITY) : list.probability;
  return (
    <Popover trigger={trigger} width="content">
      <ProbabilityForm key={selected === undefined ? "" : formatProbabilityFilter(selected)} selected={selected} onSelect={onSelect} />
    </Popover>
  );
}

function ProbabilityForm({ selected, onSelect }: PickerProps) {
  const { list } = useMessages();
  const close = useClosePopover();
  const range = selected === "none" ? undefined : selected;
  const [invalid, setInvalid] = useState(false);
  const field = useFieldError(invalid ? list.probabilityFilterError : null);

  const select = (filter: ProbabilityFilter | undefined) => {
    onSelect(filter);
    close();
  };

  const apply = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const min = String(data.get("min") ?? "").trim();
    const max = String(data.get("max") ?? "").trim();
    const filter = parseProbabilityFilter(`${min}..${max}`);
    if (filter === undefined && (min !== "" || max !== "")) {
      setInvalid(true);
      return;
    }
    select(filter);
  };

  return (
    <form className={styles.probabilityForm} onSubmit={apply} onChange={() => setInvalid(false)}>
      <div className={styles.probabilityBounds}>
        <label>
          {list.probabilityMin}
          <input name="min" inputMode="numeric" defaultValue={range?.min} {...field.inputProps} {...POPOVER_INITIAL_FOCUS} />
        </label>
        <label>
          {list.probabilityMax}
          <input name="max" inputMode="numeric" defaultValue={range?.max} {...field.inputProps} />
        </label>
      </div>
      <FieldError {...field.error} />
      <div className={styles.line}>
        <Button type="submit" variant="primary">
          {list.applyProbabilityFilter}
        </Button>
        <Button onClick={() => select("none")}>{list.unestimatedProbability}</Button>
        {selected !== undefined && <Button onClick={() => select(undefined)}>{list.clearProbabilityFilter}</Button>}
      </div>
    </form>
  );
}
