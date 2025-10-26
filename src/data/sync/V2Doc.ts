// // src/data/sync/V2Doc.ts
// import type { ServerDocV2 } from '../../api/types';

// /** -------------------------------------------------
//  * helpers
//  * ------------------------------------------------- */
// const isObj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
// const asRec = (x: any) => (isObj(x) ? (x as Record<string, any>) : {});
// const asArr = (x: any) => (Array.isArray(x) ? (x as any[]) : []);
// const nowIso = () => new Date().toISOString();

// /** Yes/No/Bool 混在 -> boolean へ */
// export function yn(v: any): boolean {
//   if (v === true || v === 'true' || v === 1 || v === '1' || v === 'yes') return true;
//   if (v === false || v === 'false' || v === 0 || v === '0' || v === 'no') return false;
//   return !!v;
// }

// /** v2 の profile 最低限の既定値（型を満たす） */
// function emptyProfile(): ServerDocV2['profile'] {
//   return {
//     current_user_id: '',
//     default_tz: 'UTC',
//     locale: 'en',
//     profile_image_path: null,
//     username: null,
//     username_url: null,
//     display_name: null,
//     email: null,
//     updated_at: nowIso(),
//   } as ServerDocV2['profile'];
// }

// /** v2 空ドキュメント（型適合のため unknown 経由でキャスト） */
// function emptyDoc(): ServerDocV2 {
//   const base = {
//     version: 2,
//     profile: emptyProfile(),
//     sync: { hashes: {} }, // ハッシュ鍵は環境により可変なので緩く受ける
//     tombstones: {
//       organizations: [] as string[],
//       follows: [] as string[],
//       groups: [] as string[],
//       org_relationships: [] as string[],
//       calendars: [] as string[],
//       events: [] as string[],
//       push_reminders: [] as string[],
//       event_tags: [] as string[],
//       subscriptions: [] as string[],
//       plans: [] as string[],
//       updated_at: nowIso(),
//     },
//     entities: {
//       organizations: {} as Record<string, any>,
//       follows: {} as Record<string, any>,
//       groups: {} as Record<string, any>,
//       org_relationships: [] as any[],
//       calendars: {} as Record<string, any>,
//       events: {} as Record<string, any>,
//       push_reminders: [] as any[],
//       event_tags: {} as Record<string, any>,
//       plans: {} as Record<string, any>,
//       subscriptions: {} as Record<string, any>,
//     },
//   };
//   return base as unknown as ServerDocV2;
// }

// /** -------------------------------------------------
//  *  shape normalizers (mutate)
//  * ------------------------------------------------- */
// function normalizeProfile(doc: ServerDocV2) {
//   const pIn = asRec((doc as any).profile);
//   (doc as any).profile = {
//     ...emptyProfile(),
//     ...pIn,
//     updated_at: typeof pIn.updated_at === 'string' ? pIn.updated_at : nowIso(),
//   };
// }

// function normalizeSync(doc: ServerDocV2) {
//   const syncIn = asRec((doc as any).sync);
//   const hashes = asRec(syncIn.hashes);
//   (doc as any).sync = { hashes } as any;
// }

// function normalizeTombstones(doc: ServerDocV2) {
//   const ts = asRec((doc as any).tombstones);
//   (doc as any).tombstones = {
//     organizations: asArr(ts.organizations),
//     follows: asArr(ts.follows),
//     groups: asArr(ts.groups),
//     org_relationships: asArr(ts.org_relationships),
//     calendars: asArr(ts.calendars),
//     events: asArr(ts.events),
//     push_reminders: asArr(ts.push_reminders),
//     event_tags: asArr(ts.event_tags),
//     subscriptions: asArr(ts.subscriptions),
//     plans: asArr(ts.plans),
//     updated_at: typeof ts.updated_at === 'string' ? ts.updated_at : nowIso(),
//   };
// }

// function arrayToRecord<T extends Record<string, any>>(arr: any, idKey: string) {
//   const out: Record<string, T> = {};
//   for (const item of asArr(arr)) {
//     const id = item?.[idKey];
//     if (!id) continue;
//     out[String(id)] = item as T;
//   }
//   return out;
// }

// function normalizeEntities(doc: ServerDocV2) {
//   const ent = asRec((doc as any).entities);

//   const organizations = isObj(ent.organizations) ? ent.organizations : arrayToRecord(ent.organizations, 'org_id');
//   const follows       = isObj(ent.follows)       ? ent.follows       : arrayToRecord(ent.follows, 'user_id');
//   const calendars     = isObj(ent.calendars)     ? ent.calendars     : arrayToRecord(ent.calendars, 'calendar_id');
//   const event_tags    = isObj(ent.event_tags)    ? ent.event_tags    : arrayToRecord(ent.event_tags, 'tag_id');
//   const plans         = isObj(ent.plans)         ? ent.plans         : arrayToRecord(ent.plans, 'plan_code');
//   const subscriptions = isObj(ent.subscriptions) ? ent.subscriptions : arrayToRecord(ent.subscriptions, 'sub_id');

