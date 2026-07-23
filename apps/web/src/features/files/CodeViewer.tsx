import { useQuery } from "@tanstack/react-query";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { SourceLocation } from "@cr/contracts";
import type { editor as MonacoEditor, Uri } from "monaco-editor";
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
  const locationRef = useRef(location);
  const registrationsRef = useRef<Array<{ dispose(): void }>>([]);
  const definitionCacheRef = useRef(new Map<string, {
    expiresAt: number;
    promise: Promise<SourceLocation | null>;
  }>());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [definitionNotice, setDefinitionNotice] = useState<string | null>(null);
  locationRef.current = location;
  const file = useQuery({
    queryKey: ["file-content", location.path],
    queryFn: () => api.getFile(location.path),
  });

  const disposeEditorBindings = () => {
    for (const registration of registrationsRef.current.splice(0)) registration.dispose();
  };

  const showDefinitionNotice = (message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setDefinitionNotice(message);
    noticeTimerRef.current = setTimeout(() => {
      setDefinitionNotice(null);
      noticeTimerRef.current = null;
    }, 2_000);
  };

  const handleMount: OnMount = (editor, monaco) => {
    disposeEditorBindings();
    editorRef.current = editor;

    const resolveDefinition = (position: { lineNumber: number; column: number }) => {
      const source = {
        path: locationRef.current.path,
        line: position.lineNumber,
        column: position.column,
      };
      const key = `${source.path}:${source.line}:${source.column}`;
      const now = Date.now();
      for (const [candidate, entry] of definitionCacheRef.current) {
        if (entry.expiresAt <= now) definitionCacheRef.current.delete(candidate);
      }
      const cached = definitionCacheRef.current.get(key);
      if (cached) return cached.promise;

      const request = api.definition(source);
      const entry = {
        expiresAt: Number.POSITIVE_INFINITY,
        promise: request,
      };
      entry.promise = request.then((target) => {
        entry.expiresAt = Date.now() + 1_500;
        return target;
      }).catch((error: unknown) => {
        definitionCacheRef.current.delete(key);
        throw error;
      });
      definitionCacheRef.current.set(key, entry);
      return entry.promise;
    };

    const toDefinitionUri = (target: SourceLocation) =>
      monaco.Uri.from({
        scheme: "cr-definition",
        path: "/target",
        query: new URLSearchParams({
          path: target.path,
          line: String(target.line),
          column: String(target.column),
        }).toString(),
      });

    const fromDefinitionUri = (resource: { scheme: string; query: string }) => {
      if (resource.scheme !== "cr-definition") return null;
      const parameters = new URLSearchParams(resource.query);
      const path = parameters.get("path");
      const line = Number(parameters.get("line"));
      const column = Number(parameters.get("column"));
      return path &&
        Number.isInteger(line) &&
        line > 0 &&
        Number.isInteger(column) &&
        column > 0
        ? { path, line, column }
        : null;
    };

    let lastNavigation = { key: "", at: 0 };
    const navigateToTarget = (target: SourceLocation) => {
      const key = `${target.path}:${target.line}:${target.column}`;
      const now = Date.now();
      if (lastNavigation.key === key && now - lastNavigation.at < 250) return;
      lastNavigation = { key, at: now };
      onNavigate(target);
    };

    const provider = {
      provideDefinition: async (
        _model: unknown,
        position: { lineNumber: number; column: number },
      ) => {
        try {
          const target = await resolveDefinition(position);
          if (!target) return null;
          return {
            uri: toDefinitionUri(target),
            range: new monaco.Range(
              target.line,
              target.column,
              target.line,
              target.column,
            ),
          };
        } catch {
          return null;
        }
      },
    };
    const providerDisposables = ["python", "typescript"].map((language) =>
      monaco.languages.registerDefinitionProvider(language, provider),
    );
    const openerDisposable = monaco.editor.registerEditorOpener({
      openCodeEditor: (source: MonacoEditor.ICodeEditor, resource: Uri) => {
        if (source !== editor) return false;
        const target = fromDefinitionUri(resource);
        if (!target) return false;
        navigateToTarget(target);
        return true;
      },
    });

    const navigateFromPosition = async (position: {
      lineNumber: number;
      column: number;
    }) => {
      try {
        const target = await resolveDefinition(position);
        if (!target) {
          showDefinitionNotice("未找到定义，可将光标置于符号上按 F12 重试");
          return;
        }
        setDefinitionNotice(null);
        navigateToTarget(target);
      } catch {
        showDefinitionNotice("定义跳转失败，请按 F12 重试");
      }
    };

    const mouseDisposable = editor.onMouseDown((event) => {
      const browserEvent = event.event.browserEvent;
      const commandPressed = event.event.metaKey || browserEvent?.metaKey === true;
      const leftButton = event.event.leftButton || browserEvent?.button === 0;
      const position = event.target.position;
      if (!commandPressed || !leftButton || !position) return;
      event.event.preventDefault();
      event.event.stopPropagation();
      return navigateFromPosition(position);
    });
    registrationsRef.current = [
      ...providerDisposables,
      openerDisposable,
      mouseDisposable,
    ];

    editor.addCommand(monaco.KeyCode.F12, () => {
      const position = editor.getPosition();
      if (position) return navigateFromPosition(position);
    });
    editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Minus, onBack);
    editor.addCommand(
      monaco.KeyMod.WinCtrl | monaco.KeyMod.Shift | monaco.KeyCode.Minus,
      onForward,
    );
  };
  useEffect(
    () => () => {
      disposeEditorBindings();
      definitionCacheRef.current.clear();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );
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
    <div className="code-viewer">
      <Editor
        height="100%"
        path={location.path}
        language={languageFor(location.path)}
        theme={editorTheme}
        value={file.data.content}
        onMount={handleMount}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          definitionLinkOpensInPeek: false,
        }}
      />
      {definitionNotice ? (
        <div className="definition-status" role="status" aria-live="polite">
          {definitionNotice}
        </div>
      ) : null}
    </div>
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
