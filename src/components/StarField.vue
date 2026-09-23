<script setup>
/* ==========================================================================
 * StarField.vue —— 背景星光（主站 / 关于我 共用）
 *
 * 原状：两个页面各写 10 行循环，createElement 出 46 个 <span class="star-dot">，
 *   随机尺寸 / 位置 / 周期 / 相位都用行内 style 写死；显示与否由页面脚本
 *   在设置变更时手工改 style.opacity。
 * 现在：随机值算一次（模块级，等价于原站「每次整页加载算一次」），
 *   模板用 v-for 铺开；显示与否由设置 store 派生 —— 改设置即时生效，
 *   不需要任何 updateXxx() 回写。
 * ========================================================================== */
import { useSettingsStore } from '@/stores/settings';

const st = useSettingsStore();

/* 46 颗星：尺寸 1~3.2px，位置铺满，闪烁周期 2~5.5s，相位取负值错开 */
const DOTS = Array.from({ length: 46 }, () => {
  const size = 1 + Math.random() * 2.2;
  return {
    width: size + 'px',
    height: size + 'px',
    left: Math.random() * 100 + '%',
    top: Math.random() * 100 + '%',
    animationDuration: (2 + Math.random() * 3.5) + 's',
    animationDelay: (-Math.random() * 5) + 's',
  };
});
</script>

<template>
  <div id="starField" class="star-field" :style="{ opacity: st.s.stars ? 1 : 0, '--fade-to': st.s.stars ? 1 : 0 }">
    <span v-for="(d, i) in DOTS" :key="i" class="star-dot" :style="d"></span>
  </div>
</template>
