# @riverzhou/dsh-searxng

DeepSeek Harness 插件:让 `web_search` 工具**按会话所用的模型自动选择搜索后端**——用本地模型(如 oMLX)时走**自建 SearXNG**,用云端模型(如 DeepSeek)时走 **DeepSeek 云端搜索**。

A DSH plugin that registers a session-aware search provider on the `ctx.web` seam. Each query is routed by the current session's LLM provider: local models (default `omlx`) use a self-hosted [SearXNG](https://github.com/searxng/searxng) instance (JSON API); any other (cloud) model uses DeepSeek search (Messages API + `web_search_20250305` server tool, same credentials channel as the bundled `deepseek-official` provider).

For DSH `>=0.2.2` the provider also reports a picker `title`/`description`, a structural `available()`, and a `ready(llmProvider)` hook: the built-in **Web search and fetch** settings page lists it through `web/listProviders`, and a model step withholds `web_search` when the route's search would have no credential (for example a cloud session without a DeepSeek account or API key) instead of failing on dispatch.

```
DSH web_search ─▶ ctx.web (searchProvider: searxng)
                  ─▶ dsh-searxng provider(按会话模型路由)
                     ├─ 本地模型(omlx)    ─▶ SearXNG  GET /search?q=…&format=json
                     └─ 云端模型(DeepSeek) ─▶ POST {baseURL}/messages(web_search 原生搜索)
```

路由依据是会话当前的 LLM provider(与官方 deepseek provider 读取同一位置:`agents → currentInitiator → session → requestContext → provider`)。没有会话上下文时走云端分支。

## SearXNG 侧要求(仅本地分支需要)

- `search.formats` 必须包含 `json`(默认只有 `html`,不配会 403)
- 跨机访问时 SearXNG 需要绑定局域网地址(如 `0.0.0.0`),且 DSH 与 SearXNG 在同一网络可达
- 可选:给国际引擎配置代理(见下)

```yaml
# ~/.config/searxng/settings.yml(或你的 SEARXNG_SETTINGS_PATH)
use_default_settings: true
search:
  formats:
    - html
    - json
```

## 云端分支的凭据

云端会话(非本地 provider)的 DeepSeek 搜索按以下顺序解析凭据:

1. 会话为 DeepSeek Account 登录时 → 账号 token(`x-dsh-auth-token`);HTTP 401 时自动让该 token 失效(与官方 provider 一致)
2. 凭据服务中的 `DEEPSEEK_API_KEY`(`credentials.resolve`)
3. 启动环境快照 / 进程环境中的 `DEEPSEEK_API_KEY`

本地会话(omlx)不经过云端,无需任何 key。`ready()` 的判定与上面同序、只检查配置不发请求。

## 上游引擎与代理(可选)

SearXNG 的每个引擎可单独配置代理(`proxies`,按 http/https 分列)。国内引擎直连、国际引擎走代理是典型用法:

```yaml
engines:
  # 直连(默认禁用,显式启用)
  - name: bing
    disabled: false
  - name: baidu
    disabled: false

  # 国际引擎:走代理
  - name: wikipedia
    disabled: false
    proxies:
      http: [ "http://192.168.3.251:8888" ]
      https: [ "http://192.168.3.251:8888" ]
```

走代理的请求延迟更高,建议在 `outgoing` 段放宽超时:

```yaml
outgoing:
  max_request_timeout: 10.0
  extra_proxy_timeout: 5
```

注意:上游引擎(baidu/quark 的验证码、wikipedia/brave 的 429)会在高频请求后临时挂起 3~60 分钟,属正常自我保护,无需干预。

## 安装(Windows DSH profile)

> 要求 DSH `>=0.2.2-0`(0.2.2 及以上,含 nightly 的 0.2.2-rc.x;见 `package.json` 的 `engines.dsh`)。0.2.2 起 provider 的 `title`/`description`/`ready` 与官方「网页搜索与获取」选择器才可用。

1. 编辑 profile 的 `package.json`(例如 `%USERPROFILE%\.dsh\profiles\desktop\package.json`),在 `dependencies` 加入(把 `<用户名>` 换成你的 GitHub 用户名):

    ```json
    {
      "dependencies": {
        "@riverzhou/dsh-searxng": "git+https://github.com/riverzhou/dsh-searxng.git#main"
      }
    }
    ```

    (本地安装也可以把 `#` 后的 `git+https://...` 换成绝对/相对路径,如 `D:/GitHub/dsh-searxng`)

