/**
 * dsh-searxng — a local SearXNG provider for the DeepSeek Harness web seam.
 *
 * Registers a `searxng` search provider on `ctx.web` that queries a
 * self-hosted SearXNG instance over its JSON API (`GET /search?q=…&format=json`).
 * The instance must run with `search.formats` including `json`
 * (see README). Cancellation is forwarded from the web service; the seam
 * owns the final result cap.
 */
import z from "@deepseek-ai/schemastery";

/** Default SearXNG base URL (loopback dev server / granian default port). */
const DEFAULT_BASE_URL = "http://127.0.0.1:8888";
/** Environment override, checked after the live config section. */
const BASE_URL_ENV = "DSH_SEARXNG_BASE_URL";
/** Stable id this provider registers under in the search registry. */
const PROVIDER_ID = "searxng";

/** Cordis plugin name used by loader diagnostics. */
export const name = "web-search-searxng";
/** The web seam this provider registers into. */
export const inject = ["web"];

/**
 * Live plugin config.
 * @property {string} baseURL - SearXNG instance base URL (no trailing slash
 *   required); `/search` is appended by the provider.
 */
export const Config = z.object({
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile()
});

/** Resolve the base URL for one operation from the live section. */
function baseURLOf(config) {
  const fromConfig = config.baseURL.get();
  const value =
    fromConfig !== void 0 && fromConfig.length > 0
      ? fromConfig
      : process.env[BASE_URL_ENV] ?? DEFAULT_BASE_URL;
  return String(value).replace(/\/+$/u, "");
}

/**
 * Register the SearXNG provider with `ctx.web`.
 * @param {object} ctx - plugin context; `ctx.web` is the web capability seam.
 * @param {object} config - live config references for this section.
 */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider({
    id: PROVIDER_ID,
    available: () => URL.canParse(baseURLOf(config)),
    async search(request, signal) {
      const query = request?.query;
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error("dsh-searxng: search request has no query");
      }
      const baseURL = baseURLOf(config);
      const url = `${baseURL}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        signal,
        headers: { accept: "application/json" }
      });
      if (!res.ok) {
        throw new Error(`SearXNG search failed: HTTP ${res.status} from ${baseURL}`);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`SearXNG search failed: non-JSON response from ${baseURL}`);
      }
      const results = Array.isArray(data?.results) ? data.results : [];
      const seen = new Set();
      const sources = [];
      for (const r of results) {
        if (!r || typeof r.url !== "string" || r.url.length === 0) {
          continue;
        }
        if (seen.has(r.url)) {
          continue;
        }
        seen.add(r.url);
        sources.push({
          url: r.url,
          ...(typeof r.title === "string" && r.title ? { title: r.title } : {}),
          ...(typeof r.content === "string" && r.content
            ? { snippet: r.content }
            : {}),
          ...(typeof r.publishedDate === "string" && r.publishedDate
            ? { publishedAt: r.publishedDate }
            : {})
        });
      }
      return { sources, truncated: false };
    }
  });
}
