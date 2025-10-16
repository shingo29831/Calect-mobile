/**
 * App bootstrap entry
 * - 繝ｭ繝ｼ繧ｫ繝ｫ繝・・繧ｿ縺ｮ繝ｭ繝ｼ繝・
 * - 繧｢繝励Μ蜀・B縺ｸ縺ｮ謚募・
 * - 蜷梧悄縺ｮ襍ｷ蜍包ｼ亥ｿ・ｦ∵凾・・
 */
import { loadLocalStore } from "../../data/persistence/localStore";
import { replaceAllInstances } from "../../store/db";
import { runIncrementalSync, exampleFetchServerDiff } from "../../data/sync/runIncrementalSync";
import type { FetchServerDiff, ServerDiffResponse } from "../../data/sync/runIncrementalSync";


export async function bootstrapApp() {
  // 1) 繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繧ｹ繝翫ャ繝励す繝ｧ繝・ヨ繧定ｪｭ繧
  try {
    const snapshot = await loadLocalStore();

    // 2) 逕ｻ髱｢縺九ｉ蜿ら・縺吶ｋ 窶懊い繝励Μ蜀・B窶・繧堤ｽｮ謠・
    if (snapshot?.instances?.length) {
      await replaceAllInstances(snapshot.instances);
    }
  } catch (e) {
    console.warn("loadLocalStore failed (continue without local snapshot):", e);
  }

  // 3) 繧ｵ繝ｼ繝仙｢怜・蜷梧悄
  try {
    // 譛ｬ螳溯｣・
    await runIncrementalSync(exampleFetchServerDiff);
  } catch (e) {
    console.warn("runIncrementalSync failed (will continue offline):", e);
  }
}

export default bootstrapApp;
