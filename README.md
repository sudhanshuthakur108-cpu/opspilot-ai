# OpsPilot AI

OpsPilot AI is a personal portfolio project: a full-stack web application for tracking operational work items, such as incidents, requests and tasks, with AI-assisted summaries and suggested next steps.

> **Status: early development.** This repository currently contains only project configuration and documentation. No application code exists yet. Features described below are planned, not implemented.

## Purpose

Small teams often track operational issues in scattered notes, chats and spreadsheets. OpsPilot AI aims to provide:

- A single place to create, update and review operational items
- AI-generated summaries of long item histories
- AI-suggested next actions, always shown as suggestions for a person to review
- A clear demo of production-minded MERN engineering: validation, testing, secure configuration and cloud deployment

## Planned Tech Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | React (built with Vite), plain CSS           |
| Backend   | Node.js, Express                             |
| Database  | MongoDB (via Mongoose)                       |
| AI        | Pluggable provider: mock or OpenAI           |
| Testing   | To be selected when the first code is added  |

## AI Integration Modes

The backend will route all AI calls through a single provider interface, selected by the `AI_PROVIDER` environment variable:

- **`mock`** (default): will return deterministic, canned responses. It will need no API key and cost nothing, and is intended for local development, automated tests and public demos.
- **`openai`**: will call the OpenAI API using `OPENAI_API_KEY` and `OPENAI_MODEL`. The key will be read only on the server and never sent to the browser.

If `openai` is selected but no key is set, the server should fail fast with a clear configuration error rather than silently falling back.

## Planned Deployment

| Component | Platform      |
| --------- | ------------- |
| Frontend  | Vercel        |
| Backend   | Render        |
| Database  | MongoDB Atlas |

Each platform's secrets will be configured in its own dashboard. No secrets are stored in this repository.

## Configuration

Configuration is supplied through environment variables. A template with placeholder names is in [`.env.example`](.env.example):

```bash
cp .env.example .env
```

Then fill in values locally. `.env` files are ignored by Git and must never be committed.

## Project Structure

To be added once the frontend and backend are scaffolded.

## License

Not yet chosen.
