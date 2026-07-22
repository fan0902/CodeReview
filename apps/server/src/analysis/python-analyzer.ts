import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ControllerEndpoint,
  ControllerParameter,
  SourceLocation,
} from "@cr/contracts";
import type { SyntaxNode } from "@lezer/common";
import { parser } from "@lezer/python";
import type {
  AnalysisResult,
  AnalyzedEnum,
  AnalyzedSymbol,
} from "./types.js";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

export async function analyzePythonProject(root: string): Promise<AnalysisResult> {
  const result: AnalysisResult = { controllers: [], enums: [], symbols: [] };
  for (const absolutePath of await discoverPythonFiles(root)) {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const fileResult = analyzePythonFile(
      relativePath,
      await readFile(absolutePath, "utf8"),
    );
    result.controllers.push(...fileResult.controllers);
    result.enums.push(...fileResult.enums);
    result.symbols.push(...fileResult.symbols);
  }
  return result;
}

export function analyzePythonFile(
  relativePath: string,
  source: string,
): AnalysisResult {
  const tree = parser.parse(source);
  const routers = collectRouters(tree.topNode, source);
  const controllers: ControllerEndpoint[] = [];
  const enums: AnalyzedEnum[] = [];
  const symbols: AnalyzedSymbol[] = [];

  for (const node of directChildren(tree.topNode)) {
    if (node.type.name === "DecoratedStatement") {
      const functionNode = findDirectOrNested(node, "FunctionDefinition");
      if (functionNode) {
        const endpoint = readFastApiFunction(
          node,
          functionNode,
          routers,
          relativePath,
          source,
        );
        if (endpoint) controllers.push(endpoint);
        const nameNode = directChildren(functionNode).find(
          (child) => child.type.name === "VariableName",
        );
        if (nameNode) {
          symbols.push({
            name: textOf(nameNode, source),
            relativePath,
            location: locationOf(functionNode, relativePath, source),
          });
        }
      }
    } else if (node.type.name === "FunctionDefinition") {
      const nameNode = directChildren(node).find(
        (child) => child.type.name === "VariableName",
      );
      if (nameNode) {
        symbols.push({
          name: textOf(nameNode, source),
          relativePath,
          location: locationOf(node, relativePath, source),
        });
      }
    } else if (node.type.name === "ClassDefinition") {
      const analyzedEnum = readPythonEnum(node, relativePath, source);
      if (analyzedEnum) enums.push(analyzedEnum);
      const nameNode = directChildren(node).find(
        (child) => child.type.name === "VariableName",
      );
      if (nameNode) {
        symbols.push({
          name: textOf(nameNode, source),
          relativePath,
          location: locationOf(node, relativePath, source),
        });
      }
    }
  }

  return { controllers, enums, symbols };
}

type RouterInfo = {
  prefix?: string;
  dynamicPrefix?: string;
};

function collectRouters(root: SyntaxNode, source: string): Map<string, RouterInfo> {
  const routers = new Map<string, RouterInfo>();
  for (const node of directChildren(root)) {
    if (node.type.name !== "AssignStatement") continue;
    const children = directChildren(node);
    const variable = children.find((child) => child.type.name === "VariableName");
    const call = children.find((child) => child.type.name === "CallExpression");
    if (!variable || !call) continue;
    const parsed = parseCall(textOf(call, source));
    if (!parsed || (parsed.callee !== "APIRouter" && parsed.callee !== "FastAPI")) {
      continue;
    }
    const prefixExpression = parsed.named.get("prefix");
    if (!prefixExpression) {
      routers.set(textOf(variable, source), { prefix: "" });
      continue;
    }
    const prefix = literalString(prefixExpression);
    routers.set(
      textOf(variable, source),
      prefix === null
        ? { dynamicPrefix: prefixExpression }
        : { prefix },
    );
  }
  return routers;
}

