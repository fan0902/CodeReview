import type { SourceLocation } from "@cr/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { CodeViewer } from "./CodeViewer.js";

type Position = { lineNumber: number; column: number };
type MouseInput = {
  event: {
    metaKey: boolean;
    leftButton: boolean;
    browserEvent?: { metaKey: boolean; button: number };
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
  target: { position: Position | null };
};
type DefinitionResult = {
  uri: { scheme: string; path: string; query: string };
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
};

const monacoState = vi.hoisted(() => ({
  mouseDown: null as null | ((event: MouseInput) => void | Promise<void>),
  providers: new Map<string, {
    provideDefinition: (_model: unknown, position: Position) => Promise<unknown>;
  }>(),
  opener: null as null | {
    openCodeEditor: (
      source: unknown,
      resource: { scheme: string; path: string; query: string },
    ) => boolean | Promise<boolean>;
  },
  editor: null as unknown,
  mouseDisposable: { dispose: vi.fn() },
  providerDisposables: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  openerDisposable: { dispose: vi.fn() },
  commands: new Map<number, () => void | Promise<void>>(),
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onMount,
  }: {
    value: string;
    onMount: (editor: unknown, monaco: unknown) => void;
  }) => {
    const editor = {
      revealPositionInCenter: vi.fn(),
      setPosition: vi.fn(),
      focus: vi.fn(),
      getPosition: vi.fn(() => ({ lineNumber: 1, column: 13 })),
      onMouseDown: vi.fn((listener: typeof monacoState.mouseDown) => {
        monacoState.mouseDown = listener;
        return monacoState.mouseDisposable;
      }),
      addCommand: vi.fn((key: number, command: () => void | Promise<void>) => {
        monacoState.commands.set(key, command);
      }),
    };
    monacoState.editor = editor;
    onMount(editor, {
      languages: {
        registerDefinitionProvider: vi.fn((language: string, provider: never) => {
          monacoState.providers.set(language, provider);
          const disposable = { dispose: vi.fn() };
          monacoState.providerDisposables.push(disposable);
          return disposable;
        }),
      },
      editor: {
        registerEditorOpener: vi.fn((opener: never) => {
          monacoState.opener = opener;
          return monacoState.openerDisposable;
        }),
      },
      Uri: {
        from: (parts: { scheme: string; path: string; query: string }) => parts,
      },
      Range: class {
        constructor(
          readonly startLineNumber: number,
          readonly startColumn: number,
          readonly endLineNumber: number,
          readonly endColumn: number,
        ) {}
      },
      KeyMod: { CtrlCmd: 256, Shift: 512, WinCtrl: 1024 },
      KeyCode: { F12: 3, Minus: 4 },
    });
    return <pre data-testid="editor">{value}</pre>;
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  monacoState.mouseDown = null;
  monacoState.providers.clear();
  monacoState.opener = null;
  monacoState.editor = null;
  monacoState.mouseDisposable.dispose.mockClear();
  monacoState.providerDisposables.splice(0);
  monacoState.openerDisposable.dispose.mockClear();
  monacoState.commands.clear();
});

describe("CodeViewer", () => {
  it("keeps definition-provider lookup side-effect free and opens its CR target", async () => {
    const onNavigate = vi.fn();
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "const user: UserDto = value;",
      }),
      definition: vi.fn().mockResolvedValue({
        path: "nest/src/user.dto.ts",
        line: 3,
        column: 7,
      }),
    });
    renderViewer(api, onNavigate);
    await screen.findByText(/UserDto/);

    expect([...monacoState.providers.keys()].sort()).toEqual(["python", "typescript"]);
    const definition = await monacoState.providers.get("typescript")?.provideDefinition(
      {},
      { lineNumber: 1, column: 13 },
    ) as DefinitionResult | undefined;

    expect(definition).toMatchObject({
      uri: { scheme: "cr-definition" },
      range: { startLineNumber: 3, startColumn: 7 },
    });
    expect(onNavigate).not.toHaveBeenCalled();

    const handled = await monacoState.opener?.openCodeEditor(
      monacoState.editor,
      definition!.uri,
    );
    expect(handled).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith({
      path: "nest/src/user.dto.ts",
      line: 3,
      column: 7,
    });
  });

  it("accepts raw browser Command+left-click fields and reuses provider resolution", async () => {
    const onNavigate = vi.fn();
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "const user: UserDto = value;",
      }),
      definition: vi.fn().mockResolvedValue({
        path: "nest/src/user.dto.ts",
        line: 1,
        column: 14,
      }),
    });
    renderViewer(api, onNavigate);
    await screen.findByText(/UserDto/);
    const position = { lineNumber: 1, column: 13 };
    await monacoState.providers.get("typescript")?.provideDefinition({}, position);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    await act(async () => {
      monacoState.mouseDown?.({
        event: {
          metaKey: false,
          leftButton: false,
          browserEvent: { metaKey: true, button: 0 },
          preventDefault,
          stopPropagation,
        },
        target: { position },
      });
    });

    expect(api.definition).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("keeps an in-flight definition cached even after the result TTL passes", async () => {
    let resolveDefinition: (target: SourceLocation) => void = () => undefined;
    const pendingDefinition = new Promise<SourceLocation>((resolve) => {
      resolveDefinition = resolve;
    });
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "UserDto",
      }),
      definition: vi.fn().mockReturnValue(pendingDefinition),
    });
    renderViewer(api, vi.fn());
    await screen.findByText("UserDto");
    vi.useFakeTimers();
    const provider = monacoState.providers.get("typescript")!;
    const position = { lineNumber: 1, column: 13 };

    const first = provider.provideDefinition({}, position);
    vi.advanceTimersByTime(2_000);
    const second = provider.provideDefinition({}, position);

    expect(api.definition).toHaveBeenCalledOnce();
    resolveDefinition({ path: "nest/src/user.dto.ts", line: 1, column: 1 });
    await Promise.all([first, second]);
  });

  it("keeps definition-provider lookup failures silent during hover", async () => {
    const onNavigate = vi.fn();
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "UserDto",
      }),
      definition: vi.fn().mockRejectedValue(new Error("offline")),
    });
    renderViewer(api, onNavigate);
    await screen.findByText("UserDto");

    await expect(
      monacoState.providers.get("typescript")?.provideDefinition(
        {},
        { lineNumber: 1, column: 13 },
      ),
    ).resolves.toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    [
      { metaKey: false, leftButton: true, browserEvent: { metaKey: false, button: 0 } },
      { lineNumber: 1, column: 13 },
    ],
    [
      { metaKey: true, leftButton: false, browserEvent: { metaKey: true, button: 2 } },
      { lineNumber: 1, column: 13 },
    ],
    [
      { metaKey: true, leftButton: true, browserEvent: { metaKey: true, button: 0 } },
      null,
    ],
  ])(
    "does not resolve a definition for an incomplete Command click",
    async (event, position) => {
      const api = fakeApi({
        getFile: vi.fn().mockResolvedValue({
          path: "nest/src/users.controller.ts",
          content: "const user: UserDto = value;",
        }),
      });
      renderViewer(api, vi.fn());
      await screen.findByText(/UserDto/);

      await act(async () => {
        monacoState.mouseDown?.({
          event: { ...event, preventDefault: vi.fn(), stopPropagation: vi.fn() },
          target: { position },
        });
      });

      expect(api.definition).not.toHaveBeenCalled();
    },
  );

  it("shows a polite status when an explicit navigation has no definition", async () => {
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "missing",
      }),
      definition: vi.fn().mockResolvedValue(null),
    });
    renderViewer(api, vi.fn());
    await screen.findByText("missing");

    await act(async () => {
      monacoState.mouseDown?.(commandClick({ lineNumber: 1, column: 1 }));
    });

    expect((await screen.findByRole("status")).textContent).toBe(
      "未找到定义，可将光标置于符号上按 F12 重试",
    );
  });

  it("shows a retry status when an explicit definition request fails", async () => {
    let rejectDefinition: (error: Error) => void = () => undefined;
    const definition = new Promise<null>((_resolve, reject) => {
      rejectDefinition = reject;
    });
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "UserDto",
      }),
      definition: vi.fn().mockReturnValue(definition),
    });
    renderViewer(api, vi.fn());
    await screen.findByText("UserDto");

    const pending = monacoState.mouseDown?.(
      commandClick({ lineNumber: 1, column: 13 }),
    );
    expect(pending).toBeInstanceOf(Promise);
    rejectDefinition(new Error("offline"));
    await act(async () => {
      await pending;
    });

    expect(screen.getByRole("status").textContent).toBe(
      "定义跳转失败，请按 F12 重试",
    );
  });

  it("keeps F12 and binds history to Control-minus shortcuts", async () => {
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    const onForward = vi.fn();
    const api = fakeApi({
      getFile: vi.fn().mockResolvedValue({
        path: "nest/src/users.controller.ts",
        content: "const user: UserDto = value;",
      }),
      definition: vi.fn().mockResolvedValue({
        path: "nest/src/user.dto.ts",
        line: 1,
        column: 14,
      }),
    });
    renderViewer(api, onNavigate, onBack, onForward);
    await screen.findByText(/UserDto/);

    await act(async () => {
      await monacoState.commands.get(3)?.();
    });
    monacoState.commands.get(1024 | 4)?.();
    monacoState.commands.get(1024 | 512 | 4)?.();

    expect(onNavigate).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(monacoState.commands.has(256 | 4)).toBe(false);
  });

  it("disposes providers, opener, and mouse listener on unmount", async () => {
    const view = renderViewer(
      fakeApi({
        getFile: vi.fn().mockResolvedValue({ path: "a.ts", content: "value" }),
      }),
      vi.fn(),
    );
    await screen.findByText("value");

    view.unmount();

    expect(monacoState.providerDisposables).toHaveLength(2);
    expect(
      monacoState.providerDisposables.every((item) => item.dispose.mock.calls.length > 0),
    ).toBe(true);
    expect(monacoState.openerDisposable.dispose).toHaveBeenCalled();
    expect(monacoState.mouseDisposable.dispose).toHaveBeenCalled();
  });
});

function commandClick(position: Position): MouseInput {
  return {
    event: {
      metaKey: true,
      leftButton: true,
      browserEvent: { metaKey: true, button: 0 },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    },
    target: { position },
  };
}

function renderViewer(
  api: ApiClient,
  onNavigate: (location: SourceLocation) => void,
  onBack: () => void = () => undefined,
  onForward: () => void = () => undefined,
) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ApiProvider client={api}>
        <CodeViewer
          location={{ path: "nest/src/users.controller.ts", line: 1, column: 1 }}
          onNavigate={onNavigate}
          onBack={onBack}
          onForward={onForward}
        />
      </ApiProvider>
    </QueryClientProvider>,
  );
}

function fakeApi(overrides: Partial<ApiClient>): ApiClient {
  return {
    headers: () => ({}),
    getTree: vi.fn(),
    selectProject: vi.fn(),
    recentProjects: vi.fn(),
    openRecent: vi.fn(),
    indexStatus: vi.fn(),
    getFile: vi.fn(),
    definition: vi.fn(),
    ...overrides,
  } as ApiClient;
}
