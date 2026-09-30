/* ==========================================================================
 * src/core/viewport.js —— 视口判断的纯函数
 *
 * 为什么单独成文件：`window.matchMedia('(max-width: 640px)')` 这个断点此前
 *   在 AboutView（简历预览 / 证书详情）与 MomentsBoard 各写了一遍。两处断点
 *   一旦漂移，同一个页面里「点查看」和「点卡片」的移动端行为就会不一致，
 *   而且极难发现 —— 收敛到一处。
 *
 * 断点 640px 与 late-overrides.css 里 `.mobile-pdf-actions` 的媒体查询一致，
 *   改这里必须同步改那里。
 *
 * ⚠️ 实现刻意**不做 try/catch 兜底**，与原代码逐字等价：
 *   原写法就是 `window.matchMedia(...).matches`。加兜底会改变「老内核 /
 *   非浏览器环境下抛异常」这一既有行为，超出本次「只搬家不改行为」的范围。
 *   需要防御性调用的地方（core/motion.js）本来就有自己的兜底写法。
 * ========================================================================== */

/** 手机断点：与 .mobile-pdf-actions 的媒体查询一致 */
export const MOBILE_MAX_PX = 640;

/** 当前是否手机视口（≤640px） */
export function isMobileViewport(maxPx = MOBILE_MAX_PX) {
  return window.matchMedia(`(max-width: ${maxPx}px)`).matches;
}
