/**
 * Type definitions for RelationalSEO API responses.
 *
 * Every successful endpoint returns a JSON envelope. The exact fields vary by
 * tool, but `status` and `generated_at` are always present, and most tools
 * return a plain-text file tree in `analysis`. We keep this interface loose
 * (index signature) so additional/forward-compatible fields are never dropped.
 */
export interface RelationalSeoResponse {
  /** "complete" on success; "not_found" for entity-report with no prior scan. */
  status?: string;
  /** Tool identifier echoed by most endpoints (e.g. "diagnostic", "drift"). */
  tool?: string;
  /** ISO-8601 timestamp the analysis was generated. */
  generated_at?: string;
  /** Plain-text folder/file tree with the analysis (most tools). */
  analysis?: string;
  /** Human-readable message (e.g. on not_found / invalid_input). */
  message?: string;
  [key: string]: unknown;
}

/** Shape of an error body returned by the API on non-2xx responses. */
export interface RelationalSeoErrorBody {
  error?: string;
  message?: string;
  retry_after_seconds?: number;
  [key: string]: unknown;
}
