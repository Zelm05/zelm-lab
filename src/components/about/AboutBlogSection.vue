<script setup>
/* ==========================================================================
 * AboutBlogSection.vue —— 「关于我」页的技术博客板块
 *
 * 从 AboutView.vue 原样搬出来的一个 <section>（P1-4e）。本组件是**纯展示**：
 *   已发布博客列表、兜底提示、是否显示管理按钮，全部由 props 传入；
 *   「打开管理面板」以事件上抛，不在本组件里实现。
 *
 * 为什么这么切：博客的取数、「当前语言没翻译」的判定、标签与日期的解析
 *   都属于内容派生层（useAboutContent），本组件只负责把它们画出来。
 *
 * blogTags / fmtDate 直接按名从 useAboutContent 导入 —— 它们是纯函数
 *   （不碰 store / i18n），比用 props 传函数干净，也避免抄第二份实现。
 *
 * ⚠️ 样式不在这里：本页样式是页面级全局样式（`:where(html[data-page="about"])`
 *   前缀、非 scoped），全部留在 AboutView.vue 的 <style> 块里，一字未动。
 *   搬模板块时**不要**顺手把样式也搬过来 —— 那会让本组件离开关于页后样式失效，
 *   而关于页里又因为选择器前缀还在而看不出问题。
 * ========================================================================== */
import { useI18n } from '@/i18n';
import { resolveAssetUrl } from '@/lib/supabase';
import { blogTags, fmtDate } from '@/composables/useAboutContent';

defineProps({
  /** 已发布博客列表（useAboutContent 的 content.blogs） */
  blogs: { type: Array, default: () => [] },
  /** 当前语言没翻译、回退了默认语言时的提示（空串 = 不显示） */
  tip: { type: String, default: '' },
  /** 是否显示「管理博客」按钮（仅站长） */
  canManage: { type: Boolean, default: false },
});

const emit = defineEmits(['manage']);

const { t } = useI18n('about');
/* 「管理XX」按钮文案在 home 命名空间（原模板用的是 tHome） */
const { t: tHome } = useI18n('home');
/* 跨命名空间共用词（下载…）走 common 包 */
const { t: tc } = useI18n('common');
</script>

<template>
  <section id="secBlog" class="about-section">
    <h2>{{ t('blogTitle') }}
      <button v-if="canManage" type="button" class="owner-add" @click="emit('manage')">{{ tHome('blogManage') }}</button>
    </h2>
    <p class="sub">{{ t('blogSub') }}</p>
    <p v-if="tip" class="content-fallback-tip">{{ tip }}</p>
    <ul v-if="blogs.length" class="blog-list">
      <li v-for="b in blogs" :key="b.id" class="blog-item">
        <div class="blog-head">
          <h3>{{ b.title }}</h3>
          <span v-if="b.published_at" class="blog-date">{{ fmtDate(b.published_at) }}</span>
        </div>
        <p v-if="b.summary" class="blog-summary">{{ b.summary }}</p>
        <p v-if="b.content" class="blog-body">{{ b.content }}</p>
        <div v-if="blogTags(b).length" class="tag-cloud">
          <span v-for="tg in blogTags(b)" :key="tg" class="tag">{{ tg }}</span>
        </div>
        <a
          v-if="b.attach_path" class="blog-attach"
          :href="resolveAssetUrl(b.attach_path, 'blog-assets')" target="_blank" rel="noopener noreferrer"
        >{{ tc('cDownload') }}</a>
      </li>
    </ul>
    <!-- 后台还没录入时保留原来的占位，不出现空白区块 -->
    <ul v-else class="blog-list">
      <li class="blog-item"><a href="#" @click.prevent>{{ t('blogComing') }}</a></li>
    </ul>
  </section>
</template>
