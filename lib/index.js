/**
 * dsh-searxng — session-aware search router for the DeepSeek Harness web seam.
 *
 * Registers a single search provider (id `searxng`) that routes each query by
 * the current session's LLM provider:
 *   - session model on a local provider (default: `omlx`)
 *       → self-hosted SearXNG over its JSON API (`GET /search?format=json`).
 *         The SearXNG instance must run with `search.formats` including
 *         `json` (see README).
 *   - any other session model (cloud providers, e.g. DeepSeek)
 *       → DeepSeek search via the Messages API + `web_search_20250305`
 *         server tool, using the same credentials channel as the bundled
 *         `deepseek-official` provider (DeepSeek Account sign-in token, or
 *         the `DEEPSEEK_API_KEY` credential).
 *
 * The session provider is read the same way the bundled deepseek-official
 * provider does: `ctx.get("agents").currentInitiator().session
 * .requestContext().provider`. When no session context exists, queries route
 * to DeepSeek search. Cancellation is forwarded from the web service; the
 * seam owns the final result cap.
 */
import z from "@deepseek-ai/schemastery";

/** Default SearXNG base URL (loopback dev server / granian default port). */
const DEFAULT_SEARXNG_BASE_URL = "http://127.0.0.1:8888";
/** Environment override for the SearXNG base URL. */
const SEARXNG_BASE_URL_ENV = "DSH_SEARXNG_BASE_URL";
/** Stable id this provider registers under in the search registry. */
const PROVIDER_ID = "searxng";
/** Session LLM providers that are treated as local (→ SearXNG). */
const DEFAULT_LOCAL_PROVIDERS = ["omlx"];

// DeepSeek search endpoint defaults (kept in sync with deepseek-official).
const DEEPSEEK_SEARCH_BASE_URL_ENV = "DEEPSEEK_SEARCH_BASE_URL";
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic/v1";
const DEEPSEEK_SEARCH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_API_VERSION = "2023-06-01";
const DEEPSEEK_MAX_TOKENS = 4096;
const DEEPSEEK_MAX_USES = 5;
/** LLM provider route id used by DeepSeek Account sign-in sessions. */
const DEEPSEEK_ACCOUNT_PROVIDER = "deepseek-account";
const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";

/** Cordis plugin name used by loader diagnostics. */
export const name = "web-search-searxng";
/** The web seam this provider registers into. */
export const inject = ["web"];

/**
 * Live plugin config.
 * @property {string} baseURL - SearXNG instance base URL (no trailing slash
 *   required); `/search` is appended by the provider.
 * @property {string[]} localProviders - session LLM provider ids that route
 *   to SearXNG instead of DeepSeek search.
 */
export const Config = z.object({
  baseURL: z.string().default(DEFAULT_SEARXNG_BASE_URL).volatile(),
  localProviders: z.array(z.string()).default(DEFAULT_LOCAL_PROVIDERS).volatile()
});

/** Resolve the SearXNG base URL for one operation from the live section. */
function searxngBaseURL(config) {
  const fromConfig = config.baseURL?.get?.();
  const value =
    fromConfig !== void 0 && fromConfig.length > 0
      ? fromConfig
      : process.env[SEARXNG_BASE_URL_ENV] ?? DEFAULT_SEARXNG_BASE_URL;
  return String(value).replace(/\/+$/u, "");
}

/** Resolve the local-provider list for one operation. */
function localProvidersOf(config) {
  const value = config.localProviders?.get?.();
  if (Array.isArray(value)) {
    // an explicit (even empty) list is respected; only a missing field
    // falls back to the default
    return value.filter((id) => typeof id === "string" && id.length > 0);
  }
  return DEFAULT_LOCAL_PROVIDERS;
}

/**
 * The current session's LLM provider id, or `null` outside a session
 * context. Mirrors the read used by the bundled deepseek-official provider.
 */
function sessionProviderOf(ctx) {
  try {
    const provider = ctx?.get?.("agents")?.currentInitiator?.()
      ?.session?.requestContext?.()?.provider;
    return typeof provider === "string" && provider.length > 0 ? provider : null;
  } catch {
    return null;
  }
}

/** The DeepSeek search endpoint base (env override, else the default). */
function deepseekSearchBase() {
  const fromEnv = process.env[DEEPSEEK_SEARCH_BASE_URL_ENV];
  const value =
    fromEnv !== void 0 && fromEnv.length > 0
      ? fromEnv
      : DEEPSEEK_DEFAULT_BASE_URL;
  return String(value).replace(/\/+$/u, "");
}

/**
 * Resolve one DeepSeek search operation's auth headers: the DeepSeek Account
 * token for account sign-in sessions, otherwise the DEEPSEEK_API_KEY
 * credential.
 */
