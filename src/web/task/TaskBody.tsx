import { Children, isValidElement, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { checklistItems } from "../../core/model/checklist";
import styles from "./TaskBody.module.css";

export type TaskBodyProps = {
  body: string;
  onToggleLine: (line: number) => void;
  onSave: (body: string) => void;
};

export function TaskBody({ body, onToggleLine, onSave }: TaskBodyProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const checklist = checklistItems(body);

  if (draft !== null) {
    return (
      <div className={styles.editor}>
        <textarea value={draft} rows={16} aria-label="Описание задачи" onChange={(event) => setDraft(event.target.value)} />
        <div className={styles.editorActions}>
          <button
            type="button"
            className={styles.save}
            onClick={() => {
              onSave(draft);
              setDraft(null);
            }}
          >
            Сохранить
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.markdown}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            li: ({ node, children }) => {
              const line = (node?.position?.start.line ?? 0) - 1;
              const item = checklist.find((candidate) => candidate.line === line);
              if (!item) return <li>{children}</li>;
              const text = Children.toArray(children).filter((child) => !(isValidElement(child) && child.type === "input"));
              return (
                <li className={styles.checkItem}>
                  <label>
                    <input type="checkbox" checked={item.checked} onChange={() => onToggleLine(item.line)} />
                    <span>{text}</span>
                  </label>
                </li>
              );
            },
          }}
        >
          {body}
        </Markdown>
      </div>
      <button type="button" className={styles.edit} onClick={() => setDraft(body)}>
        Редактировать описание
      </button>
    </div>
  );
}
