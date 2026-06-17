import { useCallback, useMemo, useRef, useState } from "react";
import {
  parseImportPayload,
  serializeImportPayload,
  type WorkflowEditorDocument,
  type ValidationIssue,
} from "@cyoda/workflow-core";
import { synthesizeImportPayload } from "./synthesizeImportPayload.js";

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
  /**
   * The project's configured cyoda-go dialect. Controls which dialect parses and
   * serializes this file. Defaults to the library's latest when omitted.
   */
  cyodaGoVersion?: string;
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
  /**
   * Human-readable notes from the parser about constructs dropped on load (e.g. a
   * scheduled processor removed by the v0.7 dialect). Informational — does not block
   * editing. Cleared via {@link EditorSession.dismissWarnings}.
   */
  warnings: string[];
  /** Dismiss the current parse warnings banner. */
  dismissWarnings: () => void;
  /**
   * Set when the project targets v0.7 but the loaded workflow contains a scheduled
   * transition (a v0.8-only construct). Serializing under v0.7 would silently drop it,
   * so this blocks save until the project is switched to v0.8 or the schedule removed.
   * `null` when there is no violation.
   */
  scheduleViolation: string | null;
}

/** True when any transition in the document carries a `schedule` field. */
function hasScheduledTransition(doc: WorkflowEditorDocument | null): boolean {
  if (!doc) return false;
  return doc.session.workflows.some((wf) =>
    Object.values(wf.states).some((state) =>
      state.transitions.some((tr) => tr.schedule !== undefined),
    ),
  );
}

export function useEditorSession({
  projectId,
  filePath,
  initialContents,
  io,
  cyodaGoVersion,
}: EditorSessionParams): EditorSession {
  const initialParsed = useMemo(
    () =>
      parseImportPayload(
        initialContents,
        undefined,
        cyodaGoVersion ? { sourceVersion: cyodaGoVersion } : undefined,
      ),
    [initialContents, cyodaGoVersion],
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
  const [warnings, setWarnings] = useState<string[]>(initialParsed.warnings ?? []);

  const dirty = useMemo(
    () => (document ? serializeImportPayload(document) !== baseline : false),
    [document, baseline],
  );

  const scheduleViolation = useMemo(
    () =>
      cyodaGoVersion === "0.7" && hasScheduledTransition(document)
        ? "This workflow contains a scheduled transition, which is not supported in cyoda-go v0.7. " +
          "Switch the project to v0.8.0+ or remove the schedule configuration."
        : null,
    [cyodaGoVersion, document],
  );

  const dismissWarnings = useCallback(() => setWarnings([]), []);

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
    if (scheduleViolation) {
      // Saving under v0.7 would silently drop the schedule — treat as a hard error.
      setSaveError(scheduleViolation);
      throw new Error(scheduleViolation);
    }
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
  }, [document, filePath, io, scheduleViolation]);

  const revert = useCallback(async () => {
    const { contents } = await io.read(filePath);
    const result = parseImportPayload(
      synthesizeImportPayload(contents),
      document?.meta,
      cyodaGoVersion ? { sourceVersion: cyodaGoVersion } : undefined,
    );
    setDocumentState(result.document ?? null);
    setIssues(result.issues);
    setParseOk(result.ok);
    setWarnings(result.warnings ?? []);
    setBaseline(result.document ? serializeImportPayload(result.document) : "");
    setExternalRevision((r) => r + 1);
  }, [filePath, io, document, cyodaGoVersion]);

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
    warnings,
    dismissWarnings,
    scheduleViolation,
  };
}
