/**
 * Type declarations for @riverzhou/dsh-searxng (loose on purpose; the runtime module is the
 * source of truth).
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
 * The provider carries a picker `title`/`description`, reports structural
 * `available()`, and answers `ready(llmProvider)` with what a search for that
 * chat route needs (a parseable SearXNG URL, or the DeepSeek account token /
 * API key) so the model step withholds the tool when nothing could run.
 */
export declare function apply(
  ctx: unknown,
  config: {
    baseURL: { get(): string | undefined };
    localProviders?: { get(): string[] | undefined };
  }
): void;
