#!/usr/bin/env node
/**
 * RelationalSEO MCP server.
 *
 * Exposes the RelationalSEO (SEER) diagnostic API as MCP tools over stdio.
 * Requires the RELATIONALSEO_API_KEY environment variable.
 *
 * Note: per the MCP stdio contract, all logging goes to stderr - stdout is
 * reserved for the JSON-RPC protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./constants.js";
import { RelationalSeoClient } from "./services/client.js";
import { registerTools } from "./tools/register.js";

const SERVER_NAME = "relationalseo-mcp-server";
const SERVER_VERSION = "0.1.1";

function parseTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(
      `WARNING: RELATIONALSEO_TIMEOUT_MS='${raw}' is not a positive number; using default ${DEFAULT_TIMEOUT_MS} ms.`,
    );
    return DEFAULT_TIMEOUT_MS;
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = process.env.RELATIONALSEO_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error(
      "ERROR: RELATIONALSEO_API_KEY environment variable is required.\n" +
        "Set it to your RelationalSEO API token (see .env.example).",
    );
    process.exit(1);
  }

  const client = new RelationalSeoClient({
    apiKey: apiKey.trim(),
    baseUrl: process.env.RELATIONALSEO_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: parseTimeout(process.env.RELATIONALSEO_TIMEOUT_MS),
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio.`);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting RelationalSEO MCP server:", error);
  process.exit(1);
});
