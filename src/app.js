import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { requestSchema } from "./questionnaire.js";
import { HttpError } from "./errors.js";

export function createApp({
  generateQuestionnaire,
  rateLimitMax = 20,
  logger = console,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post(
    "/api/questionnaires",
    rateLimit({
      windowMs: 60_000,
      limit: rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again in a minute.",
        },
      },
    }),
    async (req, res) => {
      console.log("Received request:", req.body);
      if (!req.is("application/json")) {
        throw new HttpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Send the request as application/json.",
        );
      }
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid questionnaire request.",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
        });
      }
      res.json({ data: await generateQuestionnaire(parsed.data) });
    },
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Route not found.")),
  );
  app.use((err, _req, res, _next) => {
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";
    if (err instanceof HttpError) {
      ({ status, code, message } = err);
    } else if (err.type === "entity.parse.failed") {
      status = 400;
      code = "INVALID_JSON";
      message = "Request body must be valid JSON.";
    } else if (err.type === "entity.too.large") {
      status = 413;
      code = "PAYLOAD_TOO_LARGE";
      message = "Request body exceeds 16 KB.";
    } else if (err.status === 429) {
      status = 503;
      code = "UPSTREAM_RATE_LIMITED";
      message = "Generation is temporarily unavailable. Please retry later.";
    } else if (err.name === "TimeoutError" || err.status === 504) {
      status = 504;
      code = "GENERATION_TIMEOUT";
      message = "Generation timed out. Please retry.";
    } else if (
      err.name === "GeminiError" ||
      err.status ||
      err instanceof SyntaxError ||
      err.name === "ZodError"
    ) {
      status = 502;
      code = "UPSTREAM_ERROR";
      message = "The generation service could not complete the request.";
    }
    if (status >= 500)
      logger.error({ code, status, requestId: err.request_id });
    res.status(status).json({ error: { code, message } });
  });
  return app;
}
