import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SourceLocation } from "@cr/contracts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { CodeViewer } from "./CodeViewer.js";

const monacoState = vi.hoisted(() => ({
  provider: null as null | {
    provideDefinition: (
      model: { uri: { path: string } },
      position: { lineNumber: number; column: number },
    ) => Promise<unknown>;
  },
  commands: new Map<number, () => void | Promise<void>>(),
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onMount }: { value: string; onMount: (editor: unknown, monaco: unknown) => void }) => {
    onMount(
      {
        revealPositionInCenter: vi.fn(),
        setPosition: vi.fn(),
        focus: vi.fn(),
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 13 })),
        addCommand: vi.fn((key: number, command: () => void | Promise<void>) => {
          monacoState.commands.set(key, command);
        }),
      },
      {
        languages: {
          registerDefinitionProvider: (_language: string, provider: typeof monacoState.provider) => {
            monacoState.provider = provider;
            return { dispose: vi.fn() };
          },
        },
        KeyMod: { WinCtrl: 1, Shift: 2 },
        KeyCode: { F12: 3, Minus: 4 },
      },
    );
    return <pre data-testid="editor">{value}</pre>;
  },
}));

afterEach(() => {
  cleanup();
  monacoState.provider = null;
  monacoState.commands.clear();
});

describe("CodeViewer", () => {
  it("opens a definition returned by the API", async () => {
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

    await act(async () => {
      await monacoState.provider?.provideDefinition(
        { uri: { path: "nest/src/users.controller.ts" } },
        { lineNumber: 1, column: 13 },
      );
    });

    expect(api.definition).toHaveBeenCalledWith({
      path: "nest/src/users.controller.ts",
      line: 1,
      column: 13,
    });
    expect(onNavigate).toHaveBeenCalledWith({
      path: "nest/src/user.dto.ts",
      line: 1,
      column: 14,
    });
  });

  it("opens the current symbol definition with F12", async () => {
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

    await act(async () => {
      await monacoState.commands.get(3)?.();
    });

    expect(onNavigate).toHaveBeenCalledWith({
      path: "nest/src/user.dto.ts",
      line: 1,
      column: 14,
    });
  });
});

function renderViewer(api: ApiClient, onNavigate: (location: SourceLocation) => void) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ApiProvider client={api}>
        <CodeViewer
          location={{ path: "nest/src/users.controller.ts", line: 1, column: 1 }}
          onNavigate={onNavigate}
          onBack={() => undefined}
          onForward={() => undefined}
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