function readFastApiFunction(
  decoratedNode: SyntaxNode,
  functionNode: SyntaxNode,
  routers: Map<string, RouterInfo>,
  relativePath: string,
  source: string,
): ControllerEndpoint | null {
  const decorators = directChildren(decoratedNode).filter(
    (child) => child.type.name === "Decorator",
  );
  const routeDecorator = decorators
    .map((node) => ({ node, parsed: parseDecorator(textOf(node, source)) }))
    .find(({ parsed }) => parsed && HTTP_METHODS.has(parsed.method));
  if (!routeDecorator?.parsed) return null;

  const router = routers.get(routeDecorator.parsed.target);
  if (!router) return null;
  const functionChildren = directChildren(functionNode);
  const nameNode = functionChildren.find(
    (child) => child.type.name === "VariableName",
  );
  const parametersNode = functionChildren.find(
    (child) => child.type.name === "ParamList",
  );
  if (!nameNode || !parametersNode) return null;

  const call = parseCall(routeDecorator.parsed.callText);
  if (!call) return null;
  const routeExpression = call.positional[0] ?? '""';
  const routeLiteral = literalString(routeExpression);
  const summary = literalString(call.named.get("summary") ?? "");
  const description = literalString(call.named.get("description") ?? "");
  const responseModel = call.named.get("response_model");
  const returnType = functionChildren
    .filter((child) => child.type.name === "TypeDef")
    .at(-1);
  const functionName = textOf(nameNode, source);
  const diagnostics = [
    ...(router.dynamicPrefix
      ? [`Router prefix is dynamic: ${router.dynamicPrefix}`]
      : []),
    ...(routeLiteral === null
      ? [`Route path is dynamic: ${routeExpression}`]
      : []),
  ];
  const routePath = joinRoute(
    router.prefix ?? `{dynamic:${router.dynamicPrefix ?? "prefix"}}`,
    routeLiteral ?? `{dynamic:${routeExpression}}`,
  );

  return {
    id: `${relativePath}:${functionNode.from}:${routeDecorator.parsed.method}`,
    framework: "fastapi",
    method: routeDecorator.parsed.method.toUpperCase(),
    path: routePath,
    name: summary || functionName,
    ...(description ? { description } : {}),
    parameters: parsePythonParameters(
      textOf(parametersNode, source),
      routePath,
    ),
    response: {
      type:
        responseModel ??
        (returnType
          ? textOf(returnType, source).replace(/^\s*->\s*/, "").trim()
          : "未声明"),
    },
    location: locationOf(functionNode, relativePath, source),
    diagnostics,
  };
}

function parsePythonParameters(
  parameterList: string,
  routePath: string,
): ControllerParameter[] {
  const inner = parameterList.slice(1, -1);
  return splitTopLevel(inner)
    .map((value) => value.trim())
    .filter((value) => value && value !== "*" && value !== "/")
    .map((parameter) => {
      const equalIndex = findTopLevel(parameter, "=");
      const declaration =
        equalIndex >= 0 ? parameter.slice(0, equalIndex).trim() : parameter;
      const defaultExpression =
        equalIndex >= 0 ? parameter.slice(equalIndex + 1).trim() : undefined;
      const colonIndex = findTopLevel(declaration, ":");
      const name = (
        colonIndex >= 0 ? declaration.slice(0, colonIndex) : declaration
      )
        .trim()
        .replace(/^\*+/, "");
      const type =
        colonIndex >= 0 ? declaration.slice(colonIndex + 1).trim() : "unknown";
      const wrappedDefault = defaultExpression
        ? parseCall(defaultExpression)
        : null;
      const source = parameterSource(
        name,
        routePath,
        wrappedDefault?.callee,
      );
      const wrapperDefault = wrappedDefault?.positional[0];
      const required =
        equalIndex < 0 ||
        wrapperDefault === "..." ||
        defaultExpression === "...";
      const effectiveDefault = wrappedDefault
        ? wrapperDefault && wrapperDefault !== "..."
          ? wrapperDefault
          : undefined
        : defaultExpression;

      return {
        name,
        source,
        type,
        required,
        ...(effectiveDefault ? { defaultValue: effectiveDefault } : {}),
      };
    });
}

function parameterSource(
  name: string,
  routePath: string,
  wrapper: string | undefined,
): ControllerParameter["source"] {
  if (wrapper === "Path") return "path";
  if (wrapper === "Query") return "query";
  if (wrapper === "Header") return "header";
  if (wrapper === "Cookie") return "cookie";
  if (wrapper === "Body") return "body";
  if (routePath.includes(`{${name}}`)) return "path";
  return "query";
}

