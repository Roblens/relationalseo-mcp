/**
 * Zod input schemas for every RelationalSEO tool.
 *
 * Each export is a Zod *raw shape* (a plain object whose values are Zod types),
 * which is what the MCP SDK's `registerTool` expects as `inputSchema`. Field
 * names match the API request body exactly (camelCase), so a validated input
 * can be forwarded to the API as-is after stripping `response_format`.
 */

import { z } from "zod";
import { COMBINED_TOOL_NAMES, MAX_COMBINED_TOOLS } from "../constants.js";

/** Output format shared by every tool. */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' (default) for a readable summary plus the analysis tree, or 'json' for the full raw API response.",
  );

// --- Reusable field builders (descriptions vary per tool, so kept explicit) ---

const optionalLocation = (desc: string) => z.string().min(1).max(200).optional().describe(desc);

// Accepts a full URL (https://example.com/...) OR a bare domain (example.com),
// matching the API's lenient min-length rule rather than strict RFC URL syntax.
const URL_OR_DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const urlLike = (desc: string, min: number) =>
  z
    .string()
    .trim()
    .min(min, `must be at least ${min} characters`)
    .refine((v) => URL_OR_DOMAIN.test(v), {
      message: "must be a URL or bare domain (e.g. https://example.com or example.com)",
    })
    .describe(desc);

// --- EntityOS: POST /analyze ---
export const analyzeInputShape = {
  query: z
    .string()
    .min(5, "query must be at least 5 characters")
    .max(200, "query must not exceed 200 characters")
    .describe("The search query to analyze, e.g. 'Best plumber in Austin TX'."),
  businessName: z
    .string()
    .min(2, "businessName must be at least 2 characters")
    .max(200, "businessName must not exceed 200 characters")
    .optional()
    .describe(
      "Optional (2-200 chars). When provided, triggers omission analysis explaining why this business is absent from results.",
    ),
  serpMode: z
    .boolean()
    .optional()
    .describe("When true, anchors the analysis to live SERP results. Defaults to false."),
  location: optionalLocation(
    "Optional location context for omission analysis, to narrow to the correct entity.",
  ),
  websiteUrl: urlLike(
    "Optional business website URL or domain. Helps prevent entity conflation when names collide.",
    4,
  ).optional(),
  response_format: responseFormat,
} as const;

// --- DiagnosticOS: POST /diagnostic ---
export const diagnosticInputShape = {
  businessName: z
    .string()
    .min(2, "businessName must be at least 2 characters")
    .max(200, "businessName must not exceed 200 characters")
    .describe("The business or entity name to diagnose."),
  location: optionalLocation("Optional city/state to narrow the analysis to the correct entity."),
  response_format: responseFormat,
} as const;

// --- DriftOS: POST /drift ---
export const driftInputShape = {
  entityName: z
    .string()
    .min(2, "entityName must be at least 2 characters")
    .max(200, "entityName must not exceed 200 characters")
    .describe("The entity or business name to analyze for perception drift."),
  location: optionalLocation("Optional business location to narrow to the correct entity."),
  services: z
    .string()
    .min(1)
    .optional()
    .describe("Optional services the business claims to offer (compared against what Google perceives)."),
  response_format: responseFormat,
} as const;

// --- PageOS: POST /page ---
export const pageInputShape = {
  url: urlLike("The page URL (or domain) to analyze.", 10),
  entityName: z
    .string()
    .min(2)
    .max(200)
    .optional()
    .describe("Optional business name behind the URL (improves entity grounding accuracy)."),
  location: optionalLocation("Optional business location (helps narrow to the correct entity)."),
  includeScrape: z
    .boolean()
    .optional()
    .describe(
      "When true (default), scrapes live page content for accurate on-page analysis. When false, uses only Google's cached data.",
    ),
  response_format: responseFormat,
} as const;

// --- BacklinkOS: POST /backlink ---
export const backlinkInputShape = {
  sourceUrl: urlLike("The URL where the backlink originates (the linking page).", 10),
  targetUrl: urlLike("The URL being linked to (the destination page).", 10),
  response_format: responseFormat,
} as const;

// --- CredentialOS: POST /credential ---
export const credentialInputShape = {
  entityName: z
    .string()
    .min(2, "entityName must be at least 2 characters")
    .max(200, "entityName must not exceed 200 characters")
    .describe("The business or entity name to audit for credential authority."),
  location: optionalLocation("Optional business location to narrow to the correct entity."),
  services: z
    .string()
    .min(1)
    .optional()
    .describe("Optional industry or service category for targeted credential evaluation."),
  response_format: responseFormat,
} as const;

// --- GBPOS: POST /gbp ---
export const gbpInputShape = {
  entityName: z
    .string()
    .min(2, "entityName must be at least 2 characters")
    .max(200, "entityName must not exceed 200 characters")
    .describe("The exact business name as shown on the Google Business Profile."),
  location: optionalLocation(
    "Optional city and state where the GBP pin is located on Google Maps (not a service-area city).",
  ),
  websiteUrl: urlLike(
    "Optional website URL or domain shown on the Google Business Profile (prevents entity conflation).",
    4,
  ).optional(),
  response_format: responseFormat,
} as const;

// --- Stored EntityOS report: POST /entity-report ---
export const entityReportInputShape = {
  businessName: z
    .string()
    .min(2, "businessName must be at least 2 characters")
    .max(200, "businessName must not exceed 200 characters")
    .describe("The business name to look up. Matched against prior EntityOS scans."),
  location: optionalLocation("Optional business location for narrowing the match."),
  industry: z
    .string()
    .min(1)
    .optional()
    .describe("Optional industry or service type for narrowing the match."),
  response_format: responseFormat,
} as const;

// --- VisionOS: POST /vision (multipart/form-data) ---
export const visionInputShape = {
  image_path: z
    .string()
    .min(1, "image_path is required")
    .describe(
      "Path to a local image file to analyze (PNG, JPG, JPEG or WebP; max 10MB). Absolute paths recommended.",
    ),
  response_format: responseFormat,
} as const;

// --- ChatGPT-OS: POST /chatgpt (gated: add-on + BYOK) ---
export const chatgptInputShape = {
  query: z
    .string()
    .min(5, "query must be at least 5 characters")
    .max(200, "query must not exceed 200 characters")
    .describe("The 'best X in Y' style query to evaluate, e.g. 'Best plumber in Tucson AZ'."),
  response_format: responseFormat,
} as const;

// --- Combined batch: POST /combined ---
export const combinedInputShape = {
  tools: z
    .array(
      z
        .object({
          tool: z
            .enum(COMBINED_TOOL_NAMES)
            .describe("Which tool to run for this item."),
        })
        .passthrough(),
    )
    .min(1, "Provide at least one tool")
    .max(MAX_COMBINED_TOOLS, `A maximum of ${MAX_COMBINED_TOOLS} tools may be combined per request`)
    .describe(
      "Array of tool configurations. Each item needs a 'tool' field plus that tool's own parameters " +
        "(same names as its individual endpoint). All tools run in parallel server-side. " +
        "Note: 'entity' is EntityOS (uses query/businessName/serpMode/location/websiteUrl). " +
        "VisionOS is NOT available here (it needs file upload - use the image tool instead). " +
        "'chatgpt' requires the LLM Frameworks add-on plus a saved OpenAI key (BYOK).",
    ),
  response_format: responseFormat,
} as const;
