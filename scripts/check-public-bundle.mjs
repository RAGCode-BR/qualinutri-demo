import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const assets = join(process.cwd(), "dist", "assets");
const scripts = readdirSync(assets).filter((name) => name.endsWith(".js"));
const bundle = scripts.map((name) => readFileSync(join(assets, name), "utf8")).join("\n");
const commercialCanaries = [
  "Quali Engorda 160 RM",
  "Regras comerciais das vendas diretas da fábrica Qualinutri",
  "Brasnorte até 35 km",
];
const leaked = commercialCanaries.filter((value) => bundle.includes(value));
if (leaked.length > 0) {
  throw new Error(`Dados comerciais presentes no bundle público: ${leaked.join(", ")}`);
}
console.log("Bundle público sem o catálogo comercial de referência.");
