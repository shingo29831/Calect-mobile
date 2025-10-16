import RNFS from "react-native-fs";
import { getAllInstances, replaceAllInstances } from "../../store/db";
import { monthKeyFromISO, getMonthInstances, upsertMonthInstances } from "./monthShard";
import { SNAPSHOT_PATH, MONTHS_DIR, OPS_LOG_PATH } from "./filePaths"; // ある場合

/**
 * cid で保存されている event_id を正規 ID に置換する。
 * - メモリ（instances）
 * - スナップショット（snapshot.json）
 * - 月ファイル（/calect/months/YYYY-MM.json）
 * - ops.ndjson（必要なら：軽微な影響なのでスキップ可。ここではスキップ）
 */
export async function applyEventIdMapping(cid: string, real: string) {
  // 1) メモリ：instances
  const mem = getAllInstances();
  let touched = false;
  for (const it of mem) {
    if (it.event_id === cid) {
      it.event_id = real;
      it.occurrence_key = `${real}@@${it.start_at}`;
      touched = true;
    }
  }
  if (touched) replaceAllInstances(mem);

  // 2) スナップショット（存在すれば）
  try {
    if (await RNFS.exists(SNAPSHOT_PATH)) {
      const txt = await RNFS.readFile(SNAPSHOT_PATH, "utf8");
      const json = JSON.parse(txt);
      if (Array.isArray(json.instances)) {
        let changed = false;
        for (const it of json.instances) {
          if (it.event_id === cid) {
            it.event_id = real;
            it.occurrence_key = `${real}@@${it.start_at}`;
            changed = true;
          }
        }
        if (changed) await RNFS.writeFile(SNAPSHOT_PATH, JSON.stringify(json), "utf8");
      }
    }
  } catch {}

  // 3) 月ファイル（開始日の YYYY-MM だけでなく、終日跨ぎなどに備え全月チェック）
  //    実運用では対象月を限定してOK。ここでは安全側で開始月のみ更新。
  const targetMonths = new Set<string>();
  for (const it of mem) if (it.event_id === real) targetMonths.add(monthKeyFromISO(it.start_at));
  for (const ym of targetMonths) {
    try {
      const arr = await getMonthInstances(ym);
      let changed = false;
      for (const it of arr) {
        if (it.event_id === cid) {
          it.event_id = real;
          it.occurrence_key = `${real}@@${it.start_at}`;
          changed = true;
        }
      }
      if (changed) await upsertMonthInstances(ym, arr);
    } catch {}
  }

  // 4) ops.ndjson の書き換えは基本不要（履歴）。必要なら rename-op を別途積む運用でOK。
}
