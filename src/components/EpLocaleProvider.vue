<script setup>
/* ==========================================================================
 * EpLocaleProvider.vue —— 把当前界面语言下发给 Element Plus 内置文案（P1-5）
 *
 * 为什么**不**在 App.vue 里包一层（原计划如此）：
 *   vite.config.js 的 manualChunks 把**所有** element-plus 模块归进同一个
 *   `element-plus` 分包。在 App.vue（入口组件）里静态引 el-config-provider，
 *   入口 chunk 就会依赖该分包 —— 首屏（欢迎页 / 隐私页）平白多下载
 *   267 KB raw / 91 KB gzip，与 vite.config.js 里「保证组件库不会并进首屏
 *   index chunk」的约束直接冲突（体检报告把「EP 不进首屏」列为性能亮点）。
 *   改为只在**真正渲染 EP 组件的视图**里包一层，首屏增量 = 0。
 *
 * 覆盖范围：全项目 `<el-*>` 只出现在 HomeView / AdminView / AboutView 三处
 *   （el-button / el-input / el-table / el-dialog / el-select / el-switch /
 *    el-tag / el-empty / el-skeleton / el-card）；AuthPanel、ConfirmDialog、
 *   SessionKick 都是原生标记 + 全局 CSS，不消费 EP locale。
 *
 * 为什么语言切换不需要重新挂载：ElConfigProvider 走 provide/inject 下发配置，
 *   :locale 绑定的是 shallowRef，变化后 EP 内部 useLocale() 取到新值，
 *   已挂载的组件重渲染。
 * ========================================================================== */
import { shallowRef, watch } from 'vue';
import { ElConfigProvider } from 'element-plus/es/components/config-provider';
import { i18n } from '@/core/i18n';

/* 显式四分支：不用 `import(\`…${code}…\`)` 模板字符串，避免依赖 Vite 的 glob 展开 */
const LOADERS = {
  'zh-CN': () => import('element-plus/es/locale/lang/zh-cn'),
  'zh-TW': () => import('element-plus/es/locale/lang/zh-tw'),
  en: () => import('element-plus/es/locale/lang/en'),
  ja: () => import('element-plus/es/locale/lang/ja'),
};

/* 初值 null：ElConfigProvider 拿到 null 时用 EP 自带默认（zh-cn），
   语言包到位后立刻替换 —— 四种语言的 EP locale 文件均已确认存在，无需回退策略。 */
const locale = shallowRef(null);

watch(
  () => i18n.global.locale.value,
  async (code) => {
    const load = LOADERS[code] || LOADERS['zh-CN'];
    try {
      const m = await load();
      locale.value = m.default || m;
    } catch (e) {
      locale.value = null;   // 语言包拉取失败退回 EP 默认，不阻塞渲染
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- ElConfigProvider 的 setup 只 `renderSlot(slots,'default')`，**不产生任何 DOM 节点**，
       所以这一层是纯提供者：包裹前后页面结构与布局完全一致，子节点缩进保持原样。 -->
  <ElConfigProvider :locale="locale">
    <slot />
  </ElConfigProvider>
</template>
