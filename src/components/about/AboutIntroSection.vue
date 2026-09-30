<script setup>
/* ==========================================================================
 * AboutIntroSection.vue —— 「关于我」页的「关于我」板块（第一屏）
 *
 * 从 AboutView.vue 原样搬出来的一个 <section>（P1-4e）。本组件是**纯展示**：
 *   个人简介 / 教育背景 / 技能标签 / 「当前语言没翻译」的提示 / 是否显示管理
 *   按钮，全部由 props 传入；「打开管理面板」以事件上抛。
 *
 * 为什么这么切：三个卡片的文案都来自内容派生层（useAboutContent）——
 *   **DB 有就用 DB，没有就用 i18n 静态文案**的兜底规则在那里，不在本组件。
 *   技能标签的解析（JSON 数组 ↔ 逗号文本兼容、全角逗号）同样在那一层。
 *
 * ⚠️ 样式不在这里：本页样式是页面级全局样式（`:where(html[data-page="about"])`
 *   前缀、非 scoped），全部留在 AboutView.vue 的 <style> 块里，一字未动。
 *   搬模板块时**不要**顺手把样式也搬过来 —— 那会让本组件离开关于页后样式失效，
 *   而关于页里又因为选择器前缀还在而看不出问题。
 * ========================================================================== */
import { useI18n } from '@/i18n';

defineProps({
  /** 个人简介（DB 有则 DB，否则 i18n 静态文案） */
  bioText: { type: String, default: '' },
  /** 教育背景（同上） */
  eduText: { type: String, default: '' },
  /** 技能标签（已解析成数组，兜底清单也在派生层） */
  skills: { type: Array, default: () => [] },
  /** 当前语言没翻译、回退了默认语言时的提示（空串 = 不显示） */
  notice: { type: String, default: '' },
  /** 是否显示「管理关于我」按钮（仅站长） */
  canManage: { type: Boolean, default: false },
});

const emit = defineEmits(['manage']);

const { t } = useI18n('about');
/* 「管理XX」按钮文案在 home 命名空间（原模板用的是 tHome） */
const { t: tHome } = useI18n('home');
</script>

<template>
  <section id="secAbout" class="about-section">
    <h2>{{ t('aboutTitle') }}
      <button v-if="canManage" type="button" class="owner-add" @click="emit('manage')">{{ tHome('aboutManage') }}</button>
    </h2>
    <p class="sub">{{ t('aboutSub') }}</p>
    <!-- 当前语言没翻译时的轻量提示（后端回退了默认语言） -->
    <p v-if="notice" class="content-fallback-tip">{{ notice }}</p>
    <div class="about-grid">
      <div class="about-card">
        <h3>📖 <span>{{ t('aboutBioTitle') }}</span></h3>
        <p>{{ bioText }}</p>
      </div>
      <div class="about-card">
        <h3>🎓 <span>{{ t('aboutEduTitle') }}</span></h3>
        <!-- 教育背景：后台「关于我」可编辑（about_translations.education），没录入时用 i18n 静态文案兜底 -->
        <p>{{ eduText }}</p>
      </div>
      <div class="about-card">
        <h3>🛠 <span>{{ t('aboutStackTitle') }}</span></h3>
        <div class="tag-cloud">
          <span v-for="s in skills" :key="s" class="tag">{{ s }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
