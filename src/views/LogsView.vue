<script setup>
/* ==========================================================================
 * LogsView.vue —— 更新日志（前台，站长在前台就地添加）（内容来自 /api/content/logs，支持多语言；站长在后台「内容管理」编辑）
 * 路由：/#/logs
 * ========================================================================== */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { fmtTime } from '@/core/format';
import { useContentStore } from '@/stores/content';
import { useUserStore } from '@/stores/user';
import { useI18n } from '@/core/i18n';

const { t } = useI18n('home');
const { t: tc } = useI18n('common');
const router = useRouter();
function fmtDate(ts) { if (!ts) return ''; try { return fmtTime(ts).slice(0, 10); } catch (e) { return ''; } }
function goBack() { if (window.history.length > 1) router.back(); else router.push('/home'); }
/* 站长的「管理」按钮统一跳到后台内容管理面板（前台不再有第二套编辑器） */
function goManage(mod) { content.openAdmin(mod); router.push('/admin'); }
const user = useUserStore();
const kind = ref('update');   /* update | personal */
const loading = ref(true);

/* 数据来自内容 store（多语言：/api/content/logs?lang=xx）。
   ⚠️ 语言切换不用在这里处理 —— store 内部 watch 了 i18n locale，
      会清缓存并重取已订阅的模块，chapters 作为 computed 自动跟着变。 */
const content = useContentStore();
const chapters = computed(() => (kind.value === 'personal' ? content.logsPersonal : content.logsUpdate));

/* 当前语言没翻译、回退了默认语言时的轻量提示（取第一条即可） */
const fallbackTip = computed(() => {
  const first = chapters.value[0];
  return first ? content.fallbackNotice(first) : '';
});

function switchKind(k) { kind.value = k; }
onMounted(async () => { await content.ensure('logs'); loading.value = false; });
</script>

<template>
  <main class="logs-wrap">
    <section class="glass section-block">
      <div class="section-head">
        <h2>
          {{ t('ebookTitle') }}
          <button v-if="user.isOwner" type="button" class="owner-add" @click="goManage('logs')">{{ t('logsManage') }}</button>
        </h2>
      </div>
      <p class="section-sub">{{ t('ebookSub') }}</p>
      <div class="logs-tabs">
        <button type="button" class="logs-tab" :class="{ on: kind === 'update' }" @click="switchKind('update')">{{ t('ebookTitle') }}</button>
        <button type="button" class="logs-tab" :class="{ on: kind === 'personal' }" @click="switchKind('personal')">{{ t('logsPersonal') }}</button>
      </div>

      <p v-if="fallbackTip" class="content-fallback-tip">{{ fallbackTip }}</p>
      <p v-if="loading" class="block-empty">…</p>
      <p v-else-if="!chapters.length" class="block-empty">{{ t('ebookEmpty') }}</p>

      <template v-else>
        <!-- 目录 -->
        <article v-for="c in chapters" :id="'ch' + c.id" :key="c.id" class="ebook-chapter">
          <h3>{{ c.title }}</h3>
          <p class="ebook-date">{{ fmtDate(c.updated_at) }}</p>
          <p class="ebook-body">{{ c.content }}</p>
        </article>
      </template>

      <button type="button" class="item-go" @click="goBack">← {{ tc('cBack') }}</button>
    </section>
  </main>
</template>
