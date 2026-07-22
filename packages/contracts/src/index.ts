import { z } from "zod";

export const sourceLocationSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine(
      (value) =>
        !value.startsWith("/") && !value.split("/").includes(".."),
      "path must be project-relative",
    ),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type Language = "python" | "typescript";

export type IndexStatus = {
  phase: "idle" | "scanning" | "ready" | "error";
  completed: number;
  total: number;
  diagnostics: string[];
};

export type ControllerParameter = {
  name: string;
  source: "path" | "query" | "header" | "cookie" | "body" | "unknown";
  type: string;
  required: boolean;
  defaultValue?: string;
};

export type ControllerEndpoint = {
  id: string;
  framework: "fastapi" | "nestjs";
  method: string;
  path: string;
  name: string;
  description?: string;
  parameters: ControllerParameter[];
  response: { type: string; statusCode?: number };
  location: SourceLocation;
  diagnostics: string[];
};

export type EnumCandidate = {
  language: Language;
  symbolName: string;
  qualifiedName: string;
  relativePath: string;
  location: SourceLocation;
};

export type EnumMember = {
  name: string;
  value: string;
  comment?: string;
};

export type EnumBookmark = {
  id: string;
  projectId: string;
  relativePath: string;
  symbolName: string;
  language: Language;
  createdAt: string;
};

export type ResolvedEnumBookmark = EnumBookmark & {
  state: "ready" | "missing" | "invalid";
  members: EnumMember[];
  message?: string;
};
