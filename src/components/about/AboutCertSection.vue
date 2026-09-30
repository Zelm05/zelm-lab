<script setup>
/* ==========================================================================
 * AboutCertSection.vue —— 「关于我」页的证书板块
 *
 * 从 AboutView.vue 原样搬出来的一个 <section>（P1-4e）。本组件是**纯展示**：
 *   数据（已排好序的列表）、提示文案、显隐开关、是否显示管理按钮，全部由 props 传入；
 *   两个交互（打开管理面板 / 打开详情弹窗）以事件上抛，不在本组件里实现。
 *
 * 为什么这么切：证书板块的「排序」与「详情弹窗」分别属于内容派生层
 *   （useAboutContent）和弹层层（useCertDetail），本组件只负责把它们画出来。
 *
 * ⚠️ 样式不在这里：本页样式是页面级全局样式（`:where(html[data-page="about"])`
 *   前缀、非 scoped），全部留在 AboutView.vue 的 <style> 块里，一字未动。
 *   搬模板块时**不要**顺手把样式也搬过来 —— 那会让本组件离开关于页后样式失效，
 *   而关于页里又因为选择器前缀还在而看不出问题。
 * ========================================================================== */
import { useI18n } from '@/i18n';
import { resolveAssetUrl, proxyFileUrl } from '@/lib/supabase';
import PdfThumb from '@/components/PdfThumb.vue';

defineProps({
  /** 已排序的证书行（useAboutContent 的 certsSorted：图片在前、纯 PDF 在后） */
  certs: { type: Array, default: () => [] },
  /** 当前语言没翻译、回退了默认语言时的提示（空串 = 不显示） */
  tip: { type: String, default: '' },
  /** 板块显隐（站点设置 certificates_enabled） */
  enabled: { type: Boolean, default: true },
  /** 是否显示「管理证书」按钮（仅站长） */
  canManage: { type: Boolean, default: false },
});

const emit = defineEmits(['manage', 'open']);

const { t } = useI18n('about');
/* 「管理XX」按钮文案在 home 命名空间（原模板用的是 tHome） */
const { t: tHome } = useI18n('home');
/* 跨命名空间共用词（查看 / 下载…）走 common 包 */
const { t: tc } = useI18n('common');
</script>

<template>
  <section id="secCerts" class="about-section" :hidden="!enabled">
    <h2>{{ t('certTitle') }}
      <button v-if="canManage" type="button" class="owner-add" @click="emit('manage')">{{ tHome('certManage') }}</button>
    </h2>
    <p class="sub">{{ t('certSub') }}</p>
    <p v-if="tip" class="content-fallback-tip">{{ tip }}</p>
    <div class="cert-grid">
      <template v-if="certs.length">
        <!-- 整卡可点击（2026-09-28）：打开详情弹窗看大图与全部字段；
             卡片本身是 button 语义（键盘 Enter / 空格同样可打开） -->
        <button
          v-for="c in certs" :key="c.id" type="button"
          class="cert-card cert-card--clickable"
          @click="emit('open', c)"
          @keydown.enter.prevent="emit('open', c)"
          @keydown.space.prevent="emit('open', c)"
        >
          <img
            v-if="c.image_path" class="cert-img"
            :src="resolveAssetUrl(c.image_path, 'certificate-assets')" :alt="c.name || ''"
            loading="lazy" decoding="async"
          />
          <!-- PDF 证书（2026-09-28）：没有图片时用 pdf.js 渲染**首页缩略图**
               （懒加载 + Map 缓存，见 PdfThumb.vue），不再只显示 🏅 图标 -->
          <PdfThumb
            v-else-if="c.pdf_path" class="cert-img cert-pdf-thumb"
            :asset="c.pdf_path" bucket="certificate-assets" :alt="c.name || ''"
          />
          <span v-else class="cert-icon">🏅</span>
          <h3>{{ c.name }}</h3>
          <p v-if="c.issuer" class="cert-issuer">{{ c.issuer }}</p>
          <p v-if="c.issue_date" class="cert-date">{{ c.issue_date }}</p>
          <p v-if="c.description" class="cert-desc">{{ c.description }}</p>
          <!-- PDF 直开链接：@click.stop 防止触发卡片详情弹窗。
               2026-09-28 改走同源代理 inline（原 Supabase 直链会被 XFO 拦截） -->
          <a
            v-if="c.pdf_path" class="cert-pdf"
            :href="proxyFileUrl(c.pdf_path, 'certificate-assets')" target="_blank" rel="noopener noreferrer"
            @click.stop
          >{{ tc('cView') }}</a>
        </button>
      </template>
      <!-- 后台还没录入时保留原来的占位 -->
      <div v-else class="cert-card">
        <span class="cert-icon">🏅</span>
        <h3>{{ t('certWip') }}</h3>
      </div>
    </div>
  </section>
</template>
