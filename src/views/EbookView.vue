<script setup>
/* ==========================================================================
 * EbookView.vue —— 电子书前台（内容来自 D1 /api/ebook，站长在管理台编辑）
 * 路由：/#/ebook
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { getJSON } from '@/api/http';
import { useI18n } from '@/core/i18n';

const { t } = useI18n('home');
const chapters = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await getJSON('/api/ebook');
    chapters.value = (r && r.items) || [];
  } catch (e) { /* 空态 */ }
  loading.value = false;
});
</script>

<template>
  <main class="container">
    <section class="glass section-block">
      <div class="section-head">
        <h2>{{ t('ebookTitle') }}</h2>
      </div>
      <p class="section-sub">{{ t('ebookSub') }}</p>

      <p v-if="loading" class="block-empty">…</p>
      <p v-else-if="!chapters.length" class="block-empty">{{ t('ebookEmpty') }}</p>

      <template v-else>
        <!-- 目录 -->
        <nav v-if="chapters.length > 1" class="ebook-toc">
          <a v-for="(c, i) in chapters" :key="c.id" :href="'#ch' + c.id">{{ i + 1 }}. {{ c.title }}</a>
        </nav>
        <article v-for="(c, i) in chapters" :id="'ch' + c.id" :key="c.id" class="ebook-chapter">
          <h3>{{ i + 1 }}. {{ c.title }}</h3>
          <p class="ebook-body">{{ c.content }}</p>
        </article>
      </template>

      <a class="item-go" href="#/home">← {{ t('backHome') }}</a>
    </section>
  </main>
</template>
