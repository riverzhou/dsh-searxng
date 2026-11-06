/**
 * @riverzhou/dsh-searxng — session-aware search router for the DeepSeek Harness web seam.
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
 * DSH 0.2.2 surface: the provider carries a picker `title`/`description` (the
 * built-in Web search settings page lists it from `web/listProviders`), a
 * `ready(llmProvider)` hook that answers whether a search assembled for that
 * chat route would have a credential — so the model step withholds the tool
 * instead of failing on dispatch — and a structural `available()`. Environment
 * fallbacks read the launcher's snapshot (`ctx.get("launchEnvironment")`)
 * before the process environment, and the API key is checked through the
 * credentials service (`describe`) without touching the network.
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

/** Provider title shown by provider pickers (`web/listProviders`). */
const PROVIDER_TITLE = "SearXNG (by model)";
/**
 * Picker description: what this provider suits and what it costs. Localized;
 * `en` is required by the package-manifest contract.
 */
const PROVIDER_DESCRIPTION = Object.freeze({
  en: "Local-model sessions search your self-hosted SearXNG instance with no API key; every other session searches through DeepSeek, reusing the DeepSeek account or API key.",
  zh: "本地模型会话搜索自建 SearXNG 实例，无需 API Key；其余会话走 DeepSeek 搜索，沿用 DeepSeek 账号或 API Key。",
  ja: "ローカルモデルのセッションは API キー不要で自前の SearXNG を検索し、それ以外のセッションは DeepSeek アカウントまたは API キーで DeepSeek 検索を使います。",
});

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

/**
 * Read one environment value through the launcher's snapshot, falling back to
 * the inherited process environment. Mirrors `launchEnvironmentOf` from
 * @deepseek-ai/dsh-launch-environment without importing a package the profile
 * may resolve to a different release than the running Host.
 * @param ctx - plugin context; `launchEnvironment` is the launcher's slot.
 * @param name - environment variable name.
 * @returns the non-empty value, or undefined.
 */
function launchEnvironmentValue(ctx, name) {
  try {
    const hit = ctx?.get?.("launchEnvironment")?.get?.(name);
    if (hit !== undefined && typeof hit.value === "string" && hit.value.length > 0) {
      return hit.value;
    }
  } catch {
    // fall through to the inherited process environment
  }
  const ambient = process.env[name];
  return typeof ambient === "string" && ambient.length > 0 ? ambient : undefined;
}

