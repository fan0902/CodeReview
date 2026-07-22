import path from "node:path";
import type { SourceLocation } from "@cr/contracts";
import ts from "typescript";

export class TypeScriptNavigation {
  private readonly root: string;
  private readonly fileNames: string[];
  private readonly service: ts.LanguageService;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.fileNames = ts.sys.readDirectory(
      this.root,
      [".ts", ".tsx"],
      ["node_modules", ".git", "dist", "build"],
    );
    const options: ts.CompilerOptions = {
      allowJs: false,
      experimentalDecorators: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
    };
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getCurrentDirectory: () => this.root,
      getDefaultLibFileName: (compilerOptions) =>
        ts.getDefaultLibFilePath(compilerOptions),
      getScriptFileNames: () => this.fileNames,
      getScriptSnapshot: (fileName) => {
        const content = ts.sys.readFile(fileName);
        return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
      },
      getScriptVersion: () => "1",
      fileExists: ts.sys.fileExists,
      readDirectory: ts.sys.readDirectory,
      readFile: ts.sys.readFile,
    };
    this.service = ts.createLanguageService(
      host,
      ts.createDocumentRegistry(),
    );
  }

  definition(
    relativePath: string,
    line: number,
    column: number,
  ): SourceLocation | null {
    const fileName = path.resolve(this.root, relativePath);
    if (!this.isInside(fileName)) return null;
    const sourceFile = this.service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile || line < 1 || column < 1) return null;
    const lineIndex = line - 1;
    if (lineIndex >= sourceFile.getLineStarts().length) return null;
    const offset = sourceFile.getPositionOfLineAndCharacter(
      lineIndex,
      column - 1,
    );
    const definition = this.service.getDefinitionAtPosition(fileName, offset)?.[0];
    if (!definition || !this.isInside(definition.fileName)) return null;
    const targetFile = this.service
      .getProgram()
      ?.getSourceFile(definition.fileName);
    if (!targetFile) return null;
    const target = targetFile.getLineAndCharacterOfPosition(
      definition.textSpan.start,
    );
    return {
      path: path
        .relative(this.root, definition.fileName)
        .split(path.sep)
        .join("/"),
      line: target.line + 1,
      column: target.character + 1,
    };
  }

  private isInside(fileName: string): boolean {
    const relative = path.relative(this.root, path.resolve(fileName));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }
}
