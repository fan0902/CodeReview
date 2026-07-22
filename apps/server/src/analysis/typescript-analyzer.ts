import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ControllerEndpoint,
  ControllerParameter,
  SourceLocation,
} from "@cr/contracts";
import ts from "typescript";
import type {
  AnalysisResult,
  AnalyzedEnum,
  AnalyzedSymbol,
} from "./types.js";

const HTTP_DECORATORS = new Map([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Options", "OPTIONS"],
  ["Head", "HEAD"],
]);

const PARAMETER_SOURCES = new Map<
  string,
  ControllerParameter["source"]
>([
  ["Param", "path"],
  ["Query", "query"],
  ["Headers", "header"],
  ["Header", "header"],
  ["Body", "body"],
]);

export async function analyzeTypeScriptProject(
  root: string,
): Promise<AnalysisResult> {
  const result: AnalysisResult = { controllers: [], enums: [], symbols: [] };
  for (const absolutePath of await discoverTypeScriptFiles(root)) {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const source = ts.createSourceFile(
      absolutePath,
      await readFile(absolutePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const fileResult = analyzeTypeScriptFile(source, relativePath);
    result.controllers.push(...fileResult.controllers);
    result.enums.push(...fileResult.enums);
    result.symbols.push(...fileResult.symbols);
  }
  return result;
}

export function analyzeTypeScriptFile(
  sourceFile: ts.SourceFile,
  relativePath: string,
): AnalysisResult {
  const controllers: ControllerEndpoint[] = [];
  const enums: AnalyzedEnum[] = [];
  const symbols: AnalyzedSymbol[] = [];

  sourceFile.forEachChild((node) => {
    const symbol = declarationSymbol(node, sourceFile, relativePath);
    if (symbol) symbols.push(symbol);

    if (ts.isEnumDeclaration(node)) {
      enums.push(readEnum(node, sourceFile, relativePath));
    }
    if (ts.isClassDeclaration(node)) {
      const controller = decoratorCall(node, "Controller");
      if (controller) {
        controllers.push(
          ...readNestController(
            node,
            controller,
            sourceFile,
            relativePath,
          ),
        );
      }
    }
  });

  return { controllers, enums, symbols };
}

function readNestController(
  node: ts.ClassDeclaration,
  controllerCall: ts.CallExpression,
  sourceFile: ts.SourceFile,
  relativePath: string,
): ControllerEndpoint[] {
  const prefix = readLiteralArgument(controllerCall, 0, sourceFile);
  const endpoints: ControllerEndpoint[] = [];

  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const httpDecorator = decoratorsOf(member)
      .map((decorator) => asNamedCall(decorator))
      .find((item) => item && HTTP_DECORATORS.has(item.name));
    if (!httpDecorator) continue;

    const method = HTTP_DECORATORS.get(httpDecorator.name);
    if (!method) continue;
    const route = readLiteralArgument(httpDecorator.call, 0, sourceFile);
    const operation = decoratorCall(member, "ApiOperation");
    const metadata = operation
      ? readObjectMetadata(operation.arguments[0], sourceFile)
      : {};
    const methodName = member.name.getText(sourceFile);
    const diagnostics = [
      ...(prefix.dynamic
        ? [`Controller path is dynamic: ${prefix.dynamic}`]
        : []),
      ...(route.dynamic ? [`Route path is dynamic: ${route.dynamic}`] : []),
    ];
    const endpointPath = joinRoute(
      prefix.value ?? `{dynamic:${prefix.dynamic ?? "prefix"}}`,
      route.value ?? `{dynamic:${route.dynamic ?? "route"}}`,
    );

    endpoints.push({
      id: `${relativePath}:${member.pos}:${method}`,
      framework: "nestjs",
      method,
      path: endpointPath,
      name: metadata.summary ?? methodName,
      ...(metadata.description ? { description: metadata.description } : {}),
      parameters: member.parameters.map((parameter) =>
        readNestParameter(parameter, sourceFile),
      ),
      response: {
        type: member.type?.getText(sourceFile) ?? "未声明",
      },
      location: locationOf(member, sourceFile, relativePath),
      diagnostics,
    });
  }
  return endpoints;
}

function readNestParameter(
  parameter: ts.ParameterDeclaration,
  sourceFile: ts.SourceFile,
): ControllerParameter {
  const decorated = decoratorsOf(parameter)
    .map((decorator) => asNamedCall(decorator))
    .find((item) => item && PARAMETER_SOURCES.has(item.name));
  const source = decorated
    ? (PARAMETER_SOURCES.get(decorated.name) ?? "unknown")
    : "unknown";
  const decoratedName = decorated
    ? readLiteralArgument(decorated.call, 0, sourceFile).value
    : undefined;
  const defaultValue = parameter.initializer?.getText(sourceFile);

  return {
    name: decoratedName ?? parameter.name.getText(sourceFile),
    source,
    type: parameter.type?.getText(sourceFile) ?? "unknown",
    required: !parameter.questionToken && !parameter.initializer,
    ...(defaultValue ? { defaultValue } : {}),
  };
}

function readEnum(
  node: ts.EnumDeclaration,
  sourceFile: ts.SourceFile,
  relativePath: string,
): AnalyzedEnum {
  let nextNumericValue = 0;
  const members = node.members.map((member) => {
    const name = member.name.getText(sourceFile);
    if (!member.initializer) {
      const value = String(nextNumericValue);
      nextNumericValue += 1;
      return { name, value };
    }
    const value = member.initializer.getText(sourceFile);
    if (ts.isNumericLiteral(member.initializer)) {
      nextNumericValue = Number(member.initializer.text) + 1;
    }
    return { name, value };
  });
  const symbolName = node.name.text;
  return {
    language: "typescript",
    symbolName,
    qualifiedName: symbolName,
    relativePath,
    location: locationOf(node, sourceFile, relativePath),
    members,
  };
}

function declarationSymbol(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): AnalyzedSymbol | null {
  if (
    !ts.isClassDeclaration(node) &&
    !ts.isInterfaceDeclaration(node) &&
    !ts.isTypeAliasDeclaration(node) &&
    !ts.isFunctionDeclaration(node) &&
    !ts.isEnumDeclaration(node)
  ) {
    return null;
  }
  const name = node.name?.getText(sourceFile);
  return name
    ? { name, relativePath, location: locationOf(node, sourceFile, relativePath) }
    : null;
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(
  node: ts.Node,
  expectedName: string,
): ts.CallExpression | null {
  for (const decorator of decoratorsOf(node)) {
    const named = asNamedCall(decorator);
    if (named?.name === expectedName) return named.call;
  }
  return null;
}

function asNamedCall(
  decorator: ts.Decorator,
): { name: string; call: ts.CallExpression } | null {
  if (!ts.isCallExpression(decorator.expression)) return null;
  const expression = decorator.expression.expression;
  const name = ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : null;
  return name ? { name, call: decorator.expression } : null;
}

function readLiteralArgument(
  call: ts.CallExpression,
  index: number,
  sourceFile: ts.SourceFile,
): { value?: string; dynamic?: string } {
  const argument = call.arguments[index];
  if (!argument) return { value: "" };
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return { value: argument.text };
  }
  return { dynamic: argument.getText(sourceFile) };
}

function readObjectMetadata(
  expression: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): { summary?: string; description?: string } {
  if (!expression || !ts.isObjectLiteralExpression(expression)) return {};
  const result: { summary?: string; description?: string } = {};
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText(sourceFile).replaceAll(/["']/g, "");
    if (
      (name === "summary" || name === "description") &&
      ts.isStringLiteral(property.initializer)
    ) {
      result[name] = property.initializer.text;
    }
  }
  return result;
}

function locationOf(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): SourceLocation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    path: relativePath,
    line: position.line + 1,
    column: position.character + 1,
  };
}

function joinRoute(prefix: string, route: string): string {
  const segments = [prefix, route]
    .flatMap((value) => value.split("/"))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

async function discoverTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(absolutePath);
      }
    }
  }
  await visit(root);
  return files;
}
