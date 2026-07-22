export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function appError(code: string): AppError {
  const definitions: Record<string, { message: string; status: number }> = {
    BINARY_FILE: { message: "Binary files cannot be previewed.", status: 415 },
    DIRECTORY_PICKER_FAILED: { message: "The macOS directory picker failed.", status: 500 },
    FILE_TOO_LARGE: { message: "Files larger than 5 MiB cannot be previewed.", status: 413 },
    INVALID_ENCODING: { message: "The file is not valid UTF-8 text.", status: 415 },
    PATH_OUTSIDE_PROJECT: { message: "The requested path is outside the project.", status: 403 },
  };
  const definition = definitions[code] ?? { message: "Unexpected application error.", status: 500 };
  return new AppError(code, definition.message, definition.status);
}
