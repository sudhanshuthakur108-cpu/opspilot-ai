# OpsPilot AI

OpsPilot AI is a planned operations management SaaS for teams. Teams will be able to track customers, orders and operational tasks, get AI-assisted suggestions, and approve AI-proposed changes before they are applied. It is an independent personal portfolio project.

> **Status: early scaffold.** The repository contains a minimal runnable app: an Express API with liveness and readiness endpoints (`GET /api/v1/health`, `GET /api/v1/ready`), request IDs, structured request logs, JSON error responses, an optional MongoDB connection, cookie-based authentication (`/api/v1/auth/register`, `login`, `logout`, `me`) and organizations for signed-in users (`POST /api/v1/organizations` creates one with the caller as owner; `GET /api/v1/organizations` lists the caller's organizations and roles; `PATCH /api/v1/organizations/:organizationId` renames one, for owners and admins), an audit log of important changes (`GET /api/v1/organizations/:organizationId/audit-logs`, for owners and admins; see [Settings and audit log](#settings-and-audit-log)), customers for organization members (`POST` and `GET /api/v1/organizations/:organizationId/customers` create a customer and list the newest 50; the organization comes from the route and is checked against the caller's membership) and orders (`POST` and `GET /api/v1/organizations/:organizationId/orders`; each order belongs to one of the same organization's customers, which the server checks) and tasks (`POST`, `GET` and `PATCH /api/v1/organizations/:organizationId/tasks`; a task can link to a customer and order of the same organization, and only its status, priority and due date can change), and a read-only AI Assistant (`POST /api/v1/organizations/:organizationId/ai/assistant`; see [AI Assistant](#ai-assistant)), plus a React client with sign-in and account creation, session restore on load and sign-out. After sign-in, a user without an organization is guided through creating one (the address is generated from the name); a user with an organization lands on the dashboard shell: a sidebar (an icon rail on medium screens, a drawer on small ones) with the workspace and the user's role, a header with the organization and the signed-in email, links to the Customers, Orders, Tasks and AI Assistant pages, and a pointer to the audit log for recent activity. The Customers page lists the organization's customers (name, email, phone, created date) and adds new ones through a form; customers cannot be edited or deleted yet. The Orders page lists orders (customer, description, status, amount in the order's currency, created date) and creates new ones for a chosen customer; orders cannot be edited or deleted yet. The Tasks page lists tasks (with their customer, order, priority, status and due date), creates new ones, and changes a task's status from its row; tasks cannot be edited otherwise or deleted yet. The AI Assistant page sends one message at a time and shows the answer with the kinds of records it read; when no AI model is configured, it says that no answer was generated. It does not keep a conversation history. The Settings page shows the workspace's name, address (read-only), the user's role and when it was created, and lets owners and admins rename the workspace; members see it read-only. The Audit Logs page lists recorded changes newest first, with older entries loaded on request; members are told it is for owners and admins. The Approvals page truthfully shows that nothing is waiting, because the AI cannot propose changes yet, and explains the planned approval flow. Every section in the sidebar now has a page. A user in several organizations sees the first one, as there is no organization switching yet. Authentication and organizations require the database. The rest of the product features below are not implemented.

## Planned Scope

- **Organizations:** each team works in its own organization. Access requires membership, and data is isolated between organizations on the server.
- **Customers and orders:** records of the customers a team serves and their orders.
- **Operational tasks:** work items that can optionally be linked to a customer or order.
- **AI-assisted suggestions:** summaries and suggested next steps based on an organization's own records.
- **Human approvals:** an AI suggestion that would change data is saved as a pending approval. It is applied only after a permitted team member approves it. Output that doesn't change data, such as a summary, is returned directly.
- **Audit logs:** a read-only record of data changes, approval decisions and AI tool use within an organization.

