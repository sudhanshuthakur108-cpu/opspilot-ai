# OpsPilot AI: Project Principles

Personal portfolio project (MERN + pluggable AI). See README.md for scope.

## Principles

- **Secure defaults.** Deny by default, restrict CORS to known origins, set security headers, limit request sizes, and never expose stack traces or internal errors to clients.
- **No hardcoded secrets.** Read all credentials and environment-specific values from environment variables. Add new variable names to `.env.example` with empty values, or a safe non-secret default. Never commit `.env` files. Never put secrets in `VITE_*` variables.
- **Validate all input.** Validate and sanitize request bodies, params and query strings at the API boundary before they reach business logic or the database. Treat AI output as untrusted input too.
- **Modular code.** Keep files small and focused. Separate routes, controllers, services, models and the AI provider layer. Keep the AI provider behind one interface so `mock` and `openai` can be swapped.
- **Normal CSS.** Use plain CSS files. Do not add CSS frameworks or CSS-in-JS libraries unless explicitly requested.
- **Tests for meaningful behavior.** Test validation, business logic, API contracts and error paths. Use the `mock` AI provider in tests and never call paid APIs in automated tests. Skip trivial tests.
- **No unverified claims.** Do not describe a feature as working in docs, comments or summaries unless it is implemented and verified. Mark planned work as planned.

## Boundaries

- Independent personal project. Do not use or reference any employer code, credentials, datasets or assets.
- Do not commit or push unless explicitly asked.
