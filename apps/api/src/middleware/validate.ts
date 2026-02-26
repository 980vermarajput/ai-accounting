import type { Request, Response, NextFunction } from "express";
import type { ZodSchema} from "zod";
import { ZodError } from "zod";
import type { ApiResponse } from "@ai-accounting/shared";

/**
 * Express middleware factory — validates req.body against a Zod schema.
 * On failure returns a 400 ApiResponse with field-level details.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: err.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; "),
          },
        };
        res.status(400).json(response);
        return;
      }
      next(err);
    }
  };
}
