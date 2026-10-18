/**
 * Type declarations for the dsh-searxng browser half (loose on purpose; the
 * runtime bundle is the source of truth).
 */
/** Dictionary namespace owned by this page. */
export declare const NS: "settings.dshSearxng";
/** Required services (cordis fiber inject). */
export declare const inject: readonly ["slots", "locale", "configForms"];
/**
 * Mount the SearXNG settings page (Plugins page, `plugins.item` slot) while
 * the Host serves the `web-search-searxng` settings namespace.
 */
export declare function apply(ctx: unknown): void;
