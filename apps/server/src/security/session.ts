import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";

export function requireSession(options: {
  token: string;
  allowedOrigin: () => string;
}) {
  const expected = Buffer.from(options.token);
  return (request: Request, _response: Response, next: NextFunction) => {
    const supplied = request.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const actual = Buffer.from(supplied);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      next(new AppError("UNAUTHORIZED", "A valid CR session token is required.", 401));
      return;
    }
    const origin = request.get("Origin");
    if (origin && origin !== options.allowedOrigin()) {
      next(new AppError("UNTRUSTED_ORIGIN", "The request Origin is not trusted.", 403));
      return;
    }
    if (!origin && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next(new AppError("UNTRUSTED_ORIGIN", "A trusted Origin is required.", 403));
      return;
    }
    next();
  };
}
