# Questionnaire API

Node.js 22+ and Express API that generates educational questionnaires from a topic using Google Gemini. No database is required.

## Run

```powershell
npm.cmd install
Copy-Item .env.example .env
# Edit .env and set GEMINI_API_KEY to your own API key.
npm.cmd run dev
```

Use `npm start` to run without file watching. On PowerShell installations that block npm.ps1, use `npm.cmd start`. Keep your API key on the server and never commit `.env`.

Environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| GEMINI_API_KEY | Required Google Gemini API key | none |
| GEMINI_MODEL | Gemini model supporting structured JSON output | gemini-3.8-flash |
| PORT | HTTP port | 3000 |

## Generate a questionnaire

`POST /api/questionnaires` with `Content-Type: application/json`:

```json
{
  "topic": "JavaScript fundamentals",
  "questionCount": 5,
  "difficulty": "medium",
  "questionType": "multiple_choice",
  "language": "English"
}
```

Only `topic` is required (1–500 characters). `questionCount` defaults to 5 and allows 1–20. Difficulty is `easy`, `medium`, or `hard`. Question type is `multiple_choice` or `short_answer`. Language defaults to English. Unknown fields are rejected.

PowerShell example:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/questionnaires -Method Post -ContentType 'application/json' -Body '{"topic":"JavaScript fundamentals","questionCount":1}'
```

Example response:

```json
{
  "data": {
    "topic": "JavaScript fundamentals",
    "questionCount": 1,
    "difficulty": "medium",
    "questionType": "multiple_choice",
    "language": "English",
    "title": "JavaScript fundamentals quiz",
    "questions": [{
      "question": "Which keyword declares a constant binding?",
      "options": ["const", "let", "var", "def"],
      "answer": "const",
      "explanation": "A const binding cannot be reassigned."
    }]
  }
}
```

Short answer questions return `options: []`. Answers and explanations are always included, so this endpoint is intended for quiz authors; remove the answer key in your application before distributing questions to learners.

`GET /health` returns `{"status":"ok"}` as a liveness check; it does not contact Google Gemini.

Errors use `{"error":{"code":"...","message":"..."}}`. Validation errors also include `details`. Status codes: 400 invalid input/JSON, 413 oversized body, 415 unsupported content type, 422 model refusal, 429 local rate limit, 502 failed/invalid upstream generation, 503 upstream rate limit, 504 timeout. Requests are limited to 20 per minute per IP, with a 16 KB body limit and a 60 second Google Gemini timeout. No automatic upstream retries are performed.

## Verify

```powershell
npm.cmd test
```

Tests use a mocked Gemini client and do not spend API credits. Real generation requires a valid key and access to the configured model. Generated content can contain factual errors; review it before use.

This starter has no authentication or persistent storage. Add access control before exposing the paid generation endpoint publicly. The rate limiter uses process memory; multi-instance deployments need a shared store. Configure Express `trust proxy` for your specific proxy topology before relying on client IP limits behind a proxy.

Integration uses the official [Gemini generateContent API](https://ai.google.dev/api/generate-content) with a JSON schema derived from Zod, then validates question counts and answer options before returning data.
