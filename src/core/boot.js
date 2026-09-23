/* ==========================================================================
 * src/core/boot.js —— 外壳级一次性副作用（跨标签页主题同步）
 *
 * 原站拆在 boot.js 与各页 head 内联脚本里（gate.head0 / admin.head0 各写了一遍）。
 * 现在合并到这里，由 main.js 引入一次即可，页面组件不再各自重复注册。
 *
 * 注意：首屏主题 / 环境能力探测 / 播放器显隐必须在 HTML 解析阶段同步完成，
 * 不能等这个模块（要等 JS bundle 下载），所以那部分仍留在 index.html 的
 * 内联引导脚本里，此处只做运行期的跨标签页同步。
 * ========================================================================== */

/** 应用主题（合法值只有 light / dark） */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

/** 跨标签页同步：用户在另一个标签改了主题，本页跟随（含管理台弹窗等） */
window.addEventListener('storage', (e) => {
  if (e.key !== 'zelm_settings' || !e.newValue) return;
  try {
    applyTheme(JSON.parse(e.newValue).theme);
  } catch (err) { /* 忽略 */ }
});