2. 在 profile 目录执行 `pnpm install`(DSH profile 自带 `pnpm-workspace.yaml`)。

3. 编辑 profile 的 `cordis.patch.yml`(bundle 之后应用的补丁层),追加:

    ```yaml
    # 加载插件(新条目必须放在 insert 下),并把 web 服务的搜索提供方固定为 searxng。
    # 注意:patch 是整行替换 config,`web` 行必须把 searchProvider/fetchProvider 都重述。
    - insert:
        - id: web-search-searxng
          name: "@riverzhou/dsh-searxng"
          config:
            baseURL: http://192.168.3.198:8888   # SearXNG 所在机器的局域网地址
            # localProviders: [omlx]            # 可选:哪些会话 provider 算"本地"

    - id: web
      name: "@deepseek-ai/dsh-web"
      config:
        searchProvider: searxng
        fetchProvider: http   # web_fetch 仍走本机直连
    ```

4. 重启 DSH(配置热加载通常会自动生效,重启最稳妥)。

## 配置项

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseURL` | `http://127.0.0.1:8888` | SearXNG 实例地址(本地分支),不需要尾部 `/` |
| `localProviders` | `["omlx"]` | 会话 LLM provider 名单:名单内 → SearXNG;名单外(云端)→ DeepSeek 搜索。显式设 `[]` 表示没有本地 provider |

环境变量(先读启动器快照 `ctx.get("launchEnvironment")`,再回退到进程环境):

- `DSH_SEARXNG_BASE_URL` — 覆盖 `baseURL` 的默认值(config 中显式设置时以 config 为准)
- `DEEPSEEK_SEARCH_BASE_URL` — 覆盖云端搜索端点(默认 `https://api.deepseek.com/anthropic/v1`)

## GUI 设置页

DSH 0.2.2 起有两处设置入口:

1. **官方「网页搜索与获取」页**(插件 → 内置插件设置 → 网页搜索与获取):搜索提供方下拉里会列出 **SearXNG (by model)**(id `searxng`),选中即把 `web.searchProvider` 指到本插件,无需再手写 `web` 行;选中时还会显示本插件的说明(本地会话走 SearXNG,其余会话走 DeepSeek)。
2. **插件自带页**(插件 → 内置插件设置 → SearXNG 搜索):
   - **SearXNG 基础地址**(`baseURL`)— 本地分支查询的实例地址,留空恢复默认
   - **本地模型会话的提供方**(`localProviders`)— 逗号分隔的 provider id 名单,留空恢复默认(`omlx`)

保存即热生效:provider 每次搜索时读取最新配置,无需重启 DSH。

注意:设置页依赖 Loader 行是**包引用**(`name: "@riverzhou/dsh-searxng"`)。若行指向本地裸文件(如 `./plugins/.../index.mjs`),DSH 发现不到包的 `dsh.client` 声明,设置页不会出现(搜索功能本身不受影响)。

## 注意事项

- 云端分支实现的是**旧版 Messages 搜索**(与官方 `deepseek-official` 相同);0.2.2 新增的 DeepSeek Search API(`deepseek-search-api`)是独立 provider,本插件不经过它。若想用新 API,可在「网页搜索与获取」页直接选它,本插件就不再参与。
- `ready()` 只做配置检查、不发网络请求:云端会话缺账号/Key 时 `web_search` 不会出现在该步的工具列表里;本地会话只要有合法的 SearXNG 地址就算就绪。
- 云端分支与官方 `deepseek-official` provider 共存:pin 固定到 `searxng` 时,每次搜索由本插件按会话模型内部路由,不会出现"多个可用 provider"的歧义错误。
- SearXNG 上游引擎的可用性取决于网络;走代理的国际引擎在代理不可用时只会单独失败,不影响直连引擎。

## 卸载

1. 从 profile `package.json` 删除依赖,`pnpm install`
2. 删除 `cordis.patch.yml` 中的 `insert` 条目,并把 `web` 行的 `searchProvider` 改回 `deepseek-official`(或整行删除恢复 bundle 默认)
