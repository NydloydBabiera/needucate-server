import { HttpError } from "./errors.js";

export function createGeminiClient({ apiKey, fetchImpl = globalThis.fetch, timeout = 60_000 }) {
  return {
    async generateContent(model, body) {
      try {
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeout),
          },
        );
        if (!response.ok) {
          const error = new Error("Gemini request failed.");
          error.name = "GeminiError";
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw new HttpError(504, "GENERATION_TIMEOUT", "Generation timed out. Please retry.");
        }
        if (error instanceof TypeError) {
          throw new HttpError(502, "UPSTREAM_ERROR", "The generation service could not complete the request.");
        }
        throw error;
      }
    },
  };
}
