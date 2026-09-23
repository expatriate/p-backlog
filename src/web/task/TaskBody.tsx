import { Children, createContext, isValidElement, useContext, useEffect, useMemo, useRef, type ComponentProps, type ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { checklistItems, type ChecklistItem } from "../../core/model/checklist";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import styles from "./TaskBody.module.css";

export type TaskBodyProps = {
  body: string;
  draft: string | null;
  saving: boolean;
  onDraftChange: (draft: string | null) => void;
  onToggleLine: (line: number) => void;
  onSave: (body: string) => Promise<unknown>;
};

type Checklist = { items: ChecklistItem[]; onToggleLine: (line: number) => void };

const ChecklistContext = createContext<Checklist>({ items: [], onToggleLine: () => undefined });

const InsideCodeBlock = createContext(false);

const MARKDOWN_COMPONENTS: Components = { table: MarkdownTable, li: MarkdownItem, pre: MarkdownPre, code: MarkdownCode };

export function TaskBody({ body, draft, saving, onDraftChange, onToggleLine, onSave }: TaskBodyProps) {
  const { ui, task: t } = useMessages();
  const items = useMemo(() => checklistItems(body), [body]);
  const markdown = useMemo(
    () => (
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {body}
      </Markdown>
    ),
    [body],
  );
  const editButton = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (draft !== null || !returnFocus.current) return;
    returnFocus.current = false;
    editButton.current?.focus();
  }, [draft]);

  const closeEditor = () => {
    returnFocus.current = focusFellWith(editor.current);
    onDraftChange(null);
  };

  const save = async (text: string) => {
    try {
      await onSave(text);
      closeEditor();
    } catch {
      // text stays in the field: the card shows the error
    }
  };

  if (draft !== null) {
    return (
      <div ref={editor} className={styles.editor}>
        <textarea autoFocus value={draft} rows={16} aria-label={t.description} onChange={(event) => onDraftChange(event.target.value)} />
        <div className={styles.editorActions}>
          <Button variant="primary" busy={saving} onClick={() => void save(draft)}>
            {saving ? t.saving : t.save}
          </Button>
          <Button busy={saving} onClick={closeEditor}>
            {ui.cancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.markdown}>
        <ChecklistContext value={{ items, onToggleLine }}>{markdown}</ChecklistContext>
      </div>
      <Button ref={editButton} className={styles.edit} onClick={() => onDraftChange(body)}>
        {t.editDescription}
      </Button>
    </div>
  );
}

function focusFellWith(editor: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || editor === null) return true;
  return editor.contains(active) || active.contains(editor);
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.tableScroll}>
      <table>{children}</table>
    </div>
  );
}

function MarkdownPre({ children }: ComponentProps<"pre">) {
  return (
    <pre>
      <InsideCodeBlock value={true}>{children}</InsideCodeBlock>
    </pre>
  );
}

function MarkdownCode({ className, children }: ComponentProps<"code">) {
  const inBlock = useContext(InsideCodeBlock);
  return <code className={cx(!inBlock && "inline-code", className)}>{children}</code>;
}

function MarkdownItem({ node, children }: ComponentProps<"li"> & ExtraProps) {
  const { items, onToggleLine } = useContext(ChecklistContext);
  const line = (node?.position?.start.line ?? 0) - 1;
  const item = items.find((candidate) => candidate.line === line);
  if (!item) return <li>{children}</li>;
  // remark-gfm inserts its own disabled checkbox into the item — strip it, we draw our own below
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
