<script setup>
/* ==========================================================================
 * 隐私政策与服务条款
 *
 * 本页是「命令式 → 响应式」转换的样板：
 *   原本 46 处 data-i18n 靠 privacy.js 里 querySelectorAll + innerHTML 手工刷，
 *   现在全部是模板绑定，privacy.js 已整体删除。
 *
 * v-text / v-html 的取用不是随意选的：与原实现逐键对齐 ——
 *   原实现用的是 innerHTML，语言包里含 <strong>/<code> 的 8 个键必须 v-html，
 *   其余不含标记的用 v-text（更安全，渲染结果完全一致）。
 * ========================================================================== */
import { watchEffect } from 'vue';
import { usePageMeta } from '@/composables/usePageMeta';
import { useI18n } from '@/i18n';

usePageMeta('privacy');

const { t } = useI18n('privacy');

/* 标题。原 privacy.js 的 apply() 里手写了两句 document.title（中/英各一句），
   现在只有中文，由 pageTitle 推导即可。 */
watchEffect(() => { document.title = t('pageTitle') + ' · Zelm'; });
</script>

<template>
<!-- ⚠ 标记结构来自原站 privacy 页，原样保留；仅把 data-i18n 换成响应式绑定 -->
<div class="wrap">

  <div class="top">
    <h1 v-text="t('pageTitle')"></h1>
  </div>

  <p class="meta" v-text="t('pageIntro')"></p>
  <p class="upd" v-text="t('lastUpdated')"></p>

  <!-- ================= 隐私政策 ================= -->
  <h2 id="privacy" v-text="t('privacyTitle')"></h2>

  <h3 v-text="t('p1Title')"></h3>
  <ul>
    <li v-html="t('p1a')"></li>
    <li v-html="t('p1b')"></li>
    <li v-html="t('p1c')"></li>
    <li v-html="t('p1d')"></li>
  </ul>

  <h3 v-text="t('p2Title')"></h3>
  <p v-html="t('p2Body')"></p>

  <h3 v-text="t('p3Title')"></h3>
  <ul>
    <li v-text="t('p3a')"></li>
    <li v-html="t('p3b')"></li>
    <li v-text="t('p3c')"></li>
  </ul>

  <h3 v-text="t('p4Title')"></h3>
  <p v-text="t('p4Body')"></p>

  <h3 v-text="t('p5Title')"></h3>
  <p v-html="t('p5Body')"></p>

  <h3 v-text="t('p6Title')"></h3>
  <p v-text="t('p6Body')"></p>

  <h3 v-text="t('p7Title')"></h3>
  <p v-text="t('p7Body')"></p>

  <!-- ================= 服务条款 ================= -->
  <h2 id="terms" v-text="t('termsTitle')"></h2>

  <h3 v-text="t('t1Title')"></h3>
  <p v-text="t('t1Body')"></p>

  <h3 v-text="t('t2Title')"></h3>
  <p v-text="t('t2Body')"></p>

  <h3 v-text="t('t3Title')"></h3>
  <p v-html="t('t3Intro')"></p>
  <ul>
    <li v-text="t('t3a')"></li>
    <li v-text="t('t3b')"></li>
    <li v-text="t('t3c')"></li>
    <li v-text="t('t3d')"></li>
    <li v-text="t('t3e')"></li>
  </ul>

  <h3 v-text="t('t4Title')"></h3>
  <p v-text="t('t4Body')"></p>

  <h3 v-text="t('t5Title')"></h3>
  <p v-text="t('t5Body')"></p>

  <h3 v-text="t('t6Title')"></h3>
  <p v-text="t('t6Body')"></p>

  <!-- ================= 版权投诉 ================= -->
  <h2 id="copyright" v-text="t('crTitle')"></h2>
  <p v-text="t('crIntro')"></p>
  <div class="card">
    <p style="margin:0 0 8px"><strong v-text="t('crEmailLabel')"></strong>：<a href="mailto:yz050930@gmail.com">yz050930@gmail.com</a></p>
    <p style="margin:0; color:var(--muted); font-size:.88rem" v-text="t('crEmailHint')"></p>
  </div>

  <a class="back" href="#/home" v-text="t('backHome')"></a>
</div>
</template>

<!-- 样式原在 src/styles/pages/privacy.css，已合并进本组件 -->
<style>
/* 来自 privacy.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
:root:where([data-page="privacy"]) {
    --bg: #061814; --panel: rgba(255,255,255,.04); --text: #e9edf6;
    --muted: #9aa8b3; --accent: #4ff0d0; --border: rgba(79,240,208,.18);
  }
  html:where([data-page="privacy"])[data-theme="light"] {
    --bg: #f4f7f6; --panel: rgba(0,0,0,.02); --text: #16332a;
    --muted: #5a6b63; --accent: #2d7a5a; --border: rgba(45,122,90,.2);
  }
  :where(html[data-page="privacy"]) * { box-sizing: border-box; }
  :where(html[data-page="privacy"]) body {
    margin: 0; padding: 40px 20px 60px; background: var(--bg); color: var(--text);
    font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    line-height: 1.85; font-size: 15px;
  }
  :where(html[data-page="privacy"]) .wrap { max-width: 780px; margin: 0 auto; }
  :where(html[data-page="privacy"]) .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
  :where(html[data-page="privacy"]) h1 { font-size: 1.6rem; margin: 0; color: var(--accent); }
  :where(html[data-page="privacy"]) h2 { font-size: 1.15rem; margin: 34px 0 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); color: var(--accent); scroll-margin-top: 20px; }
  :where(html[data-page="privacy"]) h3 { font-size: .98rem; margin: 20px 0 6px; }
  :where(html[data-page="privacy"]) p, :where(html[data-page="privacy"]) li { color: var(--text); }
  :where(html[data-page="privacy"]) ul { padding-left: 22px; margin: 8px 0; }
  :where(html[data-page="privacy"]) .meta { color: var(--muted); font-size: .85rem; margin-bottom: 8px; }
  :where(html[data-page="privacy"]) .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin: 14px 0; }
  :where(html[data-page="privacy"]) a { color: var(--accent); }
  :where(html[data-page="privacy"]) code { background: rgba(255,255,255,.06); padding: 1px 6px; border-radius: 4px; font-size: .88em; }
  :where(html[data-page="privacy"]) .back { display: inline-block; margin-top: 32px; color: var(--accent); text-decoration: none; font-size: .9rem; }
  :where(html[data-page="privacy"]) .upd { color: var(--muted); font-size: .82rem; margin-top: 6px; }
</style>
