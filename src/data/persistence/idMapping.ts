// src/data/persistence/idMapping.ts
// cid（仮ID）→ 正規 event_id の置換ユーティリティ（v2対応）
//
// - メモリDB（getAllInstances / replaceAllInstances）を書き換え
// - スナップショット（snapshot.json）があれば更新
// - 月シャード（/months/YYYY-MM.json）は v2 形式の辞書を ID リネームで更新
//
// ※ 旧 v1 の getMonthInstances / upsertMonthInstances は廃止し、
//    v2 の replaceEventIdInMonth（月単位の ID 置換）を使用します。

import RNFS from "react-native-fs";
import { getAllInstances, replaceAllInstances } from "../../store/db";
import {
  monthKeyFromISO,
  replaceEventIdInMonth,
  replaceEventIdInMonthsByRange,
} from "./monthShard";
import { SNAPSHOT_PATH } from "./filePaths";

/**
 * cid で保存されている event_id を正規 ID に置換する（最小トランザクション版）。
 * - メモリ（instances）
 * - スナップショット（snapshot.json）
 * - 月ファイル（/months/YYYY-MM.json）…実際に該当インスタンスがある月を対象
 */
export async function applyEventIdMapping(cid: string, real: string) {
  if (!cid || !real || cid === real) return;

  // ===== 1) メモリ：instances =====
  const mem = getAllInstances();
  let touched = false;

  // v2 でも occurrence_key は "event_id@@start_at" の慣習で利用しているため更新
  // 置換対象の月キーを先に集める（cid/real の両方を拾う）
  const targetMonths = new Set<string>();
  for (const it of mem) {
    if (it.event_id === cid || it.event_id === real) {
      targetMonths.add(monthKeyFromISO(it.start_at));
    }
  }

  for (const it of mem) {
    if (it.event_id === cid) {
      it.event_id = real;
      it.occurrence_key = `${real}@@${it.start_at}`;
      touched = true;
    }
  }
  if (touched) {
    replaceAllInstances(mem);
  }

  // ===== 2) スナップショット（存在すれば）=====
  try {
    if (await RNFS.exists(SNAPSHOT_PATH)) {
      const txt = await RNFS.readFile(SNAPSHOT_PATH, "utf8");
      const json = JSON.parse(txt);
      if (Array.isArray(json.instances)) {
        let changed = false;
        for (const it of json.instances) {
          if (it?.event_id === cid) {
            it.event_id = real;
            if (it?.start_at) it.occurrence_key = `${real}@@${it.start_at}`;
            changed = true;
          }
          // 置換月の抽出（スナップショット起点でも拾う）
          if (it?.event_id === real && it?.start_at) {
            targetMonths.add(monthKeyFromISO(it.start_at));
          }
        }
        if (changed) {
          await RNFS.writeFile(SNAPSHOT_PATH, JSON.stringify(json), "utf8");
        }
      }
    }
  } catch {
    // スナップショットは必須ではないので握りつぶし
  }

  // ===== 3) 月ファイル（v2: ドキュメント辞書のキー置換）=====
  // メモリとスナップショットから収集した「実際に関係がある月」に限定して高速化
  for (const ym of targetMonths) {
    try {
      await replaceEventIdInMonth(ym, cid, real);
    } catch {
      // 月ファイルが未生成等は無視（存在する月だけ更新できればOK）
    }
  }

  // ===== 4) 代表期間が分かっている場合の一括置換 API も提供（任意）=====
  // - 代表 start/end（オフライン作成時の単一日でもOK）が取れるならこちらの方が網羅的
  // - 呼び出し元で使いたい場合に備えてエクスポート
}

/**
 * 代表期間が分かっている場合に、期間に含まれるすべての月へ一括置換を行う版。
 * - startIso/endIso はおおよそでOK（オフライン作成日の月だけでも可）
 * - メモリとスナップショットも更新する点は `applyEventIdMapping` と同様
 */
export async function applyEventIdMappingByRange(
  startIso: string,
  endIso: string,
  cid: string,
  real: string
) {
  if (!cid || !real || cid === real) return;

  // 1) メモリ更新
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

  // 2) スナップショット更新
  try {
    if (await RNFS.exists(SNAPSHOT_PATH)) {
      const txt = await RNFS.readFile(SNAPSHOT_PATH, "utf8");
      const json = JSON.parse(txt);
      if (Array.isArray(json.instances)) {
        let changed = false;
        for (const it of json.instances) {
          if (it?.event_id === cid) {
            it.event_id = real;
            if (it?.start_at) it.occurrence_key = `${real}@@${it.start_at}`;
            changed = true;
          }
        }
        if (changed) await RNFS.writeFile(SNAPSHOT_PATH, JSON.stringify(json), "utf8");
      }
    }
  } catch {}

  // 3) 月ファイル一括（v2 ドキュメントに対するキー置換）
  try {
    await replaceEventIdInMonthsByRange(startIso, endIso, cid, real);
  } catch {
    // 一部月で失敗しても致命ではない（次回同期や再度のマッピングで回復可能）
  }
}
