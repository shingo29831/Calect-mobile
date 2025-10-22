// src/data/persistence/monthShard.ts
import dayjs from '../../lib/dayjs';
import { readFile, writeFile } from '../../store/localFile';
import { ServerDocV2, V2Event, V2EventTagEntity } from './schemas';

// 保存ファイル名は従来と同じ（内容が v2 になる）
const monthPath = (yyyyMM: string) => `months/${yyyyMM}.json`;

// ------- ちいさなメモリキャッシュ（任意） -------
const monthCache = new Map<string, ServerDocV2>();
export function clearMonthCache() {
  monthCache.clear();
}

// ====== 公開：月束ロード / 事前確保 ======
export async function ensureMonths(months: string[]) {
  await Promise.all(months.map(loadMonth));
}

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
    // v1→v2 変換を許容
    const v2 = (obj?.version === 2) ? (obj as ServerDocV2) : migrateV1toV2(obj);
    monthCache.set(yyyyMM, v2);
    return v2;
  } catch {
    const empty = emptyMonthDoc();
    monthCache.set(yyyyMM, empty);
    return empty;
  }
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

// ====== ユーティリティ：月範囲（YYYY-MM 配列） ======
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

// ====== v2 イベントの UPSERT ======
// 期間オプションを受け取り、該当する複数月のシャードに分散保存します。
// 呼び出し元（db.ts）は upsertEventV2(e, { start_at_iso, end_at_iso }) で渡してきます。
type UpsertOpts = { start_at_iso?: string; end_at_iso?: string };

export async function upsertEventV2(e: V2Event, opts?: UpsertOpts) {
  // 書き込む月束を決定：期間があれば期間優先、無ければ updated_at の月
  const months =
    opts?.start_at_iso && opts?.end_at_iso
      ? monthSpan(opts.start_at_iso, opts.end_at_iso)
      : [dayjs(e.updated_at).format('YYYY-MM')];

  // 各月へ反映
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
