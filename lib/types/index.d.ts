/**
 * Type declarations for dsh-searxng (loose on purpose; the runtime module is
 * the source of truth).
 */
/** Cordis plugin name used by loader diagnostics. */
export declare const name: "web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: readonly ["web"];
/**
 * Live plugin config section: `{ baseURL: string }`.
 * `baseURL` defaults to `http://127.0.0.1:8888`.
 */
export declare const Config: unknown;
/** Register the `searxng` search provider on `ctx.web`. */
export declare function apply(
  ctx: unknown,
  config: { baseURL: { get(): string | undefined } }
): void;
