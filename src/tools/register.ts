/**
 * Tool registration for the RelationalSEO MCP server.
 *
 * Nine endpoints share an identical JSON request/response flow, so they are
 * registered through a single helper (`registerJsonTool`). VisionOS (multipart
 * upload) and the combined batch endpoint get bespoke handlers.
 */

import { Blob } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  CHARACTER_LIMIT,
  COMBINED_TIMEOUT_MS,
  VISION_ALLOWED_EXTENSIONS,
  VISION_MAX_BYTES,
} from "../constants.js";
import { RelationalSeoClient, formatApiError } from "../services/client.js";
import type { RelationalSeoResponse } from "../types.js";
import {
  ResponseFormat,
  analyzeInputShape,
  backlinkInputShape,
  chatgptInputShape,
  combinedInputShape,
  credentialInputShape,
  diagnosticInputShape,
  driftInputShape,
  entityReportInputShape,
  gbpInputShape,
  pageInputShape,
  visionInputShape,
} from "../schemas/index.js";

type Annotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

type TextContent = { type: "text"; text: string };
type ToolResult = {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Annotations shared by the read-only analysis tools. */
// These are read-only diagnostic tools that reach an external API. Note: each
// call produces a fresh scan and consumes the rate limit - that caveat lives in
// the tool descriptions (idempotentHint is moot while readOnlyHint is true).
const ANALYSIS_ANNOTATIONS: Annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

// --------------------------------------------------------------------------
// Response formatting
// --------------------------------------------------------------------------

/** Scalar metadata fields rendered as a bullet list in markdown mode. */
const META_KEYS = [
  "status",
  "tool",
  "verdict",
  "overall_score",
  "provider",
  "query",
  "business_name",
  "businessName",
  "entity_name",
  "location",
  "services",
  "industry",
  "url",
  "source_url",
  "target_url",
  "serp_mode",
  "include_scrape",
  "file_name",
  "message",
  "generated_at",
];

/** Long free-text fields rendered as fenced blocks. */
const TEXT_BLOCK_KEYS = ["analysis", "entity_report", "omission_analysis"];

function toMarkdown(label: string, data: RelationalSeoResponse): string {
  const lines: string[] = [`# ${label}`];
  const rendered = new Set<string>();

  // Scalar metadata as a bullet list.
  const metaLines: string[] = [];
  for (const key of META_KEYS) {
    const value = data[key];
    if (value !== undefined && value !== null && typeof value !== "object") {
      metaLines.push(`- **${key}**: ${String(value)}`);
      rendered.add(key);
    }
  }
  if (data.token_usage !== undefined && data.token_usage !== null) {
    metaLines.push(`- **token_usage**: ${JSON.stringify(data.token_usage)}`);
    rendered.add("token_usage");
  }
  if (metaLines.length > 0) {
    lines.push("", ...metaLines);
  }

  // Long free-text fields as fenced blocks.
  for (const key of TEXT_BLOCK_KEYS) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      lines.push("", `## ${key}`, "```", value, "```");
      rendered.add(key);
    }
  }

  // Everything not yet rendered - including object/array-valued META/TEXT keys
  // and any unknown fields (e.g. combined per-tool results). Never drop data.
  for (const [key, value] of Object.entries(data)) {
    if (rendered.has(key) || value === undefined || value === null) continue;
    if (typeof value === "object") {
      lines.push("", `## ${key}`, "```json", JSON.stringify(value, null, 2), "```");
    } else {
      lines.push("", `- **${key}**: ${String(value)}`);
    }
  }

  if (lines.length === 1) {
    lines.push("", "```json", JSON.stringify(data, null, 2), "```");
  }
  return lines.join("\n");
}

