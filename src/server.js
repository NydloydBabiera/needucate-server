import { createGeminiClient } from "./gemini.js";
import { createApp } from "./app.js";
import { createQuestionnaireGenerator } from "./questionnaire.js";

if (
  !process.env.GEMINI_API_KEY?.trim() ||
  process.env.GEMINI_API_KEY === "your_gemini_api_key_here"
) {
  throw new Error("Set GEMINI_API_KEY in .env before starting the server.");
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const client = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY });
const app = createApp({
  generateQuestionnaire: createQuestionnaireGenerator(
    client,
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
  ),
});
const server = app.listen(port, () =>
  console.log(`Questionnaire API listening on http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
