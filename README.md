# OpsPilot AI

OpsPilot AI is a planned operations management SaaS for teams. Teams will be able to track customers, orders and operational tasks, get AI-assisted suggestions, and approve AI-proposed changes before they are applied. It is an independent personal portfolio project.

> **Status: pre-development.** The repository contains only the project foundation (configuration and engineering rules) and the architecture documentation. There is no application code yet, and none of the features below are implemented.

## Planned Scope

- **Organizations:** each team works in its own organization. Access requires membership, and data is isolated between organizations on the server.
- **Customers and orders:** records of the customers a team serves and their orders.
- **Operational tasks:** work items that can optionally be linked to a customer or order.
- **AI-assisted suggestions:** summaries and suggested next steps based on an organization's own records.
- **Human approvals:** an AI suggestion that would change data is saved as a pending approval. It is applied only after a permitted team member approves it. Output that doesn't change data, such as a summary, is returned directly.
- **Audit logs:** a read-only record of data changes, approval decisions and AI tool use within an organization.

Record fields, statuses, roles and permissions are not decided yet. They are tracked as [open questions](docs/ARCHITECTURE.md#9-open-questions).

## Planned Stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | React, Vite, plain CSS                                        |
| Backend  | Node.js, Express (REST API)                                   |
| Database | MongoDB Atlas, accessed through Mongoose                      |
| AI       | Server-side provider interface: `mock` (default) or `openai`  |

Other libraries (validation, testing, security middleware) are listed as candidates in the architecture document. They will be chosen when the code is scaffolded.

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

Current contents:

```text
.
├── docs/
│   └── ARCHITECTURE.md   # system design and roadmap
├── .env.example          # environment variable names (placeholders only)
├── .gitignore
├── CLAUDE.md             # engineering rules for this project
└── README.md
```

The `client/` (React + Vite) and `server/` (Express) folders will be added in the first implementation phases.

## Getting Started

```bash
git clone https://github.com/sudhanshuthakur108-cpu/opspilot-ai.git
cd opspilot-ai
```

There is nothing to install or run yet. The required Node.js version and the commands for installing, running and testing the apps will be documented here once they exist.

## Configuration

[`.env.example`](.env.example) lists the environment variables the apps are expected to use. It contains no real values:

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `NODE_ENV`          | Runtime environment                                            |
| `PORT`              | Port the API listens on (set automatically on Render)          |
| `CLIENT_ORIGIN`     | Allowed frontend origin, used for request origin checks        |
| `MONGODB_URI`       | MongoDB connection string (**secret**)                         |
| `AI_PROVIDER`       | `mock` (default) or `openai`                                   |
| `OPENAI_API_KEY`    | OpenAI API key, needed only when `AI_PROVIDER=openai` (**secret**) |
| `OPENAI_MODEL`      | OpenAI model name, needed only when `AI_PROVIDER=openai`       |
| `VITE_API_BASE_URL` | API base URL for the frontend (public, bundled into the client) |

Planned changes:

- When the apps are scaffolded, this file will be split into `server/.env.example` and `client/.env.example`. Each will be copied to a local, Git-ignored `.env`.
- `JWT_SECRET` will be added when authentication is built.

Rules:

- Never commit `.env` files. `.gitignore` excludes them.
- `VITE_*` variables are visible in the browser, so they must never hold secrets.
- Production secrets are set only in the Render dashboard. The Vercel project gets only `VITE_*` variables.

## Development Principles

[CLAUDE.md](CLAUDE.md) defines the engineering rules for this project: secure defaults, input validation, modular code, plain CSS, tests for meaningful behavior, no hardcoded secrets, and no claims about features that aren't implemented and verified.

## License

Not yet chosen.
