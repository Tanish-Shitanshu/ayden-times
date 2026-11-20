import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  language: "python" | "javascript" | "sql" | "markdown" | "text";
  readOnly?: boolean;
  dark: boolean;
  gotoLine?: { line: number; token: number } | null;
  label: string;
  minHeight?: string;
  wrap?: boolean;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "13.5px", backgroundColor: "transparent" },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--outline)", color: "var(--text-secondary)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-variant)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-flash-line": { backgroundColor: "color-mix(in srgb, var(--warning) 28%, transparent)" },
});

export default function CodeEditor({ value, onChange, language, readOnly, dark, gotoLine, label, minHeight = "320px", wrap }: CodeEditorProps) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(() => {
    const lang = language === "python" ? [python()] : language === "sql" ? [sql()] : language === "javascript" ? [javascript()] : language === "markdown" ? [markdown()] : [];
    return [...lang, baseTheme, EditorView.contentAttributes.of({ "aria-label": label }), ...(wrap ? [EditorView.lineWrapping] : [])];
  }, [language, label, wrap]);

  useEffect(() => {
    if (!gotoLine) return;
    const id = requestAnimationFrame(() => {
      const view = ref.current?.view;
      if (!view) return;
      const n = Math.max(1, Math.min(gotoLine.line, view.state.doc.lines));
      const line = view.state.doc.line(n);
      view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
      view.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [gotoLine]);

  return (
    <CodeMirror ref={ref} value={value} onChange={onChange} extensions={extensions} theme={dark ? "dark" : "light"} editable={!readOnly} readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false, searchKeymap: true }} minHeight={minHeight} />
  );
}
