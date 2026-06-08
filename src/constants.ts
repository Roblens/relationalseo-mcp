/**
 * Shared constants for the RelationalSEO MCP server.
 */

/** Default production API base URL (overridable via RELATIONALSEO_BASE_URL). */
export const DEFAULT_BASE_URL = "https://login.relationalseo.com/api/v1";

/** Default per-request timeout (ms). Analyses are LLM-backed and can be slow. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Timeout for the /combined endpoint, which fans out to several tools in
 * parallel server-side and therefore takes longer than a single analysis.
 */
export const COMBINED_TIMEOUT_MS = 240_000;

/**
 * Maximum size (in characters) of a formatted tool response. The `analysis`
 * field is a plain-text file tree that can be very large; beyond this limit we
 * truncate and append a clear notice rather than overflow the client context.
 */
export const CHARACTER_LIMIT = 100_000;

/** Maximum number of tools allowed in a single /combined request. */
export const MAX_COMBINED_TOOLS = 7;

/** Tool identifiers accepted by the /combined endpoint. */
export const COMBINED_TOOL_NAMES = [
  "entity",
  "diagnostic",
  "drift",
  "page",
  "backlink",
  "credential",
  "gbp",
  "rewrite",
  "chatgpt",
] as const;

/** VisionOS upload limits. */
export const VISION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const VISION_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
