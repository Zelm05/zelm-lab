/* ==========================================================================
 * echarts 入口（管理台看板用）—— **按需引入**（2026-09-25）
 *
 * 历史踩坑（前 4 次尝试都失败过，记清楚免得再踩）：
 *   1) `echarts/core` + `echarts/lib/component/*`（legacy 副作用式）
 *      → 两套 use() 注册表，注册不生效 → 图表空白；
 *   2) `echarts/core` + `echarts/charts|components|renderers` 桶文件
 *      → 线上仍渲染不出来（那次是**注册列表不全**，并非桶文件不能用）；
 *   3) `import * as echarts from 'echarts'`（整库）→ 分包 1134KB（gzip 382KB）；
 *   4) `echarts/index.common`（官方预构建常用子集）→ 723KB（gzip 248KB），能跑但太重。
 *
 * 本版做法：`echarts/core` + 桶文件 + 显式 `use()`（**官方推荐的按需写法**）。
 *   · 已用一次性探针验证（Node SSR 出图，option 逐字抄自 StatsBoard）：
 *     pie = 6330B svg / bar = 3591B svg，**零 [ECharts] 警告**。
 *   · 产物实测 723KB → **540KB**（gzip 248 → 185KB）。
 *
 * ⚠️ 关于"桶文件能不能 tree-shake"——**能**，别再被误导：
 *   在产物里 grep 到 sunburst / treemap / gauge 这些名字会以为"图表全打进来了"，
 *   但它们只是 `echarts/core` 里的**类型名字符串**。实测**只引 echarts/core 不引任何图表**
 *   就已经有 377KB —— 那是 echarts 6 的地板（core + zrender），
 *   剩下 540−377 ≈ 163KB 才是 pie/bar/tooltip/legend/grid/canvas 的真实成本。
 *   我也试过直接深引 `echarts/lib/<x>/install.js`，产物**与桶文件逐字节同大小**，
 *   既然没收益就用官方 API（深引是内部路径，升版易碎）。
 *
 * ⚠️ 以后给看板加图表，必须同步两件事：
 *   ① 这里 `use()` 补上对应组件/图表；
 *   ② echarts 6 起 `grid.containLabel` 是 **legacy 特性**，要显式注册
 *      `LegacyGridContainLabel`（在 `echarts/features`，**不在** `echarts/components`）；
 *      缺了它不出图、只打一行控制台警告，极容易漏。
 * ========================================================================== */
import * as echarts from 'echarts/core';
import { PieChart, BarChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

/* 看板实际用到的全部能力（多一个都不引）：
 *   pie / bar     —— StatsBoard 只有这两张图
 *   tooltip       —— 两张图都配了
 *   legend        —— 饼图
 *   grid          —— 柱图
 *   CanvasRenderer —— init 时指定 renderer: 'canvas'
 * （没有 title：两张图都没用 title 组件。） */
echarts.use([
  PieChart, BarChart,
  TooltipComponent, LegendComponent, GridComponent,
  LegacyGridContainLabel,
  CanvasRenderer,
]);

export default echarts;
