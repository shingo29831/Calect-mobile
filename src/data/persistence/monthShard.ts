// src/data/persistence/monthShard.ts
import dayjs from '../../lib/dayjs';
import { readFile, writeFile } from '../../store/localFile';
import { ServerDocV2, V2Event, V2EventTagEntity } from './schemas';

/* ============================== パス/キャッシュ ============================== */
// 保存ファイル名は従来と同じ（内容は v2 ）
const monthPath = (yyyyMM: string) => `months/${yyyyMM}.json`;

// ちいさなメモリキャッシュ（任意）
const monthCache = new Map<string, ServerDocV2>();
export function clearMonthCache() {
  monthCache.clear();
}

/* ============================== ユーティリティ ============================== */

/** ISO日時から YYYY-MM を返す（互換ユーティリティ） */
export function monthKeyFromISO(iso: string): string {
  return dayjs(iso).format('YYYY-MM');
}

/** 月範囲（YYYY-MM 配列）を生成 */
function monthSpan(startIso: string, endIso: string): string[] {
  let s = dayjs(startIso);
  let e = dayjs(endIso);
  if (!s.isValid()) s = dayjs();
  if (!e.isValid()) e = s;
  if (e.isBefore(s)) e = s;

  const out: string[] = [];
  let cur = s.startOf('month');
  const last = e.startOf('month');
  while (cur.isBefore(last) || cur.isSame(last)) {
    out.push(cur.format('YYYY-MM'));
    cur = cur.add(1, 'month');
  }
  return out;
}

function emptyMonthDoc(): ServerDocV2 {
  return { version: 2, entities: { events: {}, event_tags: {} } } as ServerDocV2;
}

function migrateV1toV2(v1: any): ServerDocV2 {
  const events: Record<string, V2Event> = {};
  const event_tags: Record<string, V2EventTagEntity> = {};

  // 典型：{ events: [{ id/title/start_at/end_at/color/style:{tags:[]} ... }] }
  const list = Array.isArray(v1?.events) ? v1.events : [];
  for (const ev of list) {
    const id = ev.event_id || ev.id;
    if (!id) continue;
    const tags = (ev?.style?.tags ?? ev?.tags ?? []).map((t: string) => ({ tag_id: String(t) }));
    const nowIso = dayjs().toISOString();

    events[id] = {
      event_id: id,
      title: ev.title ?? '',
      summary: ev.summary ?? ev.memo ?? '',
      color: ev.color ?? null,
      updated_at: ev.updated_at ?? nowIso,
      calendar_links: ev.calendar_id
        ? [
            {
              link_id: ev.link_id ?? id,
              calendar_id: ev.calendar_id,
              content_visibility: 'full',
              created_by: ev.created_by ?? 'me',
              updated_at: ev.updated_at ?? nowIso,
              deleted_at: null,
            },
          ]
        : [],
      event_shares: [],
      followers_share: false,
      priority: 'normal',
      overrides: [],
      tags,
    };

    for (const t of tags) {
      if (!event_tags[t.tag_id]) {
        event_tags[t.tag_id] = { tag_id: t.tag_id, name: t.tag_id, updated_at: nowIso };
      }
    }
  }
  return { version: 2, entities: { events, event_tags } };
}

async function writeMonth(yyyyMM: string, doc: ServerDocV2) {
  const path = monthPath(yyyyMM);
  await writeFile(path, JSON.stringify(doc));
  monthCache.set(yyyyMM, doc);
}

/* ============================== 読み込み関連 ============================== */

/** 月束を事前ロード（存在しなければ空ドキュメントをキャッシュ） */
export async function ensureMonths(months: string[]) {
  await Promise.all(months.map(loadMonth));
}

/** 単一月をロード（v1→v2 マイグレーション許容、キャッシュあり） */
export async function loadMonth(yyyyMM: string): Promise<ServerDocV2> {
  // キャッシュ
  const hit = monthCache.get(yyyyMM);
  if (hit) return hit;

  const path = monthPath(yyyyMM);
  const raw = await readFile(path).catch(() => null);
  if (!raw) {
    const empty = emptyMonthDoc();
    monthCache.set(yyyyMM, empty);
    return empty;
  }
  try {
    const obj = JSON.parse(raw);
    const v2 = (obj?.version === 2) ? (obj as ServerDocV2) : migrateV1toV2(obj);
    monthCache.set(yyyyMM, v2);
    return v2;
  } catch {
    const empty = emptyMonthDoc();
    monthCache.set(yyyyMM, empty);
    return empty;
  }
}

/* ============================== 書き込み（v2） ============================== */

type UpsertOpts = { start_at_iso?: string; end_at_iso?: string };

/**
 * v2 イベントの UPSERT。
 * - 期間オプションがあれば、その範囲に含まれるすべての月へ分散保存
 * - 無ければ `updated_at` の月へ保存
 */