function readPythonEnum(
  node: SyntaxNode,
  relativePath: string,
  source: string,
): AnalyzedEnum | null {
  const children = directChildren(node);
  const nameNode = children.find((child) => child.type.name === "VariableName");
  const basesNode = children.find((child) => child.type.name === "ArgList");
  const bodyNode = children.find((child) => child.type.name === "Body");
  if (!nameNode || !basesNode || !bodyNode) return null;
  const bases = splitTopLevel(textOf(basesNode, source).slice(1, -1));
  if (!bases.some((base) => ["Enum", "IntEnum", "StrEnum"].includes(base.trim()))) {
    return null;
  }

  const members = directChildren(bodyNode)
    .filter((child) => child.type.name === "AssignStatement")
    .flatMap((assignment) => {
      const assignmentChildren = directChildren(assignment);
      const memberName = assignmentChildren.find(
        (child) => child.type.name === "VariableName",
      );
      const operator = assignmentChildren.find(
        (child) => child.type.name === "AssignOp",
      );
      if (!memberName || !operator) return [];
      const value = source.slice(operator.to, assignment.to).trim();
      return [{ name: textOf(memberName, source), value }];
    });
  const symbolName = textOf(nameNode, source);
  return {
    language: "python",
    symbolName,
    qualifiedName: symbolName,
    relativePath,
    location: locationOf(node, relativePath, source),
    members,
  };
}

function parseDecorator(text: string): {
  target: string;
  method: string;
  callText: string;
} | null {
  const match = text.trim().match(/^@([A-Za-z_]\w*)\.([A-Za-z_]\w*)(\([\s\S]*\))$/);
  return match?.[1] && match[2] && match[3]
    ? { target: match[1], method: match[2], callText: `${match[2]}${match[3]}` }
    : null;
}

function parseCall(text: string): {
  callee: string;
  positional: string[];
  named: Map<string, string>;
} | null {
  const open = text.indexOf("(");
  if (open < 1 || !text.trimEnd().endsWith(")")) return null;
  const callee = text.slice(0, open).trim();
  const inside = text.slice(open + 1, text.lastIndexOf(")"));
  const positional: string[] = [];
  const named = new Map<string, string>();
  for (const argument of splitTopLevel(inside)) {
    const equal = findTopLevel(argument, "=");
    if (equal > 0) {
      named.set(argument.slice(0, equal).trim(), argument.slice(equal + 1).trim());
    } else if (argument.trim()) {
      positional.push(argument.trim());
    }
  }
  return { callee, positional, named };
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if ("([{".includes(character ?? "")) depth += 1;
    else if (")]}".includes(character ?? "")) depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function findTopLevel(text: string, needle: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if ("([{".includes(character ?? "")) depth += 1;
    else if (")]}".includes(character ?? "")) depth -= 1;
    else if (character === needle && depth === 0) return index;
  }
  return -1;
}

function literalString(expression: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const body = trimmed.slice(1, -1);
    return body.replaceAll(`\\${trimmed[0]}`, trimmed[0] ?? "").replaceAll("\\n", "\n");
  }
  return null;
}

function directChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function findDirectOrNested(node: SyntaxNode, typeName: string): SyntaxNode | null {
  for (const child of directChildren(node)) {
    if (child.type.name === typeName) return child;
    const nested = findDirectOrNested(child, typeName);
    if (nested) return nested;
  }
  return null;
}

function textOf(node: SyntaxNode, source: string): string {
  return source.slice(node.from, node.to);
}

function locationOf(
  node: SyntaxNode,
  relativePath: string,
  source: string,
): SourceLocation {
  const before = source.slice(0, node.from);
  const lines = before.split("\n");
  return {
    path: relativePath,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function joinRoute(prefix: string, route: string): string {
  const segments = [prefix, route]
    .flatMap((value) => value.split("/"))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

async function discoverPythonFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        [".git", ".venv", "venv", "node_modules", "__pycache__"].includes(
          entry.name,
        )
      ) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && entry.name.endsWith(".py")) files.push(absolutePath);
    }
  }
  await visit(root);
  return files;
}
