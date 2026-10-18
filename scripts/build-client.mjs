/**
 * Build the browser half (src/client.jsx) into lib/client.js in the DSH
 * client module format: a CommonJS body handed to the page's module loader as
 * a factory, with every cross-package import left as an external require that
 * the loader resolves against the seeded client packages.
 *
 * Usage: npm run build   (from the package root)
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const entry = join(root, "src", "client.jsx");
const out = join(root, "lib", "client.js");
const pkg = JSON.parse((await import("node:fs")).readFileSync(join(root, "package.json"), "utf8"));

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  write: false,
  external: [
    "react",
    "react/jsx-runtime",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-store"
  ]
});

const body = result.outputFiles[0].text;
// The factory body is not a Node CJS file: the loader hands it `require` only,
// so `module`/`exports` must be declared inside, like the bundled reference
// pages do.
const inner = ["var module = { exports: {} };", "var exports = module.exports;", body]
  .flat()
  .join("\n")
  .split("\n")
  .map((line) => (line.length > 0 ? "\t" + line : line))
  .join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `window.__ModuleLoader__.load({
	id: "${pkg.name}",
	factory: (require) => {
${inner}
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
`
);
console.log(`lib/client.js written (${inner.length} bytes of inner body)`);
