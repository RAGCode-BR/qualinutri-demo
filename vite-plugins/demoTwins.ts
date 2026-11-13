import { existsSync } from "node:fs";
import type { Plugin } from "vite";
import { resolveTwin } from "../src/demo/twins/resolveTwin";

/** Troca serviços e autenticação pelos gêmeos simulados da demonstração. */
export function demoTwins(): Plugin {
  let root = process.cwd();
  return {
    name: "qualinutri-demo-twins",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith("\0")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      return resolveTwin(resolved.id, importer, root, existsSync);
    },
  };
}
