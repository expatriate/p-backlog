import { Children, createContext, isValidElement, useContext, useMemo, useRef, type ComponentProps, type ReactElement, type ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { checklistItems, type ChecklistItem } from "../../core/model/checklist";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { useRestoreFocus } from "../ui/use-restore-focus";
import type { BodyEditorView } from "./use-task-saving";
import styles from "./TaskBody.module.css";

export type TaskBodyProps = {
  body: string;
  editor: BodyEditorView;
  onEdit: (draft: string) => void;
  onCloseEditor: () => void;
  onToggleLine: (line: number) => void;
  onSave: (body: string) => Promise<boolean>;
};

type Checklist = { items: ChecklistItem[]; onToggleLine: (line: number) => void };

const EDITOR_ROWS = 16;

const ChecklistContext = createContext<Checklist>({ items: [], onToggleLine: () => undefined });

const InsideCodeBlock = createContext(false);

const MARKDOWN_COMPONENTS: Components = { table: MarkdownTable, li: MarkdownItem, pre: MarkdownPre, code: MarkdownCode };

export function TaskBody({ body, editor, onEdit, onCloseEditor, onToggleLine, onSave }: TaskBodyProps) {
  const { ui, task: taskMessages } = useMessages();
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
  const editorBox = useRef<HTMLDivElement>(null);
  const restoreFocusOnClose = useRestoreFocus(editButton, editorBox, editor.phase !== "closed");

  const closeEditor = () => {
    restoreFocusOnClose();
    onCloseEditor();
  };

  const save = async (text: string) => {
    if (await onSave(text)) closeEditor();
  };

  if (editor.phase !== "closed") {
    const saving = editor.phase === "saving";
    return (
      <div ref={editorBox} className={styles.editor}>
        <textarea autoFocus value={editor.text} readOnly={saving} rows={EDITOR_ROWS} aria-label={taskMessages.description} onChange={(event) => onEdit(event.target.value)} />
        <div className={styles.editorActions}>
          <Button variant="primary" busy={saving} onClick={() => void save(editor.text)}>
            {saving ? taskMessages.saving : taskMessages.save}
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
      <Button ref={editButton} className={styles.edit} onClick={() => onEdit(body)}>
        {taskMessages.editDescription}
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
  const { label, continuation } = checkItemParts(children);
  return (
    <li className={styles.checkItem}>
      <label>
        <input type="checkbox" checked={item.checked} onChange={() => onToggleLine(item.line)} />
        <span>{label}</span>
      </label>
      {continuation.length > 0 && <div className={styles.continuation}>{continuation}</div>}
    </li>
  );
}

function checkItemParts(children: ReactNode): { label: ReactNode[]; continuation: ReactNode[] } {
  const parts = Children.toArray(children);
  const leadElement = parts.find((part) => isValidElement(part));
  if (!isParagraph(leadElement)) return { label: withoutGfmCheckbox(parts), continuation: [] };
  return { label: withoutGfmCheckbox(leadElement.props.children), continuation: parts.filter((part) => isValidElement(part) && part !== leadElement) };
}

function isParagraph(node: ReactNode): node is ReactElement<{ children?: ReactNode }> {
  return isValidElement(node) && node.type === "p";
}

function withoutGfmCheckbox(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => !(isValidElement(child) && child.type === "input"));
}
