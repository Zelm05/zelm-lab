<script setup>
/* ==========================================================================
 * FeedbackPanel.vue —— 反馈建议（待回复优先）
 *
 * 原实现把整份列表拼成 HTML 字符串塞进 #fbList，回复框是 <textarea data-reply="id">，
 * 提交时再 querySelector 回查那个 textarea 取值。现在回复草稿直接以
 * id → 文本 存在 store 里，textarea 用 v-model 双向绑定。
 *
 * 顺带修掉原站一处缺陷：原脚本调用了 buildPager('fbPager', …)，
 * 但页面上从来没有 #fbPager 这个元素，所以反馈列表实际上只能看到前 3 条待回复、
 * 无法翻页。这里把分页器补上了。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { useAdminStore } from '@/stores/admin';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const a = useAdminStore();
const { t } = useI18n('admin');

/* 自定义翻页（替换 el-pagination，与首页 / 用户列表同一套 UI） */
const FB_PAGE_SIZE = 3;
const totalPages = computed(() => Math.max(1, Math.ceil(a.fbTotal / FB_PAGE_SIZE)));
const pageNumbers = computed(() => {
  const n = totalPages.value;
  const cur = a.fbPage;
  let start = Math.max(1, cur - 2);
  const end = Math.min(n, start + 4);
  start = Math.max(1, end - 4);
  const out = [];
  for (let p = start; p <= end; p += 1) out.push(p);
  return out;
});

/* 跳转输入框（与首页 page-jump 同一交互） */
const jumpVal = ref('');
function onJump() {
  const n = Number(jumpVal.value);
  if (!Number.isFinite(n) || n < 1) { jumpVal.value = ''; return; }
  a.pickFbPage(Math.min(Math.max(1, Math.trunc(n)), totalPages.value));
  jumpVal.value = '';
}
</script>

<template>
  <div id="fbPanel" class="panel">
    <div class="panel-head">
      <span class="panel-title">{{ t('panelFb') }}</span>
      <span id="fbNote" class="panel-title-note">{{ a.fbNote }}</span>
      <el-button id="fbRefreshBtn" size="small" :title="t('refresh')" :aria-label="t('refresh')" @click="a.refreshFb()">
        ↻
      </el-button>
    </div>

    <!-- 加载中 -->
    <div v-if="a.fbLoading" class="state show">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else id="fbList" class="fb-list">
      <el-empty v-if="!a.fbItems.length" :description="t('noData')" />

      <!-- 每条反馈一张卡片：原 .fb-item → el-card -->
      <el-card v-for="f in a.fbItems" :key="f.id" class="fb-item" shadow="never">
        <template #header>
          <div class="fb-head">
            <span class="fb-user">{{ f.username || t('anonymous') }}</span>
            <el-tag :type="f.kind === 'suggestion' ? 'success' : 'warning'" size="small" effect="plain">
              {{ a.fbKindLabel(f.kind) }}
            </el-tag>
            <span class="fb-time">{{ fmtTime(f.created_at) }}</span>
            <el-button size="small" type="danger" plain @click="a.deleteFb(f)">{{ t('fbDel') }}</el-button>
          </div>
        </template>

        <div class="fb-content">{{ f.content }}</div>

        <!-- 已回复：只读展示；未回复：草稿框 + 回复按钮 -->
        <div v-if="f.reply" class="fb-reply">
          <span class="fb-reply-prefix">{{ t('repliedPrefix') }}</span>{{ f.reply }}
        </div>
        <div v-else class="fb-reply-box">
          <el-input
            v-model="a.fbDrafts[f.id]"
            type="textarea"
            :rows="2"
            :placeholder="t('replyPlaceholder')"
            resize="none"
          />
          <el-button
            size="small"
            type="primary"
            :loading="a.fbReplying === f.id"
            style="margin-top:6px"
            @click="a.replyFb(f)"
          >{{ t('fbReply') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 翻页：与首页 / 用户列表同一套 UI -->
    <div v-if="!a.fbLoading" id="fbPager" class="admin-pager">
      <button
type="button" class="page-btn" :disabled="a.fbPage <= 1"
        :aria-label="t('prevPage')" @click="a.pickFbPage(a.fbPage - 1)">‹</button>
      <button
        v-for="p in pageNumbers"
        :key="p"
        type="button"
        class="page-btn page-num"
        :class="{ active: p === a.fbPage }"
        :aria-current="p === a.fbPage ? 'page' : undefined"
        @click="a.pickFbPage(p)"
      >{{ p }}</button>
      <button
type="button" class="page-btn" :disabled="a.fbPage >= totalPages"
        :aria-label="t('nextPage')" @click="a.pickFbPage(a.fbPage + 1)">›</button>
      <span class="page-jump">
        <input
          v-model.number="jumpVal"
          type="number"
          :min="1"
          :max="totalPages"
          :placeholder="String(a.fbPage)"
          :aria-label="t('jumpAria')"
          @keydown.enter.prevent="onJump"
        />
        <button type="button" class="page-jump-btn" @click="onJump">{{ t('jumpBtn') }}</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ===== 翻页：与首页（快捷网页 / 资源下载）完全同一套 UI ===== */
.admin-pager {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.page-btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted, #9db8b2);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--accent, #4ff0d0);
  color: var(--accent, #4ff0d0);
  background: color-mix(in srgb, var(--accent, #4ff0d0) 8%, transparent);
}
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-num.active {
  border-color: var(--accent, #4ff0d0);
  background: var(--accent, #4ff0d0);
  color: #062018;
  font-weight: 700;
}
.page-btn:focus-visible { outline: 2px solid var(--accent, #4ff0d0); outline-offset: 1px; }
.page-jump {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin-left: 8px;
  border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
  background: rgba(255, 255, 255, 0.04);
  border-radius: 18px;
  overflow: hidden;
  height: 36px;
}
.page-jump input {
  width: 56px;
  height: 100%;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--text, #e8fbf7);
  font-family: inherit;
  font-size: 0.875rem;
  text-align: center;
  outline: none;
}
.page-jump input::placeholder { color: var(--muted, #9db8b2); opacity: 0.6; }
.page-jump input::-webkit-outer-spin-button,
.page-jump input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.page-jump input[type="number"] { -moz-appearance: textfield; }
.page-jump-btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  height: 100%;
  padding: 0 14px;
  border: none;
  border-radius: 0 18px 18px 0;
  background: color-mix(in srgb, var(--accent, #4ff0d0) 12%, transparent);
  color: var(--accent, #4ff0d0);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.page-jump-btn:hover { background: color-mix(in srgb, var(--accent, #4ff0d0) 22%, transparent); }

.fb-item { margin-bottom: 12px; }
.fb-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fb-head .fb-time { margin-left: auto; opacity: .6; font-size: 0.75rem; }
.fb-content { white-space: pre-wrap; line-height: 1.6; color: var(--text); }
.fb-reply { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); opacity: .85; }
.fb-reply-prefix { color: var(--accent); margin-right: 4px; }
.fb-reply-box { margin-top: 8px; }
</style>
