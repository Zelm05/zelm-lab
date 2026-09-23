/* ==========================================================================
 * src/stores/site-cfg.js —— 站点设置的 Vue 侧（Pinia）
 *
 * 与 src/core/site-cfg.js 的分工：
 *   - core/site-cfg.js：同步读写 Cookie，供原站脚本按原语义调用（读的是快照）
 *   - 本 store：把同一份配置变成响应式，供组件用 v-show / 条件渲染直接绑定
 *
 * 这解决了原站一个真实毛病：板块显隐靠页面脚本在「解析阶段」同步改 DOM
 * （home.body3.js / about.body2.js 各写一遍），容易闪、还重复实现。
 * 现在改成模板上的 v-show，由 Vue 保证。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ZelmSiteCfg } from '@/core/site-cfg';
import { getJSON } from '@/api/http';

export const useSiteCfgStore = defineStore('siteCfg', () => {
  // 初始值同步取自 Cookie（由 Worker 随 HTML 下发），首屏渲染即为最终状态
  const cfg = ref(ZelmSiteCfg.read());

  const homeAboutOn = computed(() => cfg.value.ha !== 0);
  const photoWallOn = computed(() => cfg.value.pw !== 0);
  const messageLoginRequired = computed(() => cfg.value.mlr !== 0);
  const likeLoginRequired = computed(() => cfg.value.llr !== 0);
  const aboutLoginRequired = computed(() => cfg.value.alr !== 0);
  const aboutPasswordEnabled = computed(() => cfg.value.apw !== 0);
  const entryPage = computed(() => (cfg.value.ep === 'a' ? 'about' : 'index'));

  /** 用接口返回的完整配置刷新（并回写 Cookie，供后续导航直接同步读取） */
  function apply(apiData) {
    if (!apiData) return;
    cfg.value = ZelmSiteCfg.fromApi(apiData);
    ZelmSiteCfg.write(cfg.value);
  }

  /** 重新从 Cookie 同步一次（例如切页回来后） */
  function syncFromCookie() {
    cfg.value = ZelmSiteCfg.read();
  }

  /**
   * 拉一次 /api/site/settings 并刷新。
   * 原状：about.js / home.js / admin 的脚本各写一遍 fetch + 三个字段的解析。
   * 现在收敛在这里 —— 需要「拿最新配置再决定怎么做」的地方（关于页门控）
   * 直接 await 它即可；接口失败时保持 Cookie 里的值，调用方不必处理异常。
   */
  async function load() {
    try {
      const { ok, data } = await getJSON('/api/site/settings');
      if (ok && data) apply(data);
    } catch (e) { /* 网络异常：沿用 Cookie 里的快照 */ }
    return cfg.value;
  }

  return {
    cfg,
    homeAboutOn,
    photoWallOn,
    messageLoginRequired,
    likeLoginRequired,
    aboutLoginRequired,
    aboutPasswordEnabled,
    entryPage,
    apply,
    syncFromCookie,
    load,
  };
});
