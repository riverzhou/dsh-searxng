/**
 * Type declarations for @riverzhou/dsh-searxng (loose on purpose; the runtime module is
 * the source of truth).
 */
/** Cordis plugin name used by loader diagnostics. */
export declare const name: "web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: readonly ["web"];
/**
 * Live plugin config section:
 * `{ baseURL: string, localProviders?: string[] }`.
 * `baseURL` defaults to `http://127.0.0.1:8888`; `localProviders` defaults to
 * `["omlx"]` (session LLM provider ids that route to SearXNG).
 */
export declare const Config: unknown;
/**
 * Register the session-aware `searxng` search provider on `ctx.web`:
 * local-provider sessions use SearXNG, other sessions use DeepSeek search.
 */
export declare function apply(
  ctx: unknown,
  config: {
    baseURL: { get(): string | undefined };
    localProviders?: { get(): string[] | undefined };
  }
): void;
