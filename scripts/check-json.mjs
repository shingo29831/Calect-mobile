import { promises as fs } from 'fs';
import path from 'path';

const roots = ['src', 'app', 'assets', 'i18n']; // ←あなたの構成に合わせて
const exts = ['.json'];                          // 実行時にimport/requireするJSONだけ
const bad = [];

async function walk(dir) {
  try {
    for (const name of await fs.readdir(dir)) {
      const p = path.join(dir, name);
      const st = await fs.stat(p);
      if (st.isDirectory()) await walk(p);
      else if (exts.includes(path.extname(name))) {
        const buf = await fs.readFile(p);
        // UTF-8想定でパース（BOMも許容）
        const txt = buf.toString('utf8').replace(/^\uFEFF/, '');
        try { JSON.parse(txt); }
        catch (e) { bad.push({ file: p, message: e.message }); }
      }
    }
  } catch {}
}

for (const r of roots) await walk(path.resolve(r));
if (bad.length) {
  console.error('❌ Broken runtime JSON:');
  for (const b of bad) console.error(`- ${b.file}\n  ${b.message}\n`);
  process.exit(1);
} else {
  console.log('✅ All runtime JSON valid.');
}
