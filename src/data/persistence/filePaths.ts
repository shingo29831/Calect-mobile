// src/store/filePaths.ts
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// 繝ｫ繝ｼ繝医ョ繧｣繝ｬ繧ｯ繝医Μ・医い繝励Μ蟆ら畑縺ｮ繝峨く繝･繝｡繝ｳ繝磯伜沺・・
export const ROOT_DIR =
  Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/calect`
    : `${RNFS.DocumentDirectoryPath}/calect`;

export const SNAPSHOT_PATH = `${ROOT_DIR}/snapshot.json`; // 莠呈鋤: 繝輔Ν繧ｹ繝翫ャ繝励す繝ｧ繝・ヨ
export const OPS_LOG_PATH  = `${ROOT_DIR}/ops.ndjson`;     // 蟾ｮ蛻・ｼ夊ｿｽ險倥Ο繧ｰ・・DJSON・・
export const MONTHS_DIR    = `${ROOT_DIR}/months`;         // 譛医＃縺ｨ蛻・牡

export const TMP_DIR       = `${ROOT_DIR}/_tmp`;

export async function ensureDirs() {
  for (const p of [ROOT_DIR, MONTHS_DIR, TMP_DIR]) {
    const exists = await RNFS.exists(p);
    if (!exists) await RNFS.mkdir(p);
  }
}

// YYYY-MM 繧偵ヵ繧｡繧､繝ｫ縺ｫ
export function monthFile(yyyyMM: string) {
  return `${MONTHS_DIR}/${yyyyMM}.json`;
}

// 荳譎ゅヵ繧｡繧､繝ｫ・亥次蟄千噪荳頑嶌縺咲畑・・
export function tmpFile(name: string) {
  return `${TMP_DIR}/${name}.${Date.now()}.tmp`;
}

// 螳牙・縺ｪ譖ｸ縺肴鋤縺茨ｼ・emp 竊・move・・
export async function atomicWrite(path: string, data: string) {
  const t = tmpFile(path.split('/').pop() || 'file');
  await RNFS.writeFile(t, data, 'utf8');
  await RNFS.moveFile(t, path);
}
