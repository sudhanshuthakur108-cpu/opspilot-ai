# OpsPilot AI

OpsPilot AI is a planned operations management SaaS for teams. Teams will be able to track customers, orders and operational tasks, get AI-assisted suggestions, and approve AI-proposed changes before they are applied. It is an independent personal portfolio project.

> **Status: early scaffold.** The repository contains a minimal runnable app: an Express API with liveness and readiness endpoints (`GET /api/v1/health`, `GET /api/v1/ready`), request IDs, structured request logs, JSON error responses, an optional MongoDB connection, cookie-based authentication (`/api/v1/auth/register`, `login`, `logout`, `me`) and organizations for signed-in users (`POST /api/v1/organizations` creates one with the caller as owner; `GET /api/v1/organizations` lists the caller's organizations and roles; `PATCH /api/v1/organizations/:organizationId` renames one, for owners and admins), an audit log of important changes (`GET /api/v1/organizations/:organizationId/audit-logs`, for owners and admins; see [Settings and audit log](#settings-and-audit-log)), customers for organization members (`POST` and `GET /api/v1/organizations/:organizationId/customers` create a customer and list the newest 50; the organization comes from the route and is checked against the caller's membership) and orders (`POST` and `GET /api/v1/organizations/:organizationId/orders`; each order belongs to one of the same organization's customers, which the server checks) and tasks (`POST`, `GET` and `PATCH /api/v1/organizations/:organizationId/tasks`; a task can link to a customer and order of the same organization, and only its status, priority and due date can change), an AI Assistant that reads records and can propose new tasks (`POST /api/v1/organizations/:organizationId/ai/assistant`; see [AI Assistant](#ai-assistant)), and human approval of those proposals (`GET /api/v1/organizations/:organizationId/approvals`, and `POST .../approvals/:approvalId/approve` or `/reject`; see [AI proposals and approvals](#ai-proposals-and-approvals)), plus a React client with sign-in and account creation, session restore on load and sign-out. After sign-in, a user without an organization is guided through creating one (the address is generated from the name); a user with an organization lands on the dashboard: a sidebar (an icon rail on medium screens, a drawer on small ones) with the workspace and the user's role, a header with the page, a light/dark theme switch and the signed-in account, and an overview built only from the workspace's own records (counts of customers, open orders, open tasks and proposals awaiting approval, the most urgent open tasks, the newest orders, a setup checklist while the workspace is empty and, for owners and admins, the latest audit log entries). Counts come from the list endpoints, which return at most the 50 newest records, so a full list is shown as "50+". The greeting uses the first word of the account name given at sign-up ("Sudhanshu Thakur" is greeted as "Welcome back, Sudhanshu"); accounts created before names were collected have none and are greeted without a name. The theme follows the system setting until a person chooses Light or Dark (in the header or Settings); the choice is kept in that browser only. The Customers page lists the organization's customers (name, email, phone, created date) and adds new ones through a form; customers cannot be edited or deleted yet. The Orders page lists orders (customer, description, status, amount in the order's currency, created date) and creates new ones for a chosen customer; orders cannot be edited or deleted yet. The Tasks page lists tasks (with their customer, order, priority, status and due date), creates new ones, and changes a task's status from its row; tasks cannot be edited otherwise or deleted yet. The AI Assistant page sends one message at a time and shows the answer with the kinds of records it read; when the assistant proposes a task, it shows "Approval required" with a link to the Approvals page (there is no approve button in the chat). When no AI model is configured, it says that no answer was generated. It does not keep a conversation history. The Settings page lets everyone change their own name (the email is shown read-only, and accounts without a name are asked to add one) and choose a theme, shows the workspace's name, address (read-only), the user's role and when it was created, and lets owners and admins rename the workspace; members see the workspace settings read-only. The Audit Logs page lists recorded changes newest first, with older entries loaded on request; members are told it is for owners and admins. The Approvals page lists the proposals waiting for a decision as review cards (what would be created, field by field, who asked and when) and recent decisions with their outcome; owners and admins approve or reject (with an optional reason) there, and members see the same lists without those controls. Every section in the sidebar now has a page. A user in several organizations sees the first one, as there is no organization switching yet. Authentication and organizations require the database. The rest of the product features below are not implemented.

## Planned Scope

- **Organizations:** each team works in its own organization. Access requires membership, and data is isolated between organizations on the server.
- **Customers and orders:** records of the customers a team serves and their orders.
- **Operational tasks:** work items that can optionally be linked to a customer or order.
- **AI-assisted suggestions:** summaries and suggested next steps based on an organization's own records.
- **Human approvals:** an AI suggestion that would change data is saved as a pending approval. It is applied only after a permitted team member approves it. Output that doesn't change data, such as a summary, is returned directly. (Implemented for one action, `create_task`; see [AI proposals and approvals](#ai-proposals-and-approvals).)
- **Audit logs:** a read-only record of data changes, approval decisions and AI tool use within an organization.

Record fields, statuses and most of what each role (`owner`, `admin`, `member`) may do are not decided yet. So far, any member may work with customers, orders, tasks and the AI Assistant and see approvals, and only owners and admins may change workspace settings, read the audit log, and approve or reject AI proposals. They are tracked as [open questions](docs/ARCHITECTURE.md#9-open-questions).

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

The AI Assistant answers questions about an organization's customers, orders and tasks. It reads them and can propose a new task, but **it cannot create, change or delete anything itself**: a proposal only waits for a person's approval (see [AI proposals and approvals](#ai-proposals-and-approvals)).

- **Endpoint:** `POST /api/v1/organizations/:organizationId/ai/assistant` with `{ "message": string }` (trimmed, 1–2000 characters). It needs a signed-in member of the organization, like the other organization routes, and the organization always comes from that membership, never from the body, query or headers. The message is not stored or logged.
- **Providers**, chosen with `AI_PROVIDER` (see [Configuration](#configuration)):
  - `development` (default): makes no network call and generates no text. Every reply has `status: "not_configured"`.
  - `openai`: calls the OpenAI Responses API through the official `openai` SDK, with the model from `OPENAI_MODEL` (default `gpt-5.4-mini`). Without `OPENAI_API_KEY` it also replies `not_configured`, so the app keeps working; it never falls back to made-up answers. Responses are requested with `store: false`.
- **Read-only tools:** the model can ask for `list_customers`, `list_orders` and `list_tasks` (newest first, 20 by default, at most 50). The server checks the tool name and arguments, runs the tool for the caller's organization only, and sends back a fixed set of fields per record. The model never gets database access and cannot choose the organization; an `organizationId` in its arguments is ignored.
- **Limits:** at most 4 model calls and 6 tool calls per message, tool results capped at 20,000 characters, replies at 8,000, a 20-second timeout per OpenAI request and 45 seconds overall. Provider failures return a fixed error message (`AI_PROVIDER_UNAVAILABLE` for rate limits and timeouts, `AI_PROVIDER_ERROR` otherwise); OpenAI's own error text is never sent to the browser or logged.
- **No changes through AI:** there are no tools that create, update or delete records. The one other tool, `propose_create_task`, only proposes: the server validates the proposal and, once the reply is complete, saves it as a pending approval (at most 3 per message). The reply then lists them in `suggestedActions` (`{ approvalId, action, status, summary, parameters }`) with `requiresApproval: true`; otherwise `suggestedActions` is `[]` and `requiresApproval` is `false`.

### Settings and audit log

- **Settings:** `PATCH /api/v1/organizations/:organizationId` with `{ "name": string }` (trimmed, 1–100 characters, the same rule as creating an organization) renames the organization and returns `{ organization: { id, name, slug, createdAt } }`. Only owners and admins may (members get 403, non-members 404). The organization comes from the caller's membership; the slug, owner, members, roles and IDs cannot be changed, and other fields in the body are ignored. Organizations cannot be deleted yet.
- **Audit log:** business actions record events explicitly through `recordAuditEvent` in `server/src/modules/audit/audit.service.js`; nothing is logged automatically per request. Each entry has the organization, the actor type (`user`, `ai` or `system`), the user for user actions (always from the session), a controlled action name, the resource type and ID, a few allowlisted details, and the time. Recorded actions: `organization.updated` (a rename, with the old and new name), written in the same transaction as the rename, and the approval lifecycle (`approval.proposed` by the AI, `approval.approved` and `approval.rejected` by a user, then `approval.executed` or `approval.execution_failed`), each written in the same transaction as the change it records. AI messages and reads are not logged.
- **Reading it:** `GET /api/v1/organizations/:organizationId/audit-logs?page&limit` returns the organization's entries newest first (25 per page by default, at most 100, pages 1–1000), with the actor shown by email. Only owners and admins may read it. There is no endpoint for writing, editing or deleting entries.

### AI proposals and approvals

This is the first workflow in which the AI can lead to a data change, and **the AI never makes the change itself.**

1. **Proposal.** When asked for a task, the model calls `propose_create_task` with structured fields. The server checks them with the task module's own validation (title, description, status, priority, due date, and that any customer and order belong to the caller's organization and to each other). Anything invalid is refused and reported back to the model; nothing is saved. A valid proposal is saved as a **pending** approval with an `approval.proposed` audit entry (actor `ai`). No task exists yet.
2. **Review.** `GET /api/v1/organizations/:organizationId/approvals?status&page&limit` lists the organization's approvals newest first (20 per page by default, at most 50) for any member. Only **owners and admins** may decide; members get 403.
3. **Decision.** `POST .../approvals/:approvalId/reject` with an optional `{ "reason" }` (at most 200 characters) marks it rejected, and no task is created. `POST .../approvals/:approvalId/approve` takes no body: the server first moves the approval from `pending` to `approved` with one conditional update, so a repeated or simultaneous approve gets 409 `APPROVAL_ALREADY_REVIEWED` and never creates a second task.
4. **Controlled execution.** The stored action runs through an allowlisted registry (`server/src/modules/approvals/approval.actions.js`), which validates the stored parameters again and creates the task through the existing task service, in one transaction with the `executed` status and its audit entry. If that fails, none of it is kept: the approval is marked `execution_failed` with a safe reason, and nothing is retried.

States: `pending → approved | rejected`, then `approved → executed | execution_failed`; no other change is possible. The organization, reviewer and actor always come from the signed-in membership, never from the request. **Supported action: `create_task` only.** Future actions will be added through the same allowlisted registry.

Status: the OpenAI provider is covered by automated tests with a stand-in for the SDK client (tests never call the real API). It has not yet been checked against the real OpenAI API with a key, including whether a real model uses `propose_create_task` as instructed. There is no rate limit on the endpoint yet.

## Architecture

The system design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). It covers component boundaries, planned API routes, authentication and organization isolation, configuration and error handling, testing, deployment, and a phased [roadmap](docs/ARCHITECTURE.md#8-implementation-roadmap).

Deployment targets:

| Component | Platform      |
| --------- | ------------- |
| Frontend  | Vercel        |
| Backend   | Render        |
| Database  | MongoDB Atlas |

The frontend reaches the API through a Vercel `/api` rewrite to Render, configured in [`client/vercel.json`](client/vercel.json). Nothing has been deployed yet, so the rewrite, cookies and proxy settings are unverified; see [Deployment](#deployment).

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
│   ├── vercel.json       # production routing (API rewrite, SPA fallback) and security headers
│   └── .env.example
├── server/               # Express API
│   ├── src/
│   │   ├── config/       # environment validation
│   │   ├── lib/          # database connection, logger, error class, redaction
│   │   ├── middleware/   # request IDs, logging, same-origin check, 404 and errors
│   │   ├── testing/      # test helpers (logger and in-memory store stand-ins)
│   │   ├── modules/      # feature modules (health, auth, users, organizations, customers, orders, tasks, ai, approvals, audit)
│   │   ├── app.js        # builds the Express app (used by tests)
│   │   └── server.js     # validates config and starts listening
│   └── .env.example
├── docs/
│   └── ARCHITECTURE.md   # system design and roadmap
├── CLAUDE.md             # engineering rules for this project
├── .node-version         # Node.js version for Render and local version managers
└── package.json          # npm workspaces and root scripts
```

## Getting Started

Requires Node.js `^22.22.2` or `>=24.15.0` (see `engines` in `package.json`) and npm. [`.node-version`](.node-version) pins `24.18.0`, the version the tests are run with and the one Render uses.

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
| `TRUST_PROXY`       | server              | Number of proxies in front of the API, `0`–`5` (default `0`; required in production, measured after deploying, see [Deployment](#deployment)) |
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

## Deployment

> **Not deployed yet.** The settings below match the repository's layout and were checked locally (the Render build and start commands were run against the real lockfile), but the Vercel rewrite, the session cookie through it and the `TRUST_PROXY` value can only be verified on a real deployment. Launch is blocked until the [pre-launch checklist](#pre-launch-checklist) passes.

### Frontend (Vercel)

| Setting | Value |
| --- | --- |
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command / Output Directory | defaults: `npm run build`, `dist` |
| Node.js Version | 24.x (Project Settings) |
| Environment variables | none. Leave `VITE_API_BASE_URL` unset so it stays `/api/v1` |

The lockfile is at the repository root (npm workspaces). Check the first build log to confirm that Vercel installs from it.

[`client/vercel.json`](client/vercel.json) sends `/api/*` to the Render service `opspilot-ai-52dj.onrender.com`. If the service is ever recreated with another hostname, update the file: `vercel.json` cannot read environment variables, and the hostname is not a secret.

How requests are routed:

1. Files in the build (`index.html`, `/assets/*`, `/favicon.svg`) are served as they are.
2. `/api/*` is proxied to the same path on Render, with the query string. The browser only ever talks to the Vercel origin, so the session cookie is first-party: it is set on the Vercel host (no `Domain`), `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
3. Every other path returns `index.html`, so reloading `/settings`, `/customers` or any other page opens the app on that page. This rule comes after the API rule, so API paths never fall through to it.

All responses also get `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a Content Security Policy limited to `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. A stricter policy that also covers scripts needs the inline theme script's hash; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#content-security-policy).

The client only works through this rewrite: it sends cookies to its own origin only, and the API has no CORS. Pointing `VITE_API_BASE_URL` at the Render URL breaks sign-in.

### Backend (Render)

| Setting | Value |
| --- | --- |
| Service type | Web Service, Node runtime |
| Root Directory | empty (the repository root, where the only lockfile is) |
| Build Command | `npm ci --workspace server --omit=dev` |
| Start Command | `npm start --workspace server` |
| Node version | from [`.node-version`](.node-version) (`24.18.0`); confirm it in the build log |
| Health Check Path | `/api/v1/health` |

The build command installs only the server's runtime dependencies from the root `package-lock.json` and creates no other lockfile. The start command runs `node --env-file-if-exists=.env src/server.js`; no `.env` exists on Render, so the dashboard variables are used.

### Environment variables by platform

| Variable | Where | Required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Render | **Yes** | `production`. Without it, the production checks below are skipped and the cookie is not `Secure` |
| `MONGODB_URI` | Render | **Yes** | Secret. Production database, least-privilege user |
| `JWT_SECRET` | Render | **Yes** | Secret, 32+ characters, generated for production only |
| `CLIENT_ORIGIN` | Render | **Yes** | Exact origin of the Vercel site, see below |
| `TRUST_PROXY` | Render | **Yes** | Measured value, see below |
| `AI_PROVIDER` | Render | No | Keep `development` (the default) until the assistant has a rate limit |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Render | Only with `AI_PROVIDER=openai` | Secret key; never in Vercel |
| `PORT` | Render | Set by Render | Do not set it yourself |
| `VITE_API_BASE_URL` | Vercel | No | Leave unset |

**`CLIENT_ORIGIN`** must be the exact origin the browser shows for the production site: `https://`, the hostname, and no path or trailing slash (for example `https://<project>.vercel.app`, or the custom domain if you use one). Sign-in and every change are refused (403 `ORIGIN_NOT_ALLOWED`) from any other origin, including Vercel preview URLs.

**`TRUST_PROXY`** tells Express how many proxies sit in front of it, so it can read the real client IP for the sign-in rate limit. Production refuses to start without it. Do not guess the value:

- **Too low:** every user shares one rate limit, so about 10 sign-in attempts in 15 minutes from anyone lock everyone out.
- **Too high:** Express reads an `X-Forwarded-For` entry the client wrote, so a client can choose its own IP and avoid the limit.

To measure it, deploy with `TRUST_PROXY=0` (nothing trusted), then try `1`, `2` and so on. With each value, send a failed sign-in through the Vercel site and read the `RateLimit` response header, where `r` is the number of attempts left:

```bash
curl -si -X POST https://<vercel-host>/api/v1/auth/login \
  -H "Origin: https://<vercel-host>" -H "Content-Type: application/json" -d "{}" | grep -i "^ratelimit"
```

1. Run it from two different networks, for example home Wi-Fi and a phone's mobile data. If the second network continues the first one's count, the value is too low. Use the smallest value at which the two counts are independent.
2. With that value, run it again from the first network with `-H "X-Forwarded-For: 198.51.100.1"` added. If that starts a fresh count, the value is too high.

Each attempt uses up one of the 10 allowed per 15 minutes; restarting the service resets the counts.

**Direct access to Render:** the `*.onrender.com` URL stays publicly reachable and skips Vercel, so its proxy chain is shorter. A value measured for the Vercel chain lets a client calling Render directly choose its own IP and avoid the sign-in limit there. Sessions are not exposed this way: the cookie belongs to the Vercel host and is never sent to Render, and the origin check still applies. Closing this gap is an open decision (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#9-open-questions)).

### Pre-launch checklist

**Launch is blocked until every item passes in a browser against the deployed site.** No item has been checked yet.

- [ ] `client/vercel.json` names the real Render hostname, and `npm test -w client` still passes.
- [ ] Render has `NODE_ENV=production`, the exact `CLIENT_ORIGIN`, a fresh `JWT_SECRET`, the production `MONGODB_URI`, and `AI_PROVIDER` left at `development` unless the assistant has a rate limit.
- [ ] The Render build log shows Node `24.18.0` and the `npm ci` install. The `server started` log line shows `"nodeEnv":"production"` and the measured `trustProxy`.
- [ ] `https://<vercel-host>/api/v1/health` and `/api/v1/ready` return 200 through the rewrite.
- [ ] `TRUST_PROXY` passes both measurement checks above.
- [ ] Create an account, sign out and sign in. In the browser's developer tools, `opspilot_session` is on the Vercel host with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` and no `Domain`, and a reload keeps you signed in.
- [ ] Creating an organization and a customer works. A 403 `ORIGIN_NOT_ALLOWED` means the rewrite did not forward the `Origin` header or `CLIENT_ORIGIN` does not match.
- [ ] Reloading directly on `/settings`, `/customers`, `/orders`, `/tasks`, `/approvals` and `/audit-logs` opens the app on that page, not a Vercel 404.
- [ ] The page's response headers include the security headers above, and the saved theme applies on load and still switches.
- [ ] An AI Assistant message and the first request after Render has been idle both complete through the rewrite, without a proxy timeout.

## Development Principles

[CLAUDE.md](CLAUDE.md) defines the engineering rules for this project: secure defaults, input validation, modular code, plain CSS, tests for meaningful behavior, no hardcoded secrets, and no claims about features that aren't implemented and verified.

## License

Not yet chosen.
