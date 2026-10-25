// Полный расчёт дивана (раскладка по контурам) — в отдельном потоке: страница не замирает, а отмена — terminate().

import { calculate } from "./frame/calc";
import type { AppState } from "./frame/model";

self.onmessage = (e: MessageEvent<AppState>) => {
  try {
    const c = calculate(e.data);
    // Назад уходит только то, что нужно странице: раскладка, детали для DXF и закуп.
    self.postMessage({ ok: true, layout: { solids: c.solids, rows: c.rows, nests: c.nests, purchase: c.purchase } });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
