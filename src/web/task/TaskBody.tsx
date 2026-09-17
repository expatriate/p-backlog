import { Children, isValidElement, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../ui/Button";
import { checklistItems } from "../../core/model/checklist";
import styles from "./TaskBody.module.css";

export type TaskBodyProps = {
  body: string;
  onToggleLine: (line: number) => void;
  onSave: (body: string) => Promise<unknown>;
};

export function TaskBody({ body, onToggleLine, onSave }: TaskBodyProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const checklist = checklistItems(body);

  const save = async (text: string) => {
    try {
      await onSave(text);
      setDraft(null);
    } catch {
      // текст остаётся в поле: ошибку показывает карточка
    }
  };

  if (draft !== null) {
    return (
      <div className={styles.editor}>
        <textarea value={draft} rows={16} aria-label="Описание задачи" onChange={(event) => setDraft(event.target.value)} />
        <div className={styles.editorActions}>
          <Button variant="primary" onClick={() => void save(draft)}>
            Сохранить
          </Button>
          <Button onClick={() => setDraft(null)}>Отмена</Button>
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
            },
          }}
        >
          {body}
        </Markdown>
      </div>
      <Button className={styles.edit} onClick={() => setDraft(body)}>
        Редактировать описание
      </Button>
    </div>
  );
}