Record fields, statuses and most of what each role (`owner`, `admin`, `member`) may do are not decided yet. So far, any member may work with customers, orders, tasks and the AI Assistant, and only owners and admins may change workspace settings and read the audit log. They are tracked as [open questions](docs/ARCHITECTURE.md#9-open-questions).

## Stack

| Layer    | Technology                                                   | Status  |
| -------- | ------------------------------------------------------------ | ------- |
| Frontend | React 19, Vite 8, plain CSS                                  | In use  |
| Backend  | Node.js, Express 5 (REST API), helmet                        | In use  |
| Testing  | Vitest, Supertest, React Testing Library (jsdom)             | In use  |
| Database | MongoDB through Mongoose 9 (users, organizations, memberships) | In use |
| Auth     | Argon2id (`@node-rs/argon2`), JWT session cookie (`jose`), `express-rate-limit` | In use |
| AI       | Server-side provider interface: `development` (default, no model) or `openai` (official `openai` SDK, Responses API) | In use (OpenAI not yet verified with a real key) |

Other libraries, such as request validation and password hashing, are listed as candidates in the architecture document. They will be chosen in the phase that first needs them.

### AI Assistant

The AI Assistant answers questions about an organization's customers, orders and tasks. It can only read them: **it cannot create, change or delete anything.**

- **Endpoint:** `POST /api/v1/organizations/:organizationId/ai/assistant` with `{ "message": string }` (trimmed, 1–2000 characters). It needs a signed-in member of the organization, like the other organization routes, and the organization always comes from that membership, never from the body, query or headers. The message is not stored or logged.
- **Providers**, chosen with `AI_PROVIDER` (see [Configuration](#configuration)):
  - `development` (default): makes no network call and generates no text. Every reply has `status: "not_configured"`.
  - `openai`: calls the OpenAI Responses API through the official `openai` SDK, with the model from `OPENAI_MODEL` (default `gpt-5.4-mini`). Without `OPENAI_API_KEY` it also replies `not_configured`, so the app keeps working; it never falls back to made-up answers. Responses are requested with `store: false`.
- **Read-only tools:** the model can ask for `list_customers`, `list_orders` and `list_tasks` (newest first, 20 by default, at most 50). The server checks the tool name and arguments, runs the tool for the caller's organization only, and sends back a fixed set of fields per record. The model never gets database access and cannot choose the organization; an `organizationId` in its arguments is ignored.
- **Limits:** at most 4 model calls and 6 tool calls per message, tool results capped at 20,000 characters, replies at 8,000, a 20-second timeout per OpenAI request and 45 seconds overall. Provider failures return a fixed error message (`AI_PROVIDER_UNAVAILABLE` for rate limits and timeouts, `AI_PROVIDER_ERROR` otherwise); OpenAI's own error text is never sent to the browser or logged.
- **No changes through AI:** there are no tools that create, update or delete records. Such changes are planned to go through [human approval](docs/ARCHITECTURE.md#4-planned-api-route-groups) and the audit log, and every reply has `suggestedActions: []` and `requiresApproval: false`. The Approvals page exists as the place where those requests will appear, but there is no approvals API or model yet.

### Settings and audit log

- **Settings:** `PATCH /api/v1/organizations/:organizationId` with `{ "name": string }` (trimmed, 1–100 characters, the same rule as creating an organization) renames the organization and returns `{ organization: { id, name, slug, createdAt } }`. Only owners and admins may (members get 403, non-members 404). The organization comes from the caller's membership; the slug, owner, members, roles and IDs cannot be changed, and other fields in the body are ignored. Organizations cannot be deleted yet.
- **Audit log:** business actions record events explicitly through `recordAuditEvent` in `server/src/modules/audit/audit.service.js`; nothing is logged automatically per request. Each entry has the organization, the actor type (`user`, `ai` or `system`), the user for user actions (always from the session), a controlled action name, the resource type and ID, a few allowlisted details, and the time. Today the only recorded action is `organization.updated` (a rename, with the old and new name), written in the same transaction as the rename. AI messages and reads are not logged.
- **Reading it:** `GET /api/v1/organizations/:organizationId/audit-logs?page&limit` returns the organization's entries newest first (25 per page by default, at most 100, pages 1–1000), with the actor shown by email. Only owners and admins may read it. There is no endpoint for writing, editing or deleting entries.

Status: the OpenAI provider is covered by automated tests with a stand-in for the SDK client (tests never call the real API). It has not yet been checked against the real OpenAI API with a key. There is no rate limit on the endpoint yet.

## Architecture

The system design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). It covers component boundaries, planned API routes, authentication and organization isolation, configuration and error handling, testing, deployment, and a phased [roadmap](docs/ARCHITECTURE.md#8-implementation-roadmap).

Planned deployment:

| Component | Platform      |
| --------- | ------------- |
| Frontend  | Vercel        |
| Backend   | Render        |
| Database  | MongoDB Atlas |

The frontend is planned to reach the API through a Vercel `/api` rewrite to Render. This still needs to be verified during deployment, and the architecture document describes a fallback.

## Repository Layout

```text
.
├── client/               # React + Vite frontend
│   ├── src/
│   │   ├── api/          # API client and per-resource requests, including the AI Assistant (cookie session, no stored tokens)
│   │   ├── auth/         # auth state (React context)
│   │   ├── components/   # shared UI: brand, header, loading screen, text and password fields
│   │   ├── features/     # screens (auth, organizations: onboarding, dashboard: layout, sidebar and overview, customers, orders, tasks, assistant, approvals, audit, settings)
│   │   └── styles/       # design tokens and global CSS
│   └── .env.example
├── server/               # Express API
│   ├── src/
│   │   ├── config/       # environment validation
│   │   ├── lib/          # database connection, logger, error class, redaction
│   │   ├── middleware/   # request IDs, logging, same-origin check, 404 and errors
│   │   ├── testing/      # test helpers (logger and in-memory store stand-ins)
│   │   ├── modules/      # feature modules (health, auth, users, organizations, customers, orders, tasks, ai, audit)
│   │   ├── app.js        # builds the Express app (used by tests)
│   │   └── server.js     # validates config and starts listening
│   └── .env.example
├── docs/
│   └── ARCHITECTURE.md   # system design and roadmap
├── CLAUDE.md             # engineering rules for this project
└── package.json          # npm workspaces and root scripts
```

## Getting Started

Requires Node.js `^22.22.2` or `>=24.15.0` (see `engines` in `package.json`) and npm.

```bash
git clone https://github.com/sudhanshuthakur108-cpu/opspilot-ai.git
cd opspilot-ai
npm install
npm run dev
```

`npm run dev` starts the API on <http://localhost:3000> and the Vite dev server on <http://localhost:5173>. Open the Vite URL; it proxies `/api` requests to the API. Signing in needs the database (`MONGODB_URI` and `JWT_SECRET`, see [Configuration](#configuration)); without it the sign-in screen loads but sign-in requests fail.

Other scripts, run from the repository root:

| Command         | What it does                                                       |
| --------------- | ------------------------------------------------------------------ |
| `npm test`      | Runs the server tests, then the client tests                       |
| `npm run build` | Builds the client for production into `client/dist/`               |
| `npm start -w server` | Starts the API without file watching                         |

`npm test` needs no database. The database integration tests (`*.integration.test.js`) are skipped unless `MONGODB_TEST_URI` points at a MongoDB replica set, which transactions require. Each run creates a randomly named database and drops only that one. To run them against a temporary local replica set (this downloads a MongoDB server binary on first use):

```bash
npx @mongodb-js/mongodb-runner exec -t replset -- node -e "require('node:child_process').execSync('npm test -w server', { stdio: 'inherit', env: { ...process.env, MONGODB_TEST_URI: process.env.MONGODB_URI } })"
```

## Configuration

Both apps run with built-in defaults, so `.env` files are optional for local development. To change a value, copy the template for that app and edit the copy:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

| Variable            | App                 | Purpose                                                    |
| ------------------- | ------------------- | ---------------------------------------------------------- |
| `NODE_ENV`          | server              | `development`, `test` or `production` (default `development`) |
| `PORT`              | server              | Port the API listens on (default `3000`)                    |
| `MONGODB_URI`       | server              | MongoDB connection string (**secret**; required in production) |
| `JWT_SECRET`        | server              | Signs session tokens (**secret**; 32+ characters; required when `MONGODB_URI` is set) |
| `CLIENT_ORIGIN`     | server              | Origin allowed to make state-changing requests (default `http://localhost:5173`; required in production) |
| `VITE_API_BASE_URL` | client              | API base path or URL (default `/api/v1`); bundled into the browser code |
| `API_PROXY_TARGET`  | client (dev server) | Where Vite proxies `/api` (default `http://localhost:3000`); not bundled |
| `AI_PROVIDER`       | server              | `development` (default) or `openai`; any other value stops the server at startup |
| `OPENAI_API_KEY`    | server              | OpenAI API key (**secret**; only read when `AI_PROVIDER=openai`; without it the assistant replies that it is not configured) |
| `OPENAI_MODEL`      | server              | Model for the OpenAI provider (default `gpt-5.4-mini`) |

The server checks its configuration at startup and exits with a clear message if a value is invalid. If you change `PORT`, update `API_PROXY_TARGET` to match.

`MONGODB_URI` is optional in development and test; leave it empty to run without a database. It is required when `NODE_ENV=production`. When it is set, the server does not start until it connects, and `GET /api/v1/ready` returns 503 while the connection is down. The connection string is never logged.

Authentication is enabled together with the database, so setting `MONGODB_URI` also requires `JWT_SECRET`. State-changing requests must come from `CLIENT_ORIGIN`, so open the app at exactly that origin (`http://localhost:5173`, not `127.0.0.1`).

To use OpenAI locally, set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `server/.env`. The key stays on the server: it is never sent to the browser, included in responses or logged.

Rules:

- Never commit `.env` files. `.gitignore` excludes them.
- `VITE_*` variables are visible in the browser, so they must never hold secrets.
- Production secrets are set only in the Render dashboard. The Vercel project gets only `VITE_*` variables.

## Development Principles

[CLAUDE.md](CLAUDE.md) defines the engineering rules for this project: secure defaults, input validation, modular code, plain CSS, tests for meaningful behavior, no hardcoded secrets, and no claims about features that aren't implemented and verified.

## License

Not yet chosen.