export async function upsertEventV2(e: V2Event, opts?: UpsertOpts) {
  const months =
    opts?.start_at_iso && opts?.end_at_iso
      ? monthSpan(opts.start_at_iso, opts.end_at_iso)
      : [dayjs(e.updated_at).format('YYYY-MM')];

  await Promise.all(
    months.map(async (m) => {
      const doc = await loadMonth(m);
      if (!doc.entities) doc.entities = {};
      if (!doc.entities.events) doc.entities.events = {};
      if (!doc.entities.event_tags) doc.entities.event_tags = {};

      // イベント本体 upsert
      doc.entities.events[e.event_id] = e;

      // タグ辞書補完
      if (e.tags?.length) {
        for (const t of e.tags) {
          if (!doc.entities.event_tags[t.tag_id]) {
            doc.entities.event_tags[t.tag_id] = {
              tag_id: t.tag_id,
              name: t.tag_id,
              updated_at: e.updated_at,
            };
          }
        }
      }

      await writeMonth(m, doc);
    })
  );
}

/* ====================== ID置換（cid → 正規 event_id） ====================== */

/**
 * 1ヶ月ファイル内で、イベントキー `cid` を `real` にリネームする。
 * - 既に `real` が存在する場合は、基本「上書き優先（real側を勝ち）」にする。
 * - タグ辞書は event_id に依存していないため、そのまま。
 */
export async function replaceEventIdInMonth(yyyyMM: string, cid: string, real: string): Promise<boolean> {
  const doc = await loadMonth(yyyyMM);
  if (!doc.entities?.events) return false;

  const hasCid = !!doc.entities.events[cid];
  if (!hasCid) return false;

  const src = doc.entities.events[cid];
  const dst = doc.entities.events[real];

  // real が未登録ならキー差し替え、登録済みなら「real を優先」し、必要最低限の併合
  if (!dst) {
    // キーを切り替える（新しいキーに移す → 旧キー削除）
    const moved: V2Event = { ...src, event_id: real, updated_at: dayjs().toISOString() };
    delete doc.entities.events[cid];
    doc.entities.events[real] = moved;
  } else {
    // 併合（title/summary などは既存 real を優先）
    const merged: V2Event = {
      ...src,
      ...dst,
      event_id: real,
      updated_at: dayjs().toISOString(),
      // タグは重複排除で併合
      tags: (() => {
        const a = src.tags ?? [];
        const b = dst.tags ?? [];
        const map = new Map<string, { tag_id: string }>();
        for (const t of a) map.set(t.tag_id, t);
        for (const t of b) map.set(t.tag_id, t);
        return Array.from(map.values());
      })(),
      // calendar_links も重複を避けて併合
      calendar_links: (() => {
        const a = src.calendar_links ?? [];
        const b = dst.calendar_links ?? [];
        const map = new Map<string, NonNullable<V2Event['calendar_links']>[number]>();
        for (const l of a) map.set(`${l.calendar_id}::${l.link_id}`, l);
        for (const l of b) map.set(`${l.calendar_id}::${l.link_id}`, l);
        return Array.from(map.values());
      })(),
    };
    delete doc.entities.events[cid];
    doc.entities.events[real] = merged;
  }

  await writeMonth(yyyyMM, doc);
  return true;
}

/**
 * 期間に含まれるすべての月（YYYY-MM）に対して、`cid → real` の置換を実施。
 * - start/end はオフライン作成時の “代表的な開始/終了” を渡せばOK（厳密でなくてよい）
 */
export async function replaceEventIdInMonthsByRange(
  startIso: string,
  endIso: string,
  cid: string,
  real: string
): Promise<{ months: string[]; changed: string[] }> {
  const months = monthSpan(startIso, endIso);
  const changed: string[] = [];
  for (const ym of months) {
    const ok = await replaceEventIdInMonth(ym, cid, real).catch(() => false);
    if (ok) changed.push(ym);
  }
  return { months, changed };
}

/* ======================= キャッシュ温め（前月・当月・来月） ======================= */

/** YYYY-MM を基準に、前後 span ヶ月ぶんの配列を返す（デフォルト: 前月・当月・来月） */
export function monthNeighbors(baseYYYYMM: string, span = 1): string[] {
  const base = dayjs(`${baseYYYYMM}-01`);
  const out: string[] = [];
  for (let d = -span; d <= span; d++) {
    out.push(base.add(d, 'month').format('YYYY-MM'));
  }
  return out;
}

/** ISO日時を基準に、前月・当月・来月の3ヶ月をキャッシュへロード */
export async function ensurePrevCurrNextByISO(centerIso?: string) {
  const ym = dayjs(centerIso ?? dayjs().toISOString()).format('YYYY-MM');
  await ensureMonths(monthNeighbors(ym, 1));
}

/** YYYY-MM を基準に、前月・当月・来月の3ヶ月をキャッシュへロード */
export async function ensurePrevCurrNextByYYYYMM(yyyyMM: string) {
  await ensureMonths(monthNeighbors(yyyyMM, 1));
}
