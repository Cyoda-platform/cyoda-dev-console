import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { getMonacoRuntime } from "../monacoRuntime.js";

getMonacoRuntime();

export function MonacoJsonViewer({
  contents,
  onSave,
  onDirtyChange,
}: {
  contents: string;
  onSave?: (value: string) => void;
  onDirtyChange?: (dirty: boolean, currentValue?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onSaveRef = useRef(onSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const baselineRef = useRef(contents);
  onSaveRef.current = onSave;
  onDirtyChangeRef.current = onDirtyChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = monaco.editor.create(containerRef.current, {
      value: contents,
      language: "json",
      theme: "vs",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      renderLineHighlight: "line",
      wordWrap: "off",
      folding: true,
      automaticLayout: true,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0,
    });
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.(editor.getValue());
    });

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      const dirty = value !== baselineRef.current;
      onDirtyChangeRef.current?.(dirty, value);
    });

    return () => { editor.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external content changes (after save/reload)
  useEffect(() => {
    baselineRef.current = contents;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== contents) {
      model.setValue(contents);
    }
    onDirtyChangeRef.current?.(false);
  }, [contents]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
