import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import { getMonacoRuntime } from "./monacoRuntime.js";

getMonacoRuntime();

/**
 * A read-only JSON pane — a SEPARATE plain `monaco.editor.create(...)` instance,
 * deliberately NOT the `@cyoda/workflow-react` editor's built-in `jsonEditor` tab
 * (that tab is read-only only in `mode:"viewer"`, which also freezes the graph).
 * `readOnly: true` is hardcoded, not a prop: content is Claude-owned everywhere
 * in this app — there is no save/dirty machinery here at all, unlike the
 * editable `apps/dev-console` original this was ported from.
 */
export function MonacoJsonViewer({ contents }: { contents: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = monaco.editor.create(containerRef.current, {
      value: contents,
      language: "json",
      theme: "vs",
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      renderLineHighlight: "line",
      wordWrap: "off",
      folding: true,
      automaticLayout: true,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0,
    });
    editorRef.current = editor;
    return () => { editor.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live pushes / view switches replace the model value in place, no remount.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== contents) model.setValue(contents);
  }, [contents]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
