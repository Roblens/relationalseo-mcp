# RelationalSEO MCP Server

[![npm version](https://img.shields.io/npm/v/relationalseo-mcp-server.svg)](https://www.npmjs.com/package/relationalseo-mcp-server)
[![license](https://img.shields.io/npm/l/relationalseo-mcp-server.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/relationalseo-mcp-server.svg)](https://nodejs.org)

An [MCP](https://modelcontextprotocol.io) server that exposes the
**RelationalSEO (SEER)** diagnostic API as tools any MCP client (Claude Desktop,
Claude Code, Cursor, etc.) can call.

RelationalSEO analyzes search visibility at the *entity* and *classifier* level.
This server wraps all eleven public API endpoints - EntityOS, DiagnosticOS,
DriftOS, PageOS, BacklinkOS, CredentialOS, GBPOS, VisionOS, ChatGPT-OS, the
stored-report lookup, and the combined batch runner - behind clean, well-typed
tools.

## Tools

| Tool | OS module | Endpoint | What it does |
|------|-----------|----------|--------------|
| `relationalseo_analyze_entity` | EntityOS | `POST /analyze` | Entity gap analysis for a query (+ optional omission intelligence) |
| `relationalseo_diagnose_visibility` | DiagnosticOS | `POST /diagnostic` | Which Google classifier is suppressing visibility (traffic-drop diagnosis) |
| `relationalseo_analyze_drift` | DriftOS | `POST /drift` | Entity perception drift across 12 factors |
| `relationalseo_analyze_page` | PageOS | `POST /page` | On-page content integrity / AI-origin / authenticity |
| `relationalseo_evaluate_backlink` | BacklinkOS | `POST /backlink` | Quality & relevance of a backlink relationship |
| `relationalseo_audit_credentials` | CredentialOS | `POST /credential` | Credential & authority audit across 8 dimensions |
| `relationalseo_diagnose_gbp` | GBPOS | `POST /gbp` | Google Business Profile diagnostic across 7 signal layers |
| `relationalseo_get_entity_report` | - | `POST /entity-report` | Retrieve a stored EntityOS report (lookup, not a new scan) |
| `relationalseo_analyze_image` | VisionOS | `POST /vision` | AI/stock image authenticity detection (local file upload) |
| `relationalseo_evaluate_llm_visibility` | ChatGPT-OS | `POST /chatgpt` | LLM recommendation reasoning (Beta, gated: add-on + BYOK) |
| `relationalseo_run_combined` | - | `POST /combined` | Run up to 7 tools in parallel in one request |

Every tool accepts a `response_format` argument - `markdown` (default; a readable
summary plus the analysis tree) or `json` (the full raw API response). The
complete API response is also returned as `structuredContent`.

## Prerequisites

- **Node.js >= 18** (uses the native `fetch`/`FormData`).
- A **RelationalSEO API token** with an active subscription. Find it on the API
  page of your RelationalSEO dashboard.

## Install

On npm as [`relationalseo-mcp-server`](https://www.npmjs.com/package/relationalseo-mcp-server) - no clone, no build. It runs on demand via `npx`.

Fastest path (Claude Code):

```bash
claude mcp add relationalseo -s user \
  --env RELATIONALSEO_API_KEY=YOUR_TOKEN \
  -- npx -y relationalseo-mcp-server
```

(Windows, if `npx` is not found: end with `-- cmd /c npx -y relationalseo-mcp-server`.)

For other clients, use the config in [Configuration](#configuration). To hack on
the server itself, see [From source](#from-source).

## Configuration

The server reads its configuration from environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RELATIONALSEO_API_KEY` | **yes** | - | Your RelationalSEO Bearer token |
| `RELATIONALSEO_BASE_URL` | no | `https://login.relationalseo.com/api/v1` | Override the API base URL |
| `RELATIONALSEO_TIMEOUT_MS` | no | `120000` | Per-request timeout in ms |

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "relationalseo": {
      "command": "npx",
      "args": ["-y", "relationalseo-mcp-server"],
      "env": {
        "RELATIONALSEO_API_KEY": "your_token_here"
      }
    }
  }
}
```

On Windows, if `npx` is not found, use `"command": "cmd"` with
`"args": ["/c", "npx", "-y", "relationalseo-mcp-server"]`.

### Claude Code

```bash
claude mcp add relationalseo -s user \
  --env RELATIONALSEO_API_KEY=your_token_here \
  -- npx -y relationalseo-mcp-server
```

(Windows: end with `-- cmd /c npx -y relationalseo-mcp-server`.)

## From source

To modify or contribute:

```bash
git clone https://github.com/Roblens/relationalseo-mcp.git
cd relationalseo-mcp
npm install
npm run build
```

This produces `dist/index.js`. Copy `.env.example` to `.env`, add your token, then
run with the MCP Inspector (`npm run inspector`) or `npm run dev` for auto-reload.

## Releasing

Publishing is automated via GitHub Actions. Bump the version and push a matching
tag:

```bash
npm version patch        # or minor / major - updates package.json and tags
git push --follow-tags
```

The `Publish to npm` workflow checks the tag matches `package.json`, then
publishes with provenance. It needs a repo secret `NPM_TOKEN` (an npm token with
write access). The server reports this version at runtime, so there is nothing
else to bump.

## Rate limits & errors

The API enforces a shared, rolling 60-minute limit across **all** endpoints -
40 requests/hour for founding members (accounts registered on or before
2026-03-18), 20/hour otherwise. On `429` the server reports the
`retry_after_seconds` value. Other documented errors (`401 unauthorized`,
`400 invalid_input`, `403` add-on/BYOK gates for ChatGPT-OS, `500
analysis_failed`) are surfaced as clear, actionable tool errors.

Analyses are LLM-backed and can take tens of seconds; the combined endpoint runs
longer because it fans out server-side.

## Security

- The API token is read **only** from the environment - it is never written to
  disk or committed. Keep it secret; the RelationalSEO docs warn against
  exposing it in frontend code or public repositories.
- `.env` and any local API-doc artifacts are git-ignored.
- If your subscription is canceled, the token stops working.

## License

[MIT](./LICENSE) © Roblens Media