//   const groups = isObj(ent.groups) ? ent.groups : arrayToRecord(ent.groups, 'group_id');
//   for (const g of Object.values(groups as Record<string, any>)) {
//     const members = isObj(g.members) ? g.members : arrayToRecord(g.members, 'user_id');
//     for (const m of Object.values(members)) {
//       (m as any).can_share  = yn((m as any).can_share);
//       (m as any).can_invite = yn((m as any).can_invite);
//     }
//     g.members = members;
//   }

//   const org_relationships = asArr(ent.org_relationships).map((r: any) => ({
//     ...r,
//     can_share: yn(r?.can_share),
//     can_invite: yn(r?.can_invite),
//   }));

//   // events
//   let events: Record<string, any>;
//   if (isObj(ent.events)) {
//     events = ent.events;
//   } else if (Array.isArray(ent.events)) {
//     events = arrayToRecord(ent.events, 'event_id');
//     for (const e of ent.events) {
//       if (!e?.event_id && e?.id) {
//         const id = String(e.id);
//         events[id] = { ...(e || {}), event_id: id };
//       }
//     }
//   } else {
//     events = {};
//   }
//   for (const e of Object.values(events)) {
//     (e as any).followers_share = yn((e as any).followers_share);
//     const ovs = asArr((e as any).overrides);
//     for (const o of ovs) if ('cancelled' in (o || {})) (o as any).cancelled = yn((o as any).cancelled);
//     (e as any).overrides = ovs;

//     let tags = (e as any).tags;
//     if (Array.isArray(tags) && typeof tags[0] === 'string') {
//       tags = (tags as string[]).map((t) => ({ tag_id: String(t) }));
//     } else if (!Array.isArray(tags)) {
//       tags = [];
//     }
//     (e as any).tags = tags;

//     if (!Array.isArray((e as any).calendar_links)) (e as any).calendar_links = [];
//   }

//   (doc as any).entities = {
//     organizations,
//     follows,
//     groups,
//     org_relationships,
//     calendars,
//     events,
//     push_reminders: asArr(ent.push_reminders),
//     event_tags,
//     plans,
//     subscriptions,
//   };
// }

// /** -------------------------------------------------
//  * public API
//  * ------------------------------------------------- */
// export function isLikelyServerDocV2(x: any): x is ServerDocV2 {
//   return !!x && x.version === 2;
// }

// /** 追加の boolean 正規化（冪等） */
// export function normalizeServerDocBooleans(doc: ServerDocV2): ServerDocV2 {
//   try {
//     const groups = (doc.entities?.groups ?? {}) as Record<string, any>;
//     for (const g of Object.values(groups)) {
//       for (const m of Object.values(g.members ?? {})) {
//         (m as any).can_share  = yn((m as any).can_share);
//         (m as any).can_invite = yn((m as any).can_invite);
//       }
//     }
//     const rels = asArr((doc.entities as any)?.org_relationships);
//     for (const r of rels) {
//       (r as any).can_share  = yn((r as any).can_share);
//       (r as any).can_invite = yn((r as any).can_invite);
//     }
//     const events = (doc.entities?.events ?? {}) as Record<string, any>;
//     for (const e of Object.values(events)) {
//       (e as any).followers_share = yn((e as any).followers_share);
//       asArr((e as any).overrides).forEach((o) => {
//         if ('cancelled' in (o || {})) (o as any).cancelled = yn((o as any).cancelled);
//       });
//     }
//   } catch { /* noop */ }
//   return doc;
// }

// /** v2 として読み込み、欠損を補完して最小正規化して返す */
// export function parseServerDocV2(input: unknown): ServerDocV2 {
//   if (!isLikelyServerDocV2(input)) {
//     throw new Error('Invalid server document (expected version 2)');
//   }
//   const doc = emptyDoc();
//   (doc as any).profile    = isObj((input as any).profile)    ? (input as any).profile    : emptyProfile();
//   (doc as any).sync       = isObj((input as any).sync)       ? (input as any).sync       : { hashes: {} };
//   (doc as any).tombstones = isObj((input as any).tombstones) ? (input as any).tombstones : {};
//   (doc as any).entities   = isObj((input as any).entities)   ? (input as any).entities   : {};

//   normalizeProfile(doc);
//   normalizeSync(doc);
//   normalizeTombstones(doc);
//   normalizeEntities(doc);

//   return normalizeServerDocBooleans(doc);
// }
