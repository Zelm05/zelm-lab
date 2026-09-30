/* ==========================================================================
 * useSectionJump.js —— 左侧目录的「点击闪一下 + 滚动到区块」
 *
 * 从 AboutView.vue 抽出来（原第 60–64 / 157–164 行）。
 *
 * 与原站一致的行为：点击后闪一下高亮（260ms），滚动到对应区块。
 * 唯一的有意改动（2026-09-22 迁移时做的，这里原样保留）：
 *   不再写 location.hash。原站用 history.replaceState 把 #secAbout 塞进地址栏
 *   —— 那套属于伪 SPA；现在地址栏的 hash 归 vue-router 所有，塞 #secAbout
 *   会被当成一条未知路由，所以改为 preventDefault + scrollIntoView，
 *   滚动效果不变，路由不再被污染。
 * ========================================================================== */
import { ref, onUnmounted } from 'vue';

/** 高亮闪现时长（原实现的经验值） */
export const FLASH_MS = 260;

export function useSectionJump() {
  const flashed = ref('');
  let flashTimer = 0;

  function jump(id) {
    flashed.value = id;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashed.value = ''; }, FLASH_MS);
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
  }

  /* 卸载时清掉待触发的定时器（原 AboutView 的 onUnmounted 里与 unmountWall 并列） */
  onUnmounted(() => { clearTimeout(flashTimer); });

  return { flashed, jump };
}
