import { useCallback, useMemo, useRef, useState } from "react";
import {
  parseImportPayload,
  serializeImportPayload,
  type WorkflowEditorDocument,
  type ValidationIssue,
} from "@cyoda/workflow-core";

export interface EditorSessionIO {
  write: (path: string, contents: string) => Promise<{ lastModified: string; sizeBytes: number }>;
  read: (path: string) => Promise<{ contents: string; lastModified: string }>;
  saveAs?: (contents: string) => Promise<{ path: string; lastModified: string; sizeBytes: number } | null>;
}

export interface EditorSessionParams {
  projectId: string;
  filePath: string;
  initialContents: string;
  io: EditorSessionIO;
}

export interface EditorSession {
  document: WorkflowEditorDocument | null;
  issues: ValidationIssue[];
  parseOk: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  rawContent: string;
  /** Internal edit path — used by the editor's own `onChange`. Does NOT force a remount. */
  setDocument: (doc: WorkflowEditorDocument) => void;
  /**
   * Replace the document from *outside* the editor (AI apply, programmatic edits). Bumps
   * {@link EditorSession.externalRevision} so the host can remount the uncontrolled
   * `WorkflowEditor`, which otherwise only reads `document` on first render.
   */
  applyExternalDocument: (doc: WorkflowEditorDocument) => void;
  /** Increments whenever the document is replaced externally (apply/revert). */
  externalRevision: number;
  /** True when an AI-applied snapshot is available to undo (cleared by manual edits or save). */
  canUndoAi: boolean;
  /** Roll back the last AI-applied document. No-op if no snapshot available. */
  undoAiApply: () => void;
  save: () => Promise<void>;
  revert: () => Promise<void>;
  saveAs?: () => Promise<{ path: string; lastModified: string; sizeBytes: number } | null>;
  /** localStorage key for editor layout — exposed for the WorkflowEditor prop. */
  layoutKey: string;
}

export function useEditorSession({
  projectId,
  filePath,
  initialContents,
  io,
}: EditorSessionParams): EditorSession {
  const initialParsed = useMemo(
    () => parseImportPayload(initialContents),
    [initialContents],
  );
  const [document, setDocumentState] = useState<WorkflowEditorDocument | null>(
    initialParsed.document ?? null,
  );
  const [issues, setIssues] = useState<ValidationIssue[]>(initialParsed.issues);
  const [parseOk, setParseOk] = useState<boolean>(initialParsed.ok);
  const [baseline, setBaseline] = useState<string>(() =>
    initialParsed.document ? serializeImportPayload(initialParsed.document) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalRevision, setExternalRevision] = useState(0);
  const aiSnapshotRef = useRef<WorkflowEditorDocument | null>(null);
  const [canUndoAi, setCanUndoAi] = useState(false);

  const dirty = useMemo(
    () => (document ? serializeImportPayload(document) !== baseline : false),
    [document, baseline],
  );

  const setDocument = useCallback((doc: WorkflowEditorDocument) => {
    setDocumentState(doc);
    // Any manual edit clears the AI snapshot — undoing would discard user's own work.
    aiSnapshotRef.current = null;
    setCanUndoAi(false);
  }, []);

  const applyExternalDocument = useCallback((doc: WorkflowEditorDocument) => {
    aiSnapshotRef.current = document;
    setCanUndoAi(true);
    setDocumentState(doc);
    setExternalRevision((r) => r + 1);
  }, [document]);

  const undoAiApply = useCallback(() => {
    const snapshot = aiSnapshotRef.current;
    if (!snapshot) return;
    aiSnapshotRef.current = null;
    setCanUndoAi(false);
    setDocumentState(snapshot);
    setExternalRevision((r) => r + 1);
  }, []);

  const save = useCallback(async () => {
    if (!document) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = serializeImportPayload(document);
      await io.write(filePath, payload);
      setBaseline(payload);
      aiSnapshotRef.current = null;
      setCanUndoAi(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [document, filePath, io]);

  const revert = useCallback(async () => {
    const { contents } = await io.read(filePath);
    const result = parseImportPayload(contents, document?.meta);
    setDocumentState(result.document ?? null);
    setIssues(result.issues);
    setParseOk(result.ok);
    setBaseline(result.document ? serializeImportPayload(result.document) : "");
    setExternalRevision((r) => r + 1);
  }, [filePath, io, document]);

  const saveAsCallback = useCallback(async () => {
    if (!document || !io.saveAs) return null;
    const payload = serializeImportPayload(document);
    const result = await io.saveAs(payload);
    if (result) {
      setBaseline(payload);
    }
    return result ?? null;
  }, [document, io]);

  const saveAs = io.saveAs != null ? saveAsCallback : undefined;

  const layoutKey = `${projectId}:${filePath}`;
  return {
    document,
    issues,
    parseOk,
    dirty,
    saving,
    saveError,
    rawContent: initialContents,
    setDocument,
    applyExternalDocument,
    externalRevision,
    canUndoAi,
    undoAiApply,
    save,
    revert,
    ...(saveAs !== undefined ? { saveAs } : {}),
    layoutKey,
  };
}
