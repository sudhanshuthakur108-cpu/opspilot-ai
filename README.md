# OpsPilot AI

OpsPilot AI is a planned operations management SaaS for teams. Teams will be able to track customers, orders and operational tasks, get AI-assisted suggestions, and approve AI-proposed changes before they are applied. It is an independent personal portfolio project.

> **Status: early scaffold.** The repository contains a minimal runnable app: an Express API with liveness and readiness endpoints (`GET /api/v1/health`, `GET /api/v1/ready`), request IDs, structured request logs, JSON error responses, an optional MongoDB connection, and cookie-based authentication (`/api/v1/auth/register`, `login`, `logout`, `me`; requires the database), plus a React page that shows the API's status. The client has no sign-in screens yet, and none of the product features below are implemented.

## Planned Scope

- **Organizations:** each team works in its own organization. Access requires membership, and data is isolated between organizations on the server.
- **Customers and orders:** records of the customers a team serves and their orders.
- **Operational tasks:** work items that can optionally be linked to a customer or order.
- **AI-assisted suggestions:** summaries and suggested next steps based on an organization's own records.
- **Human approvals:** an AI suggestion that would change data is saved as a pending approval. It is applied only after a permitted team member approves it. Output that doesn't change data, such as a summary, is returned directly.
- **Audit logs:** a read-only record of data changes, approval decisions and AI tool use within an organization.

Record fields, statuses and what each role (`owner`, `admin`, `member`) may do are not decided yet. They are tracked as [open questions](docs/ARCHITECTURE.md#9-open-questions).

## Stack

| Layer    | Technology                                                   | Status  |
| -------- | ------------------------------------------------------------ | ------- |
| Frontend | React 19, Vite 8, plain CSS                                  | In use  |
| Backend  | Node.js, Express 5 (REST API), helmet                        | In use  |
| Testing  | Vitest, Supertest, React Testing Library (jsdom)             | In use  |
| Database | MongoDB through Mongoose 9 (users, organizations, memberships) | In use |
| Auth     | Argon2id (`@node-rs/argon2`), JWT session cookie (`jose`), `express-rate-limit` | In use |
| AI       | Server-side provider interface: `mock` (default) or `openai` | Planned |

Other libraries, such as request validation and password hashing, are listed as candidates in the architecture document. They will be chosen in the phase that first needs them.

### AI Providers

All AI calls will go through one provider interface on the server, selected by `AI_PROVIDER`:

- **`mock`** (default): will return deterministic responses with no API key and no cost. It is intended for development, automated tests and demos.
- **`openai`** (optional): will call the OpenAI API using `OPENAI_API_KEY` and `OPENAI_MODEL`. The key will stay on the server and never be sent to the browser.

If `openai` is selected without its required settings, the server is planned to refuse to start rather than fall back to `mock`.

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
│   │   ├── api/          # API request functions
│   │   ├── features/     # feature folders (currently: health)
│   │   └── styles/       # global CSS
│   └── .env.example
├── server/               # Express API
│   ├── src/
│   │   ├── config/       # environment validation
│   │   ├── lib/          # database connection, logger, error class, redaction
│   │   ├── middleware/   # request IDs, logging, same-origin check, 404 and errors
│   │   ├── testing/      # test helpers (logger and user-store stand-ins)
│   │   ├── modules/      # feature modules (health, auth, users, organizations)
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

`npm run dev` starts the API on <http://localhost:3000> and the Vite dev server on <http://localhost:5173>. Open the Vite URL; it proxies `/api` requests to the API.

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

The server checks its configuration at startup and exits with a clear message if a value is invalid. If you change `PORT`, update `API_PROXY_TARGET` to match.

`MONGODB_URI` is optional in development and test; leave it empty to run without a database. It is required when `NODE_ENV=production`. When it is set, the server does not start until it connects, and `GET /api/v1/ready` returns 503 while the connection is down. The connection string is never logged.

Authentication is enabled together with the database, so setting `MONGODB_URI` also requires `JWT_SECRET`. State-changing requests must come from `CLIENT_ORIGIN`, so open the app at exactly that origin (`http://localhost:5173`, not `127.0.0.1`).

Variables for later phases, including `AI_PROVIDER`, `OPENAI_API_KEY` and `OPENAI_MODEL`, will be added to `server/.env.example` when they are first used.

Rules:

- Never commit `.env` files. `.gitignore` excludes them.
- `VITE_*` variables are visible in the browser, so they must never hold secrets.
- Production secrets are set only in the Render dashboard. The Vercel project gets only `VITE_*` variables.

## Development Principles

[CLAUDE.md](CLAUDE.md) defines the engineering rules for this project: secure defaults, input validation, modular code, plain CSS, tests for meaningful behavior, no hardcoded secrets, and no claims about features that aren't implemented and verified.

## License

Not yet chosen.
