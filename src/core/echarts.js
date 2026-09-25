/* ==========================================================================
 * echarts 按需引入（2026-09-25 第五批）
 *
 * 背景：原动态 import('echarts/index.common') 打包出 706KB（gzip 248KB）——
 *       index.common 是「常用合集」预注册构建，把 30+ 种图表全打了进去。
 *
 * ⚠️ 为什么不用 `echarts/charts` 桶文件：它 re-export lib/export/charts.js，
 *   后者 import 了全部 lib/chart/*.js；而 echarts 的 package.json 把
 *   lib/chart/*.js 标成有副作用（sideEffects），打包器无法摇掉
 *   （实测 365KB，几乎没省——见 StatsBoard.vue 旧注释）。
 *
 * 做法：import echarts/core + 直接引 lib 子路径。
 *   lib/chart/bar.js 末尾是 `import { use } from '../extension.js'; use(install);`
 *   —— 自注册，引一个只装一个，真正按需。
 * ========================================================================== */
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/* 必须走 echarts/core + echarts/charts|components|renderers 这一套（同一实例的 use()）。
   ⚠️ 2026-09-25 教训：曾混用 `echarts/core` + `echarts/lib/component/*`（legacy 副作用式导入），
   两者是**不同的注册表**，use() 不生效 → 管理台图表整片空白。 */
echarts.use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export default echarts;
