/* ==========================================================================
 * src/core/shell.js —— 外壳接口（原 window.ZelmShell）
 *
 * 原站 public/shell.js 暴露 window.ZelmShell = { goPage, goBack, onUnmount,
 * getCurrent }，页面脚本靠它切页、注册卸载回调。
 *
 * 现在改为 ES 模块导出：切页走 vue-router（不再有「假路由 + 手写 hash 解析」），
 * 卸载回调由 Vue 的 onUnmounted 承担 —— 原站的 onUnmount 其实没有任何页面
 * 脚本使用，导致监听器切页后不断累积（长期泄漏）；这个问题现在由
 * src/modules 里的挂载期回收器统一解决。因此 onUnmount / runCleanups
 * 这对兼容层已无调用方，一并移除。
 * ========================================================================== */
import router from '@/router';

/** 页面名 → 路由路径（gate 是落地页，路径为 /） */
function pathOf(page) {
  return page === 'gate' || !page ? '/' : '/' + page;
}

export const shell = {
  /** 切换页面（原 ZelmShell.goPage） */
  goPage(page) {
    const target = pathOf(page);
    if (router.currentRoute.value.path === target) return;
    router.push(target);
  },

  /** 返回主站（原 ZelmShell.goBack） */
  goBack() {
    if (router.currentRoute.value.name !== 'home') {
      shell.goPage('home');
      return;
    }
    if (window.history.length > 1) router.back();
  },

  /** 当前页面名（原 ZelmShell.getCurrent） */
  getCurrent() {
    return router.currentRoute.value.name;
  },
};

