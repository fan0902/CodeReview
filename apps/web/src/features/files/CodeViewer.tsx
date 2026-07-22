import { useQuery } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { SourceLocation } from "@cr/contracts";
import { useEffect, useRef, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";

export function CodeViewer({
  location,
  onNavigate,
  onBack,
  onForward,
}: {
  location: SourceLocation;
  onNavigate: (location: SourceLocation) => void;
  onBack: () => void;
  onForward: () => void;
}) {
  const api = useApi();
  const editorTheme = useEditorTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const disposableRef = useRef<{ dispose(): void } | null>(null);
  const file = useQuery({
    queryKey: ["file-content", location.path],
    queryFn: () => api.getFile(location.path),
  });
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    disposableRef.current?.dispose();
    const openDefinition = async (position: { lineNumber: number; column: number }) => {
      const target = await api.definition({
        path: location.path,
        line: position.lineNumber,
        column: position.column,
      });
      if (target) onNavigate(target);
    };
    disposableRef.current = monaco.languages.registerDefinitionProvider(languageFor(location.path), {
      provideDefinition: async (
        _model: unknown,
        position: { lineNumber: number; column: number },
      ) => {
        await openDefinition(position);
        return null;
      },
    });
    editor.addCommand(monaco.KeyCode.F12, () => {
      const position = editor.getPosition();
      if (position) void openDefinition(position);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, onBack);
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Minus,
      onForward,
    );
  };
  useEffect(() => () => disposableRef.current?.dispose(), []);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const position = { lineNumber: location.line, column: location.column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
  }, [location]);
  if (file.isPending) return <p className="region-placeholder">读取文件…</p>;
  if (file.isError) return <p role="alert">无法预览此文件</p>;
  return (
    <Editor
      height="100%"
      path={location.path}
      language={languageFor(location.path)}
      theme={editorTheme}
      value={file.data.content}
      onMount={handleMount}
      options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: "on", scrollBeyondLastLine: false, definitionLinkOpensInPeek: false }}
    />
  );
}

function useEditorTheme(): "light" | "vs-dark" {
  const mediaQuery = "(prefers-color-scheme: dark)";
  const [theme, setTheme] = useState<"light" | "vs-dark">(() =>
    typeof window.matchMedia === "function" && window.matchMedia(mediaQuery).matches
      ? "vs-dark"
      : "light",
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(mediaQuery);
    const update = () => setTheme(media.matches ? "vs-dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return theme;
}

function languageFor(filePath: string): "python" | "typescript" {
  return filePath.endsWith(".py") ? "python" : "typescript";
}
