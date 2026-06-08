#!/usr/bin/env node
/**
 * Smoke test: connects to the built server over stdio, lists tools, and
 * optionally invokes one tool.
 *
 * Usage:
 *   node scripts/smoke.mjs                      # list tools (uses a dummy key)
 *   RELATIONALSEO_API_KEY=... node scripts/smoke.mjs <tool_name> '<json-args>'
 *
 * Example:
 *   RELATIONALSEO_API_KEY=xxx node scripts/smoke.mjs \
 *     relationalseo_diagnose_visibility '{"businessName":"Steamy Concepts","location":"Tucson, AZ"}'
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , toolName, argsJson] = process.argv;
const apiKey = process.env.RELATIONALSEO_API_KEY ?? "dummy-key-for-listing-only";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, RELATIONALSEO_API_KEY: apiKey },
  stderr: "inherit",
});

const client = new Client({ name: "relationalseo-smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`\n✅ Connected. ${tools.length} tools registered:\n`);
for (const t of tools) {
  const required = t.inputSchema?.required ?? [];
  const props = Object.keys(t.inputSchema?.properties ?? {});
  console.log(`  • ${t.name}`);
  console.log(`      props: [${props.join(", ")}]  required: [${required.join(", ")}]`);
}

if (toolName) {
  const args = argsJson ? JSON.parse(argsJson) : {};
  console.log(`\n▶️  Calling ${toolName} with ${JSON.stringify(args)} ...\n`);
  const result = await client.callTool({ name: toolName, arguments: args });
  console.log("isError:", result.isError ?? false);
  for (const part of result.content ?? []) {
    if (part.type === "text") console.log(part.text.slice(0, 4000));
  }
}

await client.close();
process.exit(0);
