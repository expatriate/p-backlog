import { Children, createContext, isValidElement, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../ui/Button";
import { checklistItems, type ChecklistItem } from "../../core/model/checklist";
import styles from "./TaskBody.module.css";

export type TaskBodyProps = {
  body: string;
  draft: string | null;
  onDraftChange: (draft: string | null) => void;
  onToggleLine: (line: number) => void;
  onSave: (body: string) => Promise<unknown>;
};

type Checklist = { items: ChecklistItem[]; onToggleLine: (line: number) => void };

const ChecklistContext = createContext<Checklist>({ items: [], onToggleLine: () => undefined });

const MARKDOWN_COMPONENTS: Components = { table: MarkdownTable, li: MarkdownItem };

export function TaskBody({ body, draft, onDraftChange, onToggleLine, onSave }: TaskBodyProps) {
  const checklist = useMemo(() => ({ items: checklistItems(body), onToggleLine }), [body, onToggleLine]);

  const save = async (text: string) => {
    try {
      await onSave(text);
      onDraftChange(null);
    } catch {
      // текст остаётся в поле: ошибку показывает карточка
    }
  };

  if (draft !== null) {
    return (
      <div className={styles.editor}>
        <textarea value={draft} rows={16} aria-label="Описание задачи" onChange={(event) => onDraftChange(event.target.value)} />
        <div className={styles.editorActions}>
          <Button variant="primary" onClick={() => void save(draft)}>
            Сохранить
          </Button>
          <Button onClick={() => onDraftChange(null)}>Отмена</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.markdown}>
        <ChecklistContext value={checklist}>
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {body}
          </Markdown>
        </ChecklistContext>
      </div>
      <Button className={styles.edit} onClick={() => onDraftChange(body)}>
        Редактировать описание
      </Button>
    </div>
  );
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.tableScroll}>
      <table>{children}</table>
    </div>
  );
}

function MarkdownItem({ node, children }: ComponentProps<"li"> & ExtraProps) {
  const { items, onToggleLine } = useContext(ChecklistContext);
  const line = (node?.position?.start.line ?? 0) - 1;
  const item = items.find((candidate) => candidate.line === line);
  if (!item) return <li>{children}</li>;
  // remark-gfm сам вставляет в пункт свой disabled-чекбокс — убираем его, свой рисуем ниже
  const text = Children.toArray(children).filter((child) => !(isValidElement(child) && child.type === "input"));
  return (
    <li className={styles.checkItem}>
      <label>
        <input type="checkbox" checked={item.checked} onChange={() => onToggleLine(item.line)} />
        <span>{text}</span>
      </label>
    </li>
  );
}
