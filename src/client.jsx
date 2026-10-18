/**
 * Settings page (browser half) for the dsh-searxng search provider: the
 * SearXNG base URL and the session-provider list that routes to it. The page
 * registers into the Plugins page's `plugins.item` slot while the Host serves
 * the `web-search-searxng` settings namespace, so a deployment without the
 * plugin shows no trace of it.
 *
 * This file is the build source; the committed artifact is `lib/client.js`
 * (see package.json scripts.build).
 */
import { SettingsForm, SettingsValueField, SettingsFormModel, settingsTextField } from "@deepseek-ai/dsh-client-ui-primitives";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";

/** English copy. */
const en = {
  title: "SearXNG search",
  description: "Route web_search to the local SearXNG instance for local-model sessions.",
  baseURL: "SearXNG base URL",
  baseURLHint: "The SearXNG instance the local branch queries, for example http://192.0.0.1:8888. Leave blank to restore the default.",
  localProviders: "Local-model session providers",
  localProvidersHint: "Comma-separated LLM provider ids whose sessions search through SearXNG, for example omlx. Other sessions use DeepSeek search. Leave blank to restore the default.",
  overridden: "Overridden",
  reset: "Reset to default",
  readOnly: "This deployment stores settings read-only.",
  unavailable: "This plugin is not loaded, so it cannot be configured right now.",
  save: "Save",
  saving: "Saving…",
  saveFailed: "The deployment did not accept these values; they were left for you to correct."
};

/** Simplified Chinese copy. */
const zh = {
  title: "SearXNG 搜索",
  description: "本地模型会话的 web_search 走自建 SearXNG 实例。",
  baseURL: "SearXNG 基础地址",
  baseURLHint: "本地分支查询的 SearXNG 实例地址,例如 http://192.0.0.1:8888;留空恢复默认。",
  localProviders: "本地模型会话的提供方",
  localProvidersHint: "逗号分隔的 LLM 提供方 id,名单内会话走 SearXNG,其余会话走 DeepSeek 搜索,例如 omlx;留空恢复默认。",
  overridden: "已覆盖",
  reset: "恢复默认",
  readOnly: "本部署的设置为只读。",
  unavailable: "该插件当前未加载,暂时无法配置。",
  save: "保存",
  saving: "保存中…",
  saveFailed: "本部署没有接受这些值,已保留供你修改。"
};

/** The form frame's copy, read from this page's dictionary. */
function formLabels(t) {
  return {
    unavailable: t("unavailable"),
    readOnly: t("readOnly"),
    saveFailed: t("saveFailed"),
    save: t("save"),
    saving: t("saving")
  };
}

/**
 * A text field over a string-array setting: comma-separated names on the way
 * in, a clean array on the way out. Blank text clears the override so the
 * schema default applies again.
 */
function localProvidersField(name) {
  const base = settingsTextField(name);
  return {
    ...base,
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === "") return { kind: "clear" };
      const value = trimmed.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
      return { kind: "set", value };
    }
  };
}

/** Bridges the settings scope and the staged form onto the page. */
class SearxngCardController {
  form;
  store;
  unsubscribe;

  /** @param scope - the Host's `web-search-searxng` settings section. */
  constructor(scope) {
    this.form = new SettingsFormModel(scope, [settingsTextField("baseURL"), localProvidersField("localProviders")]);
    this.store = createSnapshotStore(this.projection());
    this.unsubscribe = this.form.bind(() => this.form.shell()).subscribe(() => {
      this.store.set(this.projection());
    });
  }

  projection() {
    return {
      ...this.form.shell(),
      baseURL: this.form.field("baseURL"),
      localProviders: this.form.field("localProviders")
    };
  }

  /** Build the face the page's slot registration injects. */
  inject() {
    return {
      hooks: { searxngCard: this.store },
      edit: (field, text) => this.form.actions().edit(field, text),
      resetField: (field) => this.form.actions().resetField(field),
      save: () => this.save(),
      discard: () => this.form.actions().discard()
    };
  }

  /** Save the staged values; a refused save keeps the draft for correction. */
  async save() {
    const shell = this.form.shell();
    if (!shell.available || shell.invalid || shell.saving) return;
    if (shell.dirty) await this.form.save();
  }

  /** Release form subscriptions. */
  dispose() {
    this.unsubscribe();
    this.form.dispose();
  }
}

/**
 * Render the SearXNG provider's one-liner or its settings form, as the
 * Plugins page asks.
 */
function SearxngCard(props) {
  const { t } = props;
  const state = props.useSearxngCard((snapshot) => snapshot);
  if (props.view === "summary") return t("description");
  const disabled = !state.writable || state.saving;
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsValueField
        id="plugin-config-searxng-base-url"
        label={t("baseURL")}
        hint={t("baseURLHint")}
        overriddenLabel={t("overridden")}
        resetLabel={t("reset")}
        invalidLabel={t("saveFailed")}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => props.edit("baseURL", text)}
        onReset={() => props.resetField("baseURL")}
      />
      <SettingsValueField
        id="plugin-config-searxng-local-providers"
        label={t("localProviders")}
        hint={t("localProvidersHint")}
        overriddenLabel={t("overridden")}
        resetLabel={t("reset")}
        invalidLabel={t("saveFailed")}
        disabled={disabled}
        {...state.localProviders}
        onEdit={(text) => props.edit("localProviders", text)}
        onReset={() => props.resetField("localProviders")}
      />
    </SettingsForm>
  );
}

/** Dictionary namespace owned by this plugin. */
const NS = "settings.dshSearxng";
/** Settings namespace this page edits: the profile entry id of the provider plugin. */
const CONFIG_NS = "web-search-searxng";
/** Required services (cordis fiber inject). */
const inject = ["slots", "locale", "configForms"];

/**
 * Mount the SearXNG settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
function apply(ctx) {
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-searxng: dictionaries");
  const card = new SearxngCardController(ctx.configForms.get(CONFIG_NS));
  ctx.effect(() => () => {
    card.dispose();
  }, "dsh-searxng: form subscription");
  ctx.effect(() => ctx.configForms.whileServed([CONFIG_NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
    name: "plugins.item",
    id: "dsh-searxng",
    order: 30,
    label: () => t("title"),
    locale: NS,
    inject: () => card.inject()
  }, SearxngCard))), "dsh-searxng: page");
}

export { NS, apply, inject };
