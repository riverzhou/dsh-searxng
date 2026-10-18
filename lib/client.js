window.__ModuleLoader__.load({
	id: "dsh-searxng",
	factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
	var __export = (target, all) => {
	  for (var name in all)
	    __defProp(target, name, { get: all[name], enumerable: true });
	};
	var __copyProps = (to, from, except, desc) => {
	  if (from && typeof from === "object" || typeof from === "function") {
	    for (let key of __getOwnPropNames(from))
	      if (!__hasOwnProp.call(to, key) && key !== except)
	        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
	  }
	  return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

	// src/client.jsx
	var client_exports = {};
	__export(client_exports, {
	  NS: () => NS,
	  apply: () => apply,
	  inject: () => inject
	});
	module.exports = __toCommonJS(client_exports);
	var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
	var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
	var import_jsx_runtime = require("react/jsx-runtime");
	var en = {
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
	  saving: "Saving\u2026",
	  saveFailed: "The deployment did not accept these values; they were left for you to correct."
	};
	var zh = {
	  title: "SearXNG \u641C\u7D22",
	  description: "\u672C\u5730\u6A21\u578B\u4F1A\u8BDD\u7684 web_search \u8D70\u81EA\u5EFA SearXNG \u5B9E\u4F8B\u3002",
	  baseURL: "SearXNG \u57FA\u7840\u5730\u5740",
	  baseURLHint: "\u672C\u5730\u5206\u652F\u67E5\u8BE2\u7684 SearXNG \u5B9E\u4F8B\u5730\u5740,\u4F8B\u5982 http://192.0.0.1:8888;\u7559\u7A7A\u6062\u590D\u9ED8\u8BA4\u3002",
	  localProviders: "\u672C\u5730\u6A21\u578B\u4F1A\u8BDD\u7684\u63D0\u4F9B\u65B9",
	  localProvidersHint: "\u9017\u53F7\u5206\u9694\u7684 LLM \u63D0\u4F9B\u65B9 id,\u540D\u5355\u5185\u4F1A\u8BDD\u8D70 SearXNG,\u5176\u4F59\u4F1A\u8BDD\u8D70 DeepSeek \u641C\u7D22,\u4F8B\u5982 omlx;\u7559\u7A7A\u6062\u590D\u9ED8\u8BA4\u3002",
	  overridden: "\u5DF2\u8986\u76D6",
	  reset: "\u6062\u590D\u9ED8\u8BA4",
	  readOnly: "\u672C\u90E8\u7F72\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
	  unavailable: "\u8BE5\u63D2\u4EF6\u5F53\u524D\u672A\u52A0\u8F7D,\u6682\u65F6\u65E0\u6CD5\u914D\u7F6E\u3002",
	  save: "\u4FDD\u5B58",
	  saving: "\u4FDD\u5B58\u4E2D\u2026",
	  saveFailed: "\u672C\u90E8\u7F72\u6CA1\u6709\u63A5\u53D7\u8FD9\u4E9B\u503C,\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002"
	};
	function formLabels(t) {
	  return {
	    unavailable: t("unavailable"),
	    readOnly: t("readOnly"),
	    saveFailed: t("saveFailed"),
	    save: t("save"),
	    saving: t("saving")
	  };
	}
	function localProvidersField(name) {
	  const base = (0, import_dsh_client_ui_primitives.settingsTextField)(name);
	  return {
	    ...base,
	    format: (value) => Array.isArray(value) ? value.join(", ") : "",
	    parse: (text) => {
	      const trimmed = text.trim();
	      if (trimmed === "") return { kind: "clear" };
	      const value = trimmed.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
	      return { kind: "set", value };
	    }
	  };
	}
	var SearxngCardController = class {
	  /** @param scope - the Host's `web-search-searxng` settings section. */
	  constructor(scope) {
	    __publicField(this, "form");
	    __publicField(this, "store");
	    __publicField(this, "unsubscribe");
	    this.form = new import_dsh_client_ui_primitives.SettingsFormModel(scope, [(0, import_dsh_client_ui_primitives.settingsTextField)("baseURL"), localProvidersField("localProviders")]);
	    this.store = (0, import_dsh_client_store.createSnapshotStore)(this.projection());
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
	};
	function SearxngCard(props) {
	  const { t } = props;
	  const state = props.useSearxngCard((snapshot) => snapshot);
	  if (props.view === "summary") return t("description");
	  const disabled = !state.writable || state.saving;
	  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.SettingsForm, { labels: formLabels(t), state, onSave: props.save, onDiscard: props.discard, children: [
	    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
	      import_dsh_client_ui_primitives.SettingsValueField,
	      {
	        id: "plugin-config-searxng-base-url",
	        label: t("baseURL"),
	        hint: t("baseURLHint"),
	        overriddenLabel: t("overridden"),
	        resetLabel: t("reset"),
	        invalidLabel: t("saveFailed"),
	        disabled,
	        ...state.baseURL,
	        onEdit: (text) => props.edit("baseURL", text),
	        onReset: () => props.resetField("baseURL")
	      }
	    ),
	    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
	      import_dsh_client_ui_primitives.SettingsValueField,
	      {
	        id: "plugin-config-searxng-local-providers",
	        label: t("localProviders"),
	        hint: t("localProvidersHint"),
	        overriddenLabel: t("overridden"),
	        resetLabel: t("reset"),
	        invalidLabel: t("saveFailed"),
	        disabled,
	        ...state.localProviders,
	        onEdit: (text) => props.edit("localProviders", text),
	        onReset: () => props.resetField("localProviders")
	      }
	    )
	  ] });
	}
	var NS = "settings.dshSearxng";
	var CONFIG_NS = "web-search-searxng";
	var inject = ["slots", "locale", "configForms"];
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

		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
