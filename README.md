# RelationalSEO MCP Server

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

## Install & build

```bash
git clone https://github.com/Roblens/relationalseo-mcp.git
cd relationalseo-mcp
npm install
npm run build
```

This produces `dist/index.js`, the server entry point.

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
      "command": "node",
      "args": ["/absolute/path/to/relationalseo-mcp/dist/index.js"],
      "env": {
        "RELATIONALSEO_API_KEY": "your_token_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add relationalseo \
  --env RELATIONALSEO_API_KEY=your_token_here \
  -- node /absolute/path/to/relationalseo-mcp/dist/index.js
```

### Local development

Copy `.env.example` to `.env`, fill in your token, and run with the MCP
Inspector:

```bash
npm run inspector
```

(Or `RELATIONALSEO_API_KEY=... npm run dev` for auto-reload during development.)

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
