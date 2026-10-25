import type { Calc } from "./frame/calc";
import type { AppState } from "./frame/model";

/** Результат расчёта из потока: раскладка по листам, детали для DXF и закуп. */
export type Layout = Pick<Calc, "solids" | "rows" | "nests" | "purchase">;

export class Cancelled extends Error {
  constructor() {
    super("Расчёт отменён");
  }
}

/** Считает раскладку в Web Worker. cancel() останавливает поток сразу, promise отклоняется с Cancelled. */
export function computeLayout(state: AppState) {
  const worker = new Worker(new URL("./layout.worker.ts", import.meta.url));
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<Layout>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<{ ok: true; layout: Layout } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) res(e.data.layout);
      else rej(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      rej(new Error(e.message || "Ошибка расчёта раскладки"));
    };
    worker.postMessage(state);
  });
  const cancel = () => {
    worker.terminate();
    reject(new Cancelled());
  };
  return { promise, cancel };
}
