/**
 * App bootstrap entry
 * - ローカルスナップショット読込
 * - 増分同期の起動
 * - 表示層（月シャード）を最新化
 */
import { loadLocalStore, compactStorage } from "../../data/persistence/localStore";
import { ensureMonths } from "../../data/persistence/monthShard"; // ← 位置が違う場合は調整
import { replaceAllInstances } from "../../store/db";
import { runIncrementalSync, exampleFetchServerDiff } from "../../data/sync/runIncrementalSync";
import type { FetchServerDiff, ServerDiffResponse } from "../../data/sync/runIncrementalSync";

/* ===== ユーティリティ ===== */
function ym(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${m.toString().padStart(2, "0")}`;
}
function addMonths(base: Date, diff: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + diff);
  return d;
}

export async function bootstrapApp() {
  /* --- A-1: ops.ndjson を月別ストレージへ反映（圧縮） --- */
  try {
    await compactStorage();
  } catch (e) {
    console.warn("compactStorage failed (continue anyway):", e);
  }

  /* --- A-2: 前月・当月・翌月の月シャードを確保（表示の土台） --- */
  try {
    const now = new Date();
    const months = [ym(addMonths(now, -1)), ym(now), ym(addMonths(now, 1))];
    await ensureMonths(months);
  } catch (e) {
    console.warn("ensureMonths failed (continue anyway):", e);
  }

  /* --- ローカルスナップショット反映（初期表示を即復元） --- */
  try {
    const snapshot = await loadLocalStore();
    if (snapshot?.instances?.length) {
      await replaceAllInstances(snapshot.instances);
    }
  } catch (e) {
    console.warn("loadLocalStore failed (continue without local snapshot):", e);
  }

  /* --- サーバ増分同期（オンラインなら最新化） --- */
  try {
    await runIncrementalSync(exampleFetchServerDiff);
  } catch (e) {
    console.warn("runIncrementalSync failed (will continue offline):", e);
  }
}

export default bootstrapApp;
