# dsh-searxng

DeepSeek Harness 插件:让 `web_search` 工具改用**自建的 SearXNG 实例**(JSON API)作为搜索后端,替代默认的 DeepSeek 远程搜索。

A DSH plugin that registers a local [SearXNG](https://github.com/searxng/searxng) instance as the search provider for the `web_search` tool (the `ctx.web` capability seam), replacing the default remote DeepSeek search.

```
DSH web_search ─▶ ctx.web (searchProvider: searxng)
                 ─▶ dsh-searxng provider
                 ─▶ SearXNG  GET /search?q=…&format=json
                 ─▶ 上游引擎(直连 / 代理)
```

## SearXNG 侧要求

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

## 安装(Windows DSH profile)

1. 编辑 profile 的 `package.json`(例如 `%USERPROFILE%\.dsh\profiles\desktop\package.json`),在 `dependencies` 加入:

   ```json
   {
     "dependencies": {
       "dsh-searxng": "git+https://github.com/riverzhou/dsh-searxng.git#master"
     }
   }
   ```

   (本地安装也可以把 `#` 后的 `git+https://...` 换成相对路径,如 `../dsh-searxng`)

2. 在 profile 目录执行 `pnpm install`(DSH profile 自带 `pnpm-workspace.yaml`)。

3. 编辑 profile 的 `cordis.patch.yml`(bundle 之后应用的补丁层),追加:

   ```yaml
   # 加载插件(新条目必须放在 insert 下),并把 web 服务的搜索提供方固定为 searxng。
   # 注意:patch 是整行替换 config,`web` 行必须把 searchProvider/fetchProvider 都重述。
   - insert:
       - id: web-search-searxng
         name: "dsh-searxng"
         config:
           baseURL: http://192.168.3.198:8888   # SearXNG 所在机器的局域网地址

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
| `baseURL` | `http://127.0.0.1:8888` | SearXNG 实例地址,不需要尾部 `/` |

环境变量 `DSH_SEARXNG_BASE_URL` 可覆盖 `baseURL` 的默认值(config 中显式设置时以 config 为准)。

## 注意事项

- 不要在 DSH 的「插件 → 内置插件设置 → 网页搜索」页面里切换「启用新版 Web 搜索 API」开关,那会把 `searchProvider` 改回 DeepSeek,覆盖本插件的选择。
- SearXNG 上游引擎的可用性取决于网络;走代理的国际引擎在代理不可用时只会单独失败,不影响直连引擎。

## 卸载

1. 从 profile `package.json` 删除依赖,`pnpm install`
2. 删除 `cordis.patch.yml` 中的 `insert` 条目,并把 `web` 行的 `searchProvider` 改回 `deepseek-official`(或整行删除恢复 bundle 默认)