async function resolveDeepSeekAuth(ctx, sessionProvider, endpoint) {
  if (sessionProvider === DEEPSEEK_ACCOUNT_PROVIDER) {
    const token = await ctx?.get?.("deepseekAccount")?.resolveToken?.(endpoint);
    if (typeof token === "string" && token.length > 0) {
      return { "x-dsh-auth-token": token };
    }
  }
  let key;
  const credentials = ctx?.get?.("credentials");
  if (credentials !== void 0) {
    key = (await credentials.resolve(DEEPSEEK_API_KEY_ENV))?.value;
  }
  if (typeof key !== "string" || key.length === 0) {
    key = process.env[DEEPSEEK_API_KEY_ENV];
  }
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(
      `DeepSeek search has no API key for "${DEEPSEEK_API_KEY_ENV}"; ` +
        "store it through the credentials service or export it in the launching environment. " +
        "Sessions on local providers (e.g. omlx) use SearXNG and need no key."
    );
  }
  return { "x-api-key": key, authorization: `Bearer ${key}` };
}

/** Run one query against the self-hosted SearXNG instance. */
async function searchSearxng(query, baseURL, signal) {
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

/** Join each web_search_result URL to its citation excerpt as a snippet. */
function citationSnippets(blocks) {
  const map = new Map();
  for (const block of blocks) {
    if (block?.type !== "text") continue;
    for (const cite of block.citations ?? []) {
      if (
        cite.url != null &&
        cite.url.length > 0 &&
        cite.cited_text != null &&
        cite.cited_text.length > 0 &&
        !map.has(cite.url)
      ) {
        map.set(cite.url, cite.cited_text);
      }
    }
  }
  return map;
}

/** Map one DeepSeek Messages response to normalized sources (deduped). */
function mapDeepSeekResponse(response, endpoint) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const resultBlocks = blocks.filter((block) => block?.type === "web_search_tool_result");
  if (resultBlocks.length === 0) {
    throw new Error(
      `DeepSeek returned no web_search_tool_result blocks from ${endpoint}; ` +
        "the request may not have triggered native web search"
    );
  }
  const snippets = citationSnippets(blocks);
  const seen = new Set();
  const sources = [];
  for (const block of resultBlocks) {
    for (const item of block.content ?? []) {
      if (item?.type !== "web_search_result" || !item.url || seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      const snippet = snippets.get(item.url);
      sources.push({
        url: item.url,
        ...(item.title != null && item.title.length > 0 ? { title: item.title } : {}),
        ...(snippet != null && snippet.length > 0 ? { snippet } : {}),
        ...(item.page_age != null && item.page_age.length > 0
          ? { publishedAt: item.page_age }
          : {})
      });
    }
  }
  return { sources, truncated: false };
}

/** Run one query through DeepSeek search (Messages API + server tool). */
async function searchDeepSeek(ctx, sessionProvider, query, signal) {
  const endpoint = `${deepseekSearchBase()}/messages`;
  const auth = await resolveDeepSeekAuth(ctx, sessionProvider, endpoint);
  if (signal?.aborted === true) {
    throw new Error("DeepSeek search aborted");
  }
  const body = {
    model: DEEPSEEK_SEARCH_MODEL,
    max_tokens: DEEPSEEK_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Perform a web search for the query: ${query}`
          }
        ]
      }
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: DEEPSEEK_MAX_USES
      }
    ],
    thinking: { type: "disabled" }
  };
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        ...auth,
        "anthropic-version": DEEPSEEK_API_VERSION,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/0.0.1"
      },
      body: JSON.stringify(body),
      ...(signal !== void 0 ? { signal } : {})
    });
  } catch (error) {
    throw new Error(`DeepSeek search request failed: ${String(error)}`);
  }
  if (!response.ok) {
    let detail;
    try {
      const parsed = await response.json();
      detail =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message ?? parsed.message;
    } catch {
      // non-JSON error body; the status line below carries the context
    }
    throw new Error(
      `DeepSeek API error (HTTP ${response.status})${
        detail ? `: ${detail}` : ""
      } from ${endpoint}`
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`DeepSeek returned a non-JSON response from ${endpoint}`);
  }
  return mapDeepSeekResponse(data, endpoint);
}

/**
 * Register the session-aware search router with `ctx.web`.
 * @param {object} ctx - plugin context; `ctx.web` is the web capability seam.
 * @param {object} config - live config references for this section.
 */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider({
    id: PROVIDER_ID,
    available: () => URL.canParse(searxngBaseURL(config)),
    async search(request, signal) {
      const query = request?.query;
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error("dsh-searxng: search request has no query");
      }
      const sessionProvider = sessionProviderOf(ctx);
      const localProviders = localProvidersOf(config);
      if (sessionProvider !== null && localProviders.includes(sessionProvider)) {
        return searchSearxng(query, searxngBaseURL(config), signal);
      }
      return searchDeepSeek(ctx, sessionProvider, query, signal);
    }
  });
}
