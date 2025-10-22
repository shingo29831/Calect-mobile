// src/data/persistence/localFile.ts
// シンプルなローカル永続ラッパー。
// React Native 環境で、あれば react-native-fs、無ければ AsyncStorage を使います。

let RNFS: any = null;
let AsyncStorage: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNFS = require('react-native-fs');
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require('@react-native-async-storage/async-storage')?.default;
} catch {}

const ROOT_PREFIX = 'calect://'; // AsyncStorage キーの接頭辞
const normKey = (p: string) => `${ROOT_PREFIX}${p.replace(/^\/+/, '')}`;

async function ensureDirForFile(filePath: string) {
  if (!RNFS) return; // AsyncStorage では不要
  const dir = filePath.replace(/\/[^/]+$/, '');
  if (!dir) return;
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
  } catch {
    // mkdir失敗は無視（既存など）
  }
}

/** テキストを書き込み（UTF-8） */
export async function writeFile(path: string, content: string): Promise<void> {
  if (RNFS?.writeFile) {
    const full = `${RNFS.DocumentDirectoryPath}/${path}`;
    await ensureDirForFile(full);
    await RNFS.writeFile(full, content, 'utf8');
    return;
  }
  if (!AsyncStorage) throw new Error('No storage backend available');
  await AsyncStorage.setItem(normKey(path), content);
}

/** テキストを読み込み（UTF-8）。見つからない場合は reject */
export async function readFile(path: string): Promise<string> {
  if (RNFS?.readFile) {
    const full = `${RNFS.DocumentDirectoryPath}/${path}`;
    const exists = await RNFS.exists(full);
    if (!exists) throw new Error('ENOENT');
    return RNFS.readFile(full, 'utf8');
  }
  if (!AsyncStorage) throw new Error('No storage backend available');
  const v = await AsyncStorage.getItem(normKey(path));
  if (v == null) throw new Error('ENOENT');
  return v;
}

/** ファイル削除（存在しなくても成功扱い） */
export async function unlink(path: string): Promise<void> {
  if (RNFS?.unlink) {
    const full = `${RNFS.DocumentDirectoryPath}/${path}`;
    const exists = await RNFS.exists(full);
    if (exists) await RNFS.unlink(full);
    return;
  }
  if (!AsyncStorage) return;
  await AsyncStorage.removeItem(normKey(path));
}

/** ディレクトリ配下をざっくり削除（AsyncStorage時は接頭辞でスキャン） */
export async function rimraf(dir: string): Promise<void> {
  if (RNFS?.unlink) {
    const full = `${RNFS.DocumentDirectoryPath}/${dir}`.replace(/\/+$/, '');
    const exists = await RNFS.exists(full);
    if (exists) await RNFS.unlink(full);
    return;
  }
  if (!AsyncStorage) return;
  const keys: string[] = await AsyncStorage.getAllKeys();
  const prefix = normKey(dir).replace(/\/+$/, '') + '/';
  const targets = keys.filter((k) => k.startsWith(prefix));
  if (targets.length) await AsyncStorage.multiRemove(targets);
}
