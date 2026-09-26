<script setup>
/* ==========================================================================
 * FooterContacts.vue —— 页脚联系方式（主站 / 关于我 共用）
 *
 * 原状：两个页面各自 createElement 出一串 <a>，还把整段 <svg> 字符串塞进
 *   innerHTML，tooltip 也是字符串拼的（about.js 与 home.js 里各约 30 行）。
 * 现在：图标是真正的 <svg><path :d="…"/></svg>，生成的 DOM 与原站逐字节对齐
 *   （<a class="contact-icon-only[ has-qq-tooltip]"> + 一个 svg + 可选的 tooltip）。
 *
 * ns 这个 prop 是为了保留两页原本就不一致的文案：
 *   主站「扫码添加好友」，关于页「扫码添加」——不顺手统一。
 *
 * 性能：二维码图（QQ 105KB / 抖音 86KB）只在鼠标悬浮图标时才可见，
 *   而页脚位于页面底部、首屏之外。原实现没有 loading 属性，浏览器会在
 *   首屏就把这两张图拉下来（实测主站首屏因此多传 191KB）。这里补上
 *   loading="lazy" + decoding="async"：滚动接近页脚时才加载，悬浮时
 *   Chromium 的预加载阈值（约 1250px）通常已经取回，不会看到空白。
 * ========================================================================== */
import { useI18n } from '@/core/i18n';
import { CONTACTS, ICON_VIEW_BOX } from '@/data/contacts';

const props = defineProps({
  /** 联系人清单（默认主站那份） */
  contacts: { type: Array, default: () => CONTACTS },
  /** 文案命名空间：tooltip 里的「QQ号 / 抖音号 / 扫码提示」 */
  ns: { type: String, default: 'about' },
});

const { t } = useI18n(props.ns);
/* P3-6：QQ 的悬浮提示是中文文案（原硬编码在 data/contacts.js），走 common 命名空间；
   邮箱 / GitHub 句柄等与语言无关的标识仍直接读 c.title。 */
const { t: tc } = useI18n('common');
const titleOf = (c) => (c.titleKey ? tc(c.titleKey) : c.title);

/** 是否有账号二维码 tooltip（QQ / 抖音才有） */
const hasTip = (c) => !!(c.qq || c.douyin);
const accountLabel = (c) => (c.qq ? t('qqNumber') : t('douyinAccount'));
const tipText = (c) => (c.qq ? t('scanToAdd') : t('scanToFollow'));
const isMail = (c) => String(c.url).indexOf('mailto:') === 0;
</script>

<template>
  <div id="footerContacts" class="footer-contacts">
    <a
      v-for="(c, i) in contacts"
      :key="i"
      class="contact-icon-only"
      :class="{ 'has-qq-tooltip': hasTip(c) }"
      :title="titleOf(c)"
      :href="c.url"
      :target="isMail(c) ? null : '_blank'"
      :rel="isMail(c) ? null : 'noopener noreferrer'"
    >
      <!-- 有 path 用统一的 SVG 图标；没有（后台自定义平台）就回落 emoji -->
      <svg v-if="c.path" :viewBox="ICON_VIEW_BOX" width="24" height="24" fill="currentColor"><path :d="c.path" /></svg>
      <span v-else class="contact-emoji" aria-hidden="true">{{ c.icon || '🔗' }}</span>
      <div v-if="hasTip(c)" class="qq-tooltip">
        <div class="qq-tooltip-title">{{ accountLabel(c) }}</div>
        <div class="qq-tooltip-number">{{ c.qq || c.douyin }}</div>
        <img class="qq-tooltip-qrcode" :src="c.qrcode" :alt="accountLabel(c)" loading="lazy" decoding="async">
        <div class="qq-tooltip-tip">{{ tipText(c) }}</div>
      </div>
    </a>
  </div>
</template>

<style scoped>
/* 后台自定义平台的回落图标（emoji）：与 24px 的 SVG 图标占位一致，避免行高跳动 */
.contact-emoji {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; font-size: 17px; line-height: 1;
}
</style>