function formatResult(
  label: string,
  data: RelationalSeoResponse,
  format: ResponseFormat,
): ToolResult {
  let text =
    format === ResponseFormat.JSON ? JSON.stringify(data, null, 2) : toMarkdown(label, data);

  if (text.length > CHARACTER_LIMIT) {
    const dropped = text.length - CHARACTER_LIMIT;
    text =
      text.slice(0, CHARACTER_LIMIT) +
      `\n\n…[truncated ${dropped} characters]. The full structured response is still ` +
      `available in this result's structuredContent, or request a narrower analysis.`;
  }

  return {
    content: [{ type: "text", text }],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(error: unknown): ToolResult {
  return { isError: true, content: [{ type: "text", text: formatApiError(error) }] };
}

function errorText(message: string): ToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// --------------------------------------------------------------------------
// Generic JSON tool registration
// --------------------------------------------------------------------------

interface JsonToolDef {
  name: string;
  title: string;
  label: string;
  endpoint: string;
  description: string;
  inputShape: z.ZodRawShape;
  annotations?: Annotations;
}

function registerJsonTool(
  server: McpServer,
  client: RelationalSeoClient,
  def: JsonToolDef,
): void {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.inputShape,
      annotations: def.annotations ?? ANALYSIS_ANNOTATIONS,
    },
    async (args: Record<string, unknown>) => {
      const { response_format, ...body } = args;
      try {
        const data = await client.postJson(def.endpoint, body as Record<string, unknown>);
        return formatResult(
          def.label,
          data,
          (response_format as ResponseFormat) ?? ResponseFormat.MARKDOWN,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

// --------------------------------------------------------------------------
// Tool descriptions (domain context drawn from the RelationalSEO tool suite)
// --------------------------------------------------------------------------

const JSON_TOOLS: JsonToolDef[] = [
  {
    name: "relationalseo_analyze_entity",
    title: "EntityOS - Entity Gap Analysis",
    label: "EntityOS - Entity Gap Analysis",
    endpoint: "/analyze",
    description: `Run EntityOS (POST /analyze): reveals the exact criteria search engines use to pick winners for a query, and which signals top-ranked entities have that a given business lacks.

Use when: targeting a specific query, onboarding a client, or measuring progress after changes. If 'businessName' is supplied, the response also includes an omission analysis explaining why that business is absent from results.

Args:
  - query (string, required, 5-200 chars): e.g. "Best plumber in Austin TX"
  - businessName (string, optional): triggers omission analysis for this business
  - serpMode (boolean, optional): anchor to live SERP results (default false)
  - location (string, optional): narrows to the correct entity
  - websiteUrl (string, optional): prevents entity conflation
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, query, serp_mode, analysis (a plain-text folder/file tree of signals), generated_at, and - when businessName is given - business_name and omission_analysis.`,
    inputShape: analyzeInputShape,
  },
  {
    name: "relationalseo_diagnose_visibility",
    title: "DiagnosticOS - Classifier-Level Visibility Diagnostic",
    label: "DiagnosticOS - Visibility Diagnostic",
    endpoint: "/diagnostic",
    description: `Run DiagnosticOS (POST /diagnostic): models Google as a system of interacting classifiers to identify which classifier is the dominant suppressor of an entity's visibility (e.g. Helpful Content, E-E-A-T, Thin Content, Link Quality, Site Quality).

Use when: organic traffic has dropped, especially after a Core/Helpful-Content/Spam update. Not for routine audits.

Args:
  - businessName (string, required, 2-200 chars)
  - location (string, optional): city/state to narrow to the correct entity
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, business_name, location, analysis (file tree), generated_at.`,
    inputShape: diagnosticInputShape,
  },
  {
    name: "relationalseo_analyze_drift",
    title: "DriftOS - Entity Perception Drift Analysis",
    label: "DriftOS - Entity Drift Analysis",
    endpoint: "/drift",
    description: `Run DriftOS (POST /drift): measures the gap between what a business actually does and how search engines perceive its authority, across 12 drift factors (service dilution, geographic drift, technical depth, visual authenticity, etc.).

Use when: quarterly reviews, after major business changes, or when rankings decline without a clear technical cause.

Args:
  - entityName (string, required, 2-200 chars)
  - location (string, optional)
  - services (string, optional): services the business claims to offer
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, entity_name, location, services, analysis (file tree), generated_at.`,
    inputShape: driftInputShape,
  },
  {
    name: "relationalseo_analyze_page",
    title: "PageOS - On-Page Content Integrity Evaluation",
    label: "PageOS - Page Content Analysis",
    endpoint: "/page",
    description: `Run PageOS (POST /page): evaluates whether a page's content reads as AI-generated, hybrid or human-written, plus local authenticity and technical readiness for AI-powered search (5 layers: AI Origin, Helpful Content, Local Entity, Abuse Detection, Technical AI Readiness).

Use when: before publishing content, after content production, or auditing existing pages.

Args:
  - url (string, required): the page URL to analyze
  - entityName (string, optional): improves entity grounding
  - location (string, optional)
  - includeScrape (boolean, optional): scrape live page content (default true); false uses Google's cached data only
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, url, entity_name, location, include_scrape, analysis (file tree), generated_at.`,
    inputShape: pageInputShape,
  },
  {
    name: "relationalseo_evaluate_backlink",
    title: "BacklinkOS - Backlink Quality & Relevance Evaluation",
    label: "BacklinkOS - Backlink Evaluation",
    endpoint: "/backlink",
    description: `Run BacklinkOS (POST /backlink): evaluates the quality and relevance of a backlink relationship between two URLs using the signal categories Google's systems use, including toxicity vetoes, source authority, topical alignment and agentic value.

Use when: evaluating a potential backlink, auditing existing backlinks, or analyzing a competitor's links.

Args:
  - sourceUrl (string, required): the URL where the backlink originates
  - targetUrl (string, required): the URL being linked to
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, source_url, target_url, analysis (file tree incl. a composite final_link_value 0.0-1.0), generated_at.`,
    inputShape: backlinkInputShape,
  },
  {
    name: "relationalseo_audit_credentials",
    title: "CredentialOS - Credential Authority Audit",
    label: "CredentialOS - Credential Audit",
    endpoint: "/credential",
    description: `Run CredentialOS (POST /credential): audits the verifiable proof behind a business's claimed expertise - licenses, certifications, insurance, trade memberships - across 8 credential dimensions specific to the trade and jurisdiction.

Use when: onboarding service businesses/tradespeople, annually, or after adding services or certifications.

Args:
  - entityName (string, required, 2-200 chars)
  - location (string, optional)
  - services (string, optional): industry or service category for targeted evaluation
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, entity_name, location, services, analysis (file tree), generated_at.`,
    inputShape: credentialInputShape,
  },
  {
    name: "relationalseo_diagnose_gbp",
    title: "GBPOS - Google Business Profile Diagnostic",
    label: "GBPOS - Google Business Profile Diagnostic",
    endpoint: "/gbp",
    description: `Run GBPOS (POST /gbp): an operator-grade diagnostic of a business's Google Business Profile across 7 signal layers (Relevance, Proximity, Prominence, Engagement, Freshness, Ecosystem Authority, AI Trust), using a veto/flag methodology.

Use when: onboarding a local client, monthly for local clients, or when local-pack rankings decline.

Args:
  - entityName (string, required, 2-200 chars): exact name on the GBP
  - location (string, optional): city/state where the GBP pin sits on Maps
  - websiteUrl (string, optional): prevents entity conflation
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, entity_name, location, analysis (file tree incl. spam_detection score and entity status), generated_at.`,
    inputShape: gbpInputShape,
  },
  {
    name: "relationalseo_get_entity_report",
    title: "EntityOS Report Lookup",
    label: "Stored EntityOS Report",
    endpoint: "/entity-report",
    description: `Retrieve a previously stored EntityOS report (POST /entity-report). This is a lookup against prior EntityOS scans - it does not run a new analysis.

Args:
  - businessName (string, required, 2-200 chars): matched against prior scans
  - location (string, optional): narrows the match
  - industry (string, optional): narrows the match
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: on success, status "complete" with businessName, location, industry, entity_report (text) and generated_at. If no prior scan exists, status "not_found" with a message instructing you to run an EntityOS scan first.`,
    inputShape: entityReportInputShape,
  },
  {
    name: "relationalseo_evaluate_llm_visibility",
    title: "ChatGPT-OS - LLM Evaluation Framework (Beta, BYOK)",
    label: "ChatGPT-OS - LLM Evaluation",
    endpoint: "/chatgpt",
    description: `Run ChatGPT-OS (POST /chatgpt): reproduces an LLM's internal reasoning and recommendation logic for a "best X in Y" query - classifiers, screening, scoring, groundedness, shortlisting and final answer generation.

GATED: requires the $15/month LLM Frameworks add-on AND your own OpenAI API key saved in RelationalSEO Settings (BYOK; OpenAI bills you directly). Without the add-on you get 403 llm_frameworks_required; without a saved key, 403 byok_required.

Args:
  - query (string, required, 5-200 chars): a "best X in Y" style query
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, query, provider, analysis (file tree), token_usage, generated_at.`,
    inputShape: chatgptInputShape,
  },
];

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export function registerTools(server: McpServer, client: RelationalSeoClient): void {
  for (const def of JSON_TOOLS) {
    registerJsonTool(server, client, def);
  }

  // VisionOS - multipart image upload.
  server.registerTool(
    "relationalseo_analyze_image",
    {
      title: "VisionOS - Image Authenticity Detection",
      description: `Run VisionOS (POST /vision): detects AI-generated and stock imagery before it hurts a site's trust signals. Runs the image through four classifier modules (forensic detectors, lighting geometry, human sentiment, semantic context) and returns a risk score with a verdict.

Use when: auditing site images at onboarding, before publishing image content, or when DriftOS flags visual authenticity.

Args:
  - image_path (string, required): path to a LOCAL image file (PNG/JPG/JPEG/WebP, max 10MB). The server reads the file and uploads it as multipart/form-data.
  - response_format ('markdown' | 'json'): default 'markdown'

Returns: a JSON envelope with status, tool, analysis (text), overall_score (0-100), verdict (e.g. POSSIBLY_AUTHENTIC), file_name, token_usage, generated_at.`,
      inputSchema: visionInputShape,
      annotations: ANALYSIS_ANNOTATIONS,
    },
    async (args: Record<string, unknown>) => {
      const imagePath = String(args.image_path ?? "");
      const responseFormat = (args.response_format as ResponseFormat) ?? ResponseFormat.MARKDOWN;
      const resolved = path.resolve(imagePath);
      const ext = path.extname(resolved).toLowerCase();

      if (!(VISION_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        return errorText(
          `Error: unsupported image type '${ext || "(none)"}'. Allowed: ${VISION_ALLOWED_EXTENSIONS.join(", ")}.`,
        );
      }

      let buffer: Buffer;
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          return errorText(`Error: '${imagePath}' is not a file.`);
        }
        if (stat.size > VISION_MAX_BYTES) {
          return errorText(
            `Error: image is ${stat.size} bytes, which exceeds the 10MB (${VISION_MAX_BYTES} byte) limit.`,
          );
        }
        buffer = await fs.readFile(resolved);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return errorText(`Error: image file not found: ${resolved}`);
        }
        return errorResult(error);
      }

      try {
        const form = new FormData();
        const blob = new Blob([new Uint8Array(buffer)], { type: mimeForExtension(ext) });
        form.append("image", blob, path.basename(resolved));
        const data = await client.postMultipart("/vision", form);
        return formatResult("VisionOS - Image Authenticity", data, responseFormat);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // Combined batch endpoint.
  server.registerTool(
    "relationalseo_run_combined",
    {
      title: "Combined - Run Multiple OS Tools in One Request",
      description: `Run several RelationalSEO tools in parallel with a single request (POST /combined). Useful for client onboarding (e.g. entity + diagnostic + gbp + credential at once) - it counts as one request against the rate limit on the surface but each tool still does its own work.

Args:
  - tools (array, required, 1-7 items): each item is an object with a 'tool' field plus that tool's own parameters (the same names as its individual endpoint). Valid tool values: "entity" (EntityOS: query/businessName/serpMode/location/websiteUrl), "diagnostic", "drift", "page", "backlink", "credential", "gbp", "rewrite", "chatgpt". VisionOS is NOT available here (needs file upload). The "chatgpt" tool requires the LLM Frameworks add-on + BYOK; without them only that tool errors while the rest still run.
  - response_format ('markdown' | 'json'): default 'markdown'

Example tools value:
  [
    { "tool": "entity", "query": "Best carpet cleaning in Tucson AZ", "businessName": "Steamy Concepts", "serpMode": true },
    { "tool": "diagnostic", "businessName": "Steamy Concepts", "location": "Tucson, AZ" },
    { "tool": "gbp", "entityName": "Steamy Concepts", "location": "Tucson, AZ" }
  ]

Returns: a JSON envelope combining each tool's result. Uses an extended timeout because tools run server-side in parallel.`,
      inputSchema: combinedInputShape,
      annotations: ANALYSIS_ANNOTATIONS,
    },
    async (args: Record<string, unknown>) => {
      const responseFormat = (args.response_format as ResponseFormat) ?? ResponseFormat.MARKDOWN;
      const tools = args.tools;
      try {
        const data = await client.postJson("/combined", { tools }, COMBINED_TIMEOUT_MS);
        return formatResult("Combined Analysis", data, responseFormat);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
