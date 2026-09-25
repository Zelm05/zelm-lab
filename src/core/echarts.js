/* ==========================================================================
 * echarts 入口（管理台看板用）
 *
 * ⚠️ 2026-09-25 踩坑记录（重要）：
 *   1) `echarts/core` + `echarts/lib/component/*`（legacy 副作用式）→ 两套 use() 注册表，注册不生效 → 图表空白；
 *   2) `echarts/core` + `echarts/charts|components|renderers` 桶文件 → 线上仍渲染不出来；
 *   3) `import * as echarts from 'echarts'`（整库）→ 能保证不缺组件，但分包 1134KB（gzip 382KB），太重。
 * 结论：**回退到改动前的 `echarts/index.common`**（官方预构建常用子集，改动前线上一直正常）。
 *   以后要瘦身，必须在管理台**真机验证图表能渲染**之后再换。
 * ========================================================================== */
import * as echarts from 'echarts/index.common';

export default echarts;
