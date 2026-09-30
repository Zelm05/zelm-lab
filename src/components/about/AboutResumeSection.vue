<script setup>
/* ==========================================================================
 * AboutResumeSection.vue —— 「关于我」页的简历板块
 *
 * 从 AboutView.vue 原样搬出来的一个 <section>（P1-4e）。本组件是**纯展示**：
 *   简历条目、下载直链、是否显示管理按钮，全部由 props 传入；
 *   两个交互（打开管理面板 / 打开在线预览弹窗）以事件上抛。
 *
 * 为什么交互不在本组件里：预览弹窗（<Teleport> + iframe）连同它的模板 ref
 *   （ref="resumeOvEl"）必须留在 AboutView —— useDialog 的 panelRef 用来把
 *   Tab 焦点陷阱限定在弹窗内，模板 ref 又只在持有模板的组件里被填充。
 *   所以本组件只负责「把按钮画出来」，点击后由父组件去开弹窗。
 *
 * ⚠️ 样式不在这里：本页样式是页面级全局样式（`:where(html[data-page="about"])`
 *   前缀、非 scoped），全部留在 AboutView.vue 的 <style> 块里，一字未动。
 *   搬模板块时**不要**顺手把样式也搬过来 —— 那会让本组件离开关于页后样式失效，
 *   而关于页里又因为选择器前缀还在而看不出问题。
 * ========================================================================== */
import { useI18n } from '@/i18n';

defineProps({
  /** 简历条目（useResumePreview 的 resumeItem；null = 后台还没录入，显示占位） */
  item: { type: Object, default: null },
  /** 下载直链（同源代理，带 attachment；见 useResumePreview 的注释） */
  dlUrl: { type: String, default: '' },
  /** 是否显示「管理简历」按钮（仅站长） */
  canManage: { type: Boolean, default: false },
});

const emit = defineEmits(['manage', 'preview']);

const { t } = useI18n('about');
/* 「管理XX」按钮文案在 home 命名空间（原模板用的是 tHome） */
const { t: tHome } = useI18n('home');
/* 跨命名空间共用词（预览 / 下载…）走 common 包 */
const { t: tc } = useI18n('common');
</script>

<template>
  <section id="secResume" class="about-section">
    <h2>
      {{ t('resumeTitle') }}
      <button v-if="canManage" type="button" class="owner-add" @click="emit('manage')">{{ tHome('resumeManage') }}</button>
    </h2>
    <p class="sub">{{ t('resumeSub') }}</p>
    <div class="resume-box">
      <p v-if="!item">{{ t('resumePlaceholder') }}</p>
      <template v-else>
        <!-- 在线预览 + 下载（2026-09-28）：预览走 iframe 弹窗；
             下载走**同源代理**（dl=1 → 响应带 attachment）+ download 属性双保险 ——
             跨域直链时 download 属性会被浏览器忽略（点下载变成打开新标签页），同源后即恢复 -->
        <div class="resume-actions">
          <button type="button" class="resume-btn" @click="emit('preview')">{{ tc('cPreview') }}</button>
          <a class="resume-btn resume-btn--ghost" :href="dlUrl" :download="item.title || 'resume.pdf'" rel="noopener noreferrer">{{ tc('cDownload') }}</a>
        </div>
      </template>
    </div>
  </section>
</template>
