import { useCallback, useMemo, useState } from "react";
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
  setDocument: (doc: WorkflowEditorDocument) => void;
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

  const dirty = useMemo(
    () => (document ? serializeImportPayload(document) !== baseline : false),
    [document, baseline],
  );

  const setDocument = useCallback((doc: WorkflowEditorDocument) => {
    setDocumentState(doc);
  }, []);

  const save = useCallback(async () => {
    if (!document) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = serializeImportPayload(document);
      await io.write(filePath, payload);
      setBaseline(payload);
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
    setDocument,
    save,
    revert,
    ...(saveAs !== undefined ? { saveAs } : {}),
    layoutKey,
  };
}
