/**
 * HTTP client for the RelationalSEO API.
 *
 * Uses Node's native `fetch`/`FormData` (Node >= 18). Centralises
 * authentication, timeouts, and error handling so individual tools stay thin.
 */

import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "../constants.js";
import type { RelationalSeoErrorBody, RelationalSeoResponse } from "../types.js";

/** Error thrown when the API returns a non-2xx response. */
export class RelationalSeoApiError extends Error {
  readonly httpStatus: number;
  /** Machine-readable code from the body (e.g. "rate_limit_exceeded"). */
  readonly code: string | undefined;
  /** Seconds to wait before retrying, when the API supplies it (429). */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    httpStatus: number,
    code: string | undefined,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RelationalSeoApiError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Error thrown when a request times out or the network fails. */
export class RelationalSeoNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelationalSeoNetworkError";
  }
}

export interface RelationalSeoClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class RelationalSeoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: RelationalSeoClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** POST a JSON body to `path` (e.g. "/diagnostic"). */
  async postJson(
    path: string,
    body: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<RelationalSeoResponse> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, timeoutMs);
  }

  /** POST a multipart/form-data body to `path` (e.g. "/vision"). */
  async postMultipart(
    path: string,
    form: FormData,
    timeoutMs?: number,
  ): Promise<RelationalSeoResponse> {
    // Do NOT set Content-Type manually - fetch adds the multipart boundary.
    return this.request(path, { method: "POST", body: form }, timeoutMs);
  }

  private async request(
    path: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<RelationalSeoResponse> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const limit = timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), limit);

    let response: Response;
    let rawText: string;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
      // Read the body while still under the abort timeout, so a server that
      // returns headers promptly but stalls mid-body is also aborted.
      rawText = await response.text();
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        throw new RelationalSeoNetworkError(
          `Request to ${path} timed out after ${limit} ms. The analysis may be ` +
            `taking longer than usual - increase RELATIONALSEO_TIMEOUT_MS or retry.`,
        );
      }
      throw new RelationalSeoNetworkError(
        `Network error calling ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    clearTimeout(timer);

    const parsed = safeJsonParse(rawText);

    if (!response.ok) {
      const errorBody = (parsed ?? {}) as RelationalSeoErrorBody;
      const code = typeof errorBody.error === "string" ? errorBody.error : undefined;
      const message =
        errorBody.message ??
        (typeof code === "string" ? code : undefined) ??
        rawText.slice(0, 500) ??
        response.statusText;
      throw new RelationalSeoApiError(
        response.status,
        code,
        message || `HTTP ${response.status}`,
        typeof errorBody.retry_after_seconds === "number"
          ? errorBody.retry_after_seconds
          : undefined,
      );
    }

    if (parsed === undefined) {
      throw new RelationalSeoNetworkError(
        `Received a non-JSON response from ${path} (HTTP ${response.status}).`,
      );
    }
    return parsed as RelationalSeoResponse;
  }
}

function safeJsonParse(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Convert any thrown error into a concise, actionable message for the agent.
 * Maps the documented RelationalSEO error codes to next-step guidance.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof RelationalSeoApiError) {
    switch (error.httpStatus) {
      case 401:
        return (
          "Error 401 (unauthorized): missing or invalid API key. Check that " +
          "RELATIONALSEO_API_KEY is set to a valid token and that your " +
          "subscription is active."
        );
      case 400:
        return `Error 400 (invalid_input): ${error.message}. Check the required parameters and try again.`;
      case 403:
        if (error.code === "llm_frameworks_required") {
          return (
            "Error 403 (llm_frameworks_required): ChatGPT-OS needs the $15/month " +
            "LLM Frameworks add-on. Activate it in RelationalSEO Settings."
          );
        }
        if (error.code === "byok_required") {
          return (
            "Error 403 (byok_required): ChatGPT-OS needs your own OpenAI API key " +
            "saved in RelationalSEO Settings (BYOK). OpenAI bills you directly."
          );
        }
        return `Error 403 (forbidden): ${error.message}.`;
      case 429: {
        // Two different 429s reach here. The app's documented account limit returns
        // JSON with code "rate_limit_exceeded" (often plus retry_after_seconds). An
        // upstream Google Frontend edge throttle returns text/html "Rate exceeded."
        // with neither - that one is per-IP burst protection, not the account quota.
        const isAccountLimit =
          error.code === "rate_limit_exceeded" || error.retryAfterSeconds !== undefined;
        if (!isAccountLimit) {
          return (
            "Error 429: upstream edge/infrastructure throttle - NOT your RelationalSEO " +
            "account quota (that is unaffected). Triggered by sending many requests in a " +
            "short burst; it usually clears within ~30-60 seconds. Wait briefly and retry, " +
            "and avoid firing many calls at once."
          );
        }
        const wait =
          typeof error.retryAfterSeconds === "number"
            ? ` Retry after ${error.retryAfterSeconds} seconds (~${Math.ceil(error.retryAfterSeconds / 60)} min).`
            : "";
        return (
          `Error 429 (rate_limit_exceeded): your RelationalSEO account hourly limit ` +
          `(40/hr founding members, 20/hr standard, shared across all endpoints) was exceeded.${wait}`
        );
      }
      case 500:
        return `Error 500 (analysis_failed): an internal error occurred during analysis. Retry the request.`;
      default:
        return `Error ${error.httpStatus}: ${error.message}`;
    }
  }
  if (error instanceof RelationalSeoNetworkError) {
    return `Error: ${error.message}`;
  }
  return `Error: unexpected failure: ${error instanceof Error ? error.message : String(error)}`;
}
