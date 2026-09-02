// A essentia.js carrega o .wasm por URL em runtime, entao o binario precisa
// estar em public/. Copiar no pre-build evita versionar 2 MB vindos do
// node_modules e mantem o arquivo sempre igual ao da lib instalada.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const origem = join(raiz, "node_modules/essentia.js/dist/essentia-wasm.web.wasm");
const destino = join(raiz, "public/essentia/essentia-wasm.web.wasm");

if (!existsSync(origem)) {
  console.warn("essentia.js nao encontrada em node_modules; rode npm install");
  process.exit(0);
}

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log("essentia-wasm.web.wasm copiado para public/essentia/");
