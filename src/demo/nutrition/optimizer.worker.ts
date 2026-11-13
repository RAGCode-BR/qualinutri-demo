import { optimizeDiet } from "./calculations";

self.onmessage = (event) => {
  try {
    self.postMessage({ result: optimizeDiet(event.data.recipe, event.data.feeds) });
  } catch (reason) {
    self.postMessage({ error: reason instanceof Error ? reason.message : "Não foi possível otimizar a fórmula." });
  }
};