/** Resolve the SearXNG base URL for one operation from the live section. */
function searxngBaseURL(ctx, config) {
  const fromConfig = config.baseURL?.get?.();
  const value =
    fromConfig !== void 0 && fromConfig.length > 0
      ? fromConfig
      : launchEnvironmentValue(ctx, SEARXNG_BASE_URL_ENV) ?? DEFAULT_SEARXNG_BASE_URL;
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
function deepseekSearchBase(ctx) {
  const value = launchEnvironmentValue(ctx, DEEPSEEK_SEARCH_BASE_URL_ENV)
    ?? DEEPSEEK_DEFAULT_BASE_URL;
  return String(value).replace(/\/+$/u, "");
}

/** The DeepSeek Messages endpoint this provider searches through. */
function deepseekSearchEndpoint(ctx) {
  return `${deepseekSearchBase(ctx)}/messages`;
}

/**
 * Resolve the DeepSeek account token for one endpoint, contained so an
 * unreadable account store reads as "no token" rather than failing the search
 * before the API key is tried.
 * @param ctx - plugin context; `deepseekAccount` is the optional account service.
 * @param endpoint - destination that would receive the token.
 * @returns the token, or undefined.
 */
async function resolveAccountToken(ctx, endpoint) {
  try {
    const token = await ctx?.get?.("deepseekAccount")?.resolveToken?.(endpoint);
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the DeepSeek API key through the credential service, then the launch environment. */
async function resolveApiKey(ctx) {
  try {
    const hit = await ctx?.get?.("credentials")?.resolve?.(DEEPSEEK_API_KEY_ENV);
    if (hit !== undefined && typeof hit.value === "string" && hit.value.length > 0) {
      return hit.value;
    }
  } catch {
    // fall through to the inherited environment
  }
  return launchEnvironmentValue(ctx, DEEPSEEK_API_KEY_ENV);
}

/**
 * Whether a search assembled for `route` would have a credential to send.
 * Checks configuration only: the account token is resolved (reads the local
 * account store) and the API key's presence is described, while the endpoint
 * is never contacted. A failed read answers false, because the search would
 * fail on that read instead of trying the next credential.
 * @param ctx - plugin context supplying the account and credential planes.
 * @param route - provider route of the model request being assembled.
 * @returns whether the account token or an API key is available.
 */
async function searchConfigured(ctx, route) {
  if (route === DEEPSEEK_ACCOUNT_PROVIDER) {
    const account = ctx?.get?.("deepseekAccount");
    if (account !== undefined) {
      let token;
      try {
        token = await account.resolveToken?.(deepseekSearchEndpoint(ctx));
      } catch {
        return false; // The search fails on this read before it tries the API key.
      }
      if (typeof token === "string" && token.length > 0) return true;
    }
  }
  try {
    const info = await ctx?.get?.("credentials")?.describe?.(DEEPSEEK_API_KEY_ENV);
    if (info !== undefined) return info.configured === true;
  } catch {
    return false; // A store that cannot be read supplies no key to the search either.
  }
  return launchEnvironmentValue(ctx, DEEPSEEK_API_KEY_ENV) !== undefined;
}

/**
 * Resolve one DeepSeek search operation's auth headers: the DeepSeek Account
 * token for account sign-in sessions, otherwise the DEEPSEEK_API_KEY
 * credential. Both official DeepSeek and Anthropic-compatible proxies accept
 * the API key, so it is sent as both `x-api-key` and a Bearer token.
 * @param ctx - plugin context supplying the account and credential planes.
 * @param route - provider route of the model request that called the search.
 * @param endpoint - Messages endpoint the request dispatches to.
 * @returns headers, plus the credential kind and token for a 401 invalidation.
 */
async function resolveDeepSeekAuth(ctx, route, endpoint) {
  if (route === DEEPSEEK_ACCOUNT_PROVIDER) {
    const token = await resolveAccountToken(ctx, endpoint);
    if (token !== undefined) {
      return { kind: "account", token, headers: { "x-dsh-auth-token": token } };
    }
  }
  const key = await resolveApiKey(ctx);
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(
      `DeepSeek search has no API key for "${DEEPSEEK_API_KEY_ENV}"; ` +
        "store it through the credentials service (the Web Models page writes it), " +
        "export it in the launching environment, or set a literal apiKey in the " +
        "web-search-deepseek config. Sessions on local providers (e.g. omlx) use " +
        "SearXNG and need no key."
    );
  }
  return {
    kind: "api-key",
    headers: { "x-api-key": key, authorization: `Bearer ${key}` }
  };
}

/** Run one query against the self-hosted SearXNG instance. */
async function searchSearxng(query, baseURL, signal) {
  const url = `${baseURL}/search?q=${encodeURIComponent(query)}&format=json`;
  let res;
  try {
    res = await fetch(url, {
      signal,
      headers: { accept: "application/json" }
    });
  } catch (error) {
    if (signal?.aborted === true) throw new Error("SearXNG search aborted");
    throw new Error(`SearXNG search request failed: ${String(error)}`);
  }
  if (!res.ok) {
    throw new Error(
      `SearXNG search failed: HTTP ${res.status} from ${baseURL}; ` +
        "check that the instance enables JSON in search.formats (see README)"
    );
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
async function searchDeepSeek(ctx, route, query, signal) {
  const endpoint = deepseekSearchEndpoint(ctx);
  const auth = await resolveDeepSeekAuth(ctx, route, endpoint);
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
        ...auth.headers,
        "anthropic-version": DEEPSEEK_API_VERSION,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "deepseek-harness/0.0.1"
      },
      body: JSON.stringify(body),
      ...(signal !== void 0 ? { signal } : {})
    });
  } catch (error) {
    if (signal?.aborted === true) throw new Error("DeepSeek search aborted");
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
    if (response.status === 401 && auth.kind === "account") {
      try {
        await ctx?.get?.("deepseekAccount")?.rejectToken?.(auth.token);
      } catch {
        // Report the original failure even if credential removal fails.
      }
      throw new Error(
        `DeepSeek API error (HTTP 401) from ${endpoint}` +
          (detail ? `: ${detail}` : "") +
          "\n\nDeepSeek rejected the account sign-in used for this web search. " +
          "Sign in to DeepSeek again; the search endpoint does not need changing."
      );
    }
    throw new Error(
      `DeepSeek API error (HTTP ${response.status})${
        detail ? `: ${detail}` : ""
      } from ${endpoint}\n\nSearch endpoint configuration is separate from chat; ` +
        "set DEEPSEEK_SEARCH_BASE_URL or web-search-searxng config when a proxy is intended."
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
    title: PROVIDER_TITLE,
    description: PROVIDER_DESCRIPTION,
    // Structural only: the router can always attempt a search, and
    // `ready(route)` decides whether a specific chat route can authenticate.
    available: () => true,
    /**
     * Whether a search assembled for `llmProvider` would have what it needs.
     * Local-model routes need only a parseable SearXNG base URL; every other
     * route needs the DeepSeek account token or API key.
     * @param llmProvider - provider route id of the model request, when known.
     * @returns whether the route's search would be able to run.
     */
    async ready(llmProvider) {
      const route =
        typeof llmProvider === "string" && llmProvider.length > 0
          ? llmProvider
          : sessionProviderOf(ctx);
      if (route === null) return true; // No route to judge; let the search report.
      if (localProvidersOf(config).includes(route)) {
        return URL.canParse(searxngBaseURL(ctx, config));
      }
      return searchConfigured(ctx, route);
    },
    async search(request, signal) {
      const query = request?.query;
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new Error("@riverzhou/dsh-searxng: search request has no query");
      }
      const route = sessionProviderOf(ctx);
      if (route !== null && localProvidersOf(config).includes(route)) {
        return searchSearxng(query, searxngBaseURL(ctx, config), signal);
      }
      return searchDeepSeek(ctx, route, query, signal);
    }
  });
}
