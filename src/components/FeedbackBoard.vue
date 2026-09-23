<script setup>
/* ==========================================================================
 * FeedbackBoard.vue —— 反馈建议（响应式重写）
 *
 * 原实现（src/modules/community.js 内的 renderFeedbackBox / loadMyFeedbacks /
 * loadAdminFeedbacks / bindFbTabs）用同一段 innerHTML 模板串重刷整个盒子，
 * 管理员与普通用户两个分支各自拼字符串、各自绑事件。
 * 现在拆成两套「状态 + 模板」：
 *   管理员 → 统计 + 三个筛选片 + 列表（可回复 / 删除）
 *   普通用户 / 游客 → 提交表单 + 我的提交（折叠 + 分页）
 * 权限判断来自 stores/user，不再依赖 DOM 里是否存在某个元素。
 *
 * 接口不变：POST /api/feedbacks、GET /api/feedbacks/my、
 *          GET /api/admin/feedbacks、POST|DELETE /api/admin/feedbacks/:id[/reply]
 * 保留原站 id：#feedbacks / #fbBox / #fbStats / #fbAdminList / #fbMyList /
 * #fbForm / #fbContent / #fbReply<id>
 * ========================================================================== */
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { useUserStore } from '@/stores/user';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { AuthPanel } from '@/modules/auth-panel';
import { zelmConfirm } from '@/modules/confirm';
import { getJSON, postJSON, delJSON } from '@/api/http';
import { apiErr } from '@/modules/toast';
import { fmtTime } from '@/core/format';

const { t } = useI18n('community');
const user = useUserStore();
const cfg = useSiteCfgStore();

const PAGE_SIZE = 5;

/* ---------- 普通用户 / 游客 ---------- */
const fbDraft = ref('');
const submitting = ref(false);
const myItems = ref([]);
const myFailed = ref(false);
const myCollapsed = ref(true);   // 默认只展示 2 条
const myPage = ref(1);

/* ---------- 管理员 ---------- */
const kind = ref('all');         // all | feedback | suggestion
const adminItems = ref([]);
const adminFailed = ref(false);
const stats = ref(null);
const replyDrafts = reactive({}); // fbId -> 输入中的回复
const busy = reactive({});

const myTotal = computed(() => myItems.value.length);
const myPages = computed(() => Math.max(1, Math.ceil(myTotal.value / PAGE_SIZE)));
const myCurPage = computed(() => Math.min(Math.max(myPage.value, 1), myPages.value));
const myShown = computed(() => {
  if (myCollapsed.value) return myItems.value.slice(0, 2);
  const start = (myCurPage.value - 1) * PAGE_SIZE;
  return myItems.value.slice(start, start + PAGE_SIZE);
});

const statsText = computed(() => t('stats', {
  total: String((stats.value && stats.value.total) || 0),
  pending: String((stats.value && stats.value.pending) || 0),
}));
const myOpenAllText = computed(() => t('openAll', { n: String(myTotal.value) }));
const myPageInfoText = computed(() => t('pageInfo', { page: String(myCurPage.value), pages: String(myPages.value) }));

/** 提交反馈同样受「需要登录」开关约束（与原 requireLogin('message') 一致） */
function ensureLogin() {
  if (!cfg.messageLoginRequired) return true;
  if (!user.isLoggedIn) { AuthPanel.open('login'); return false; }
  return true;
}

async function submit(k) {
  if (!ensureLogin()) return;
  const content = fbDraft.value.trim();
  if (!content) { apiErr(t('emptyContent')); return; }
  submitting.value = true;
  const res = await postJSON('/api/feedbacks', { kind: k, content });
  submitting.value = false;
  if (res.ok) { fbDraft.value = ''; await loadMine(); }
  else apiErr(res.data && res.data.error, t('loadFail'));
}

async function loadMine() {
  try {
    const res = await getJSON('/api/feedbacks/my');
    if (!res.ok || !res.data) { myFailed.value = true; return; }
    myFailed.value = false;
    myItems.value = res.data.items || [];
  } catch (e) {
    myFailed.value = true;
  }
}

async function loadAdmin(k) {
  const url = '/api/admin/feedbacks' + (k && k !== 'all' ? '?kind=' + k : '');
  try {
    const res = await getJSON(url);
    if (!res.ok || !res.data) { adminFailed.value = true; return; }
    adminFailed.value = false;
    adminItems.value = res.data.items || [];
    stats.value = res.data.stats || null;
    adminItems.value.forEach((f) => { if (!(f.id in replyDrafts)) replyDrafts[f.id] = ''; });
  } catch (e) {
    adminFailed.value = true;
  }
}

function setKind(k) {
  kind.value = k;
  loadAdmin(k);
}

async function sendReply(f) {
  const reply = String(replyDrafts[f.id] || '').trim();
  if (!reply) { apiErr(t('emptyReply')); return; }
  busy['reply:' + f.id] = true;
  const res = await postJSON('/api/admin/feedbacks/' + f.id + '/reply', { reply });
  busy['reply:' + f.id] = false;
  if (res.ok) { replyDrafts[f.id] = ''; await loadAdmin(kind.value); }
  else apiErr(res.data && res.data.error, t('loadFail'));
}

async function removeFb(f) {
  if (!(await zelmConfirm(t('delFb')))) return;
  const res = await delJSON('/api/admin/feedbacks/' + f.id);
  if (res.ok) await loadAdmin(kind.value);
  else apiErr(res.data && res.data.error, t('loadFail'));
}

/* 登录态是异步拉取的（App.vue onMounted），所以按角色变化重新初始化，
   而不是在 onMounted 里一次性判断——否则首帧永远是「未登录」分支。 */
watch(
  [() => user.loaded, () => user.isLoggedIn, () => user.isAdmin],
  () => {
    if (!user.loaded) return;
    if (user.isAdmin) loadAdmin(kind.value);
    else if (user.isLoggedIn) loadMine();
    else { myItems.value = []; adminItems.value = []; }
  },
  { immediate: true },
);
</script>

<template>
  <section id="feedbacks" class="glass section-block">
    <div class="section-head">
      <h2 v-text="t('feedbacksTitle')"></h2>
    </div>

    <div id="fbBox">
      <!-- ===== 管理员：全部记录，可回复 / 删除 ===== -->
      <template v-if="user.isAdmin">
        <div id="fbStats" class="fb-stats" v-text="statsText"></div>
        <div class="fb-tabs">
          <el-button
size="small" class="fb-tab" :class="{ active: kind === 'all' }" data-fbkind="all"
                  type="button" @click="setKind('all')">{{ t('all') }}</el-button>
          <el-button
size="small" class="fb-tab" :class="{ active: kind === 'feedback' }" data-fbkind="feedback"
                  type="button" @click="setKind('feedback')">{{ t('feedback') }}</el-button>
          <el-button
size="small" class="fb-tab" :class="{ active: kind === 'suggestion' }" data-fbkind="suggestion"
                  type="button" @click="setKind('suggestion')">{{ t('suggestion') }}</el-button>
        </div>
        <div id="fbAdminList">
          <p v-if="adminFailed" class="fb-empty" v-text="t('loadFail')"></p>
          <p v-else-if="!adminItems.length" class="fb-empty" v-text="t('noRecords')"></p>
          <div v-for="f in adminItems" :key="f.id" class="fb-item">
            <div class="fb-meta">
              <span
class="fb-badge" :class="f.kind"
                    v-text="f.kind === 'feedback' ? t('feedback') : t('suggestion')"></span>
              <span class="msg-author" v-text="f.username"></span>
              <span class="msg-time" v-text="fmtTime(f.created_at)"></span>
            </div>
            <p class="fb-content" v-text="f.content"></p>
            <div v-if="f.reply" class="fb-reply">
              <b v-text="t('replied')"></b><span v-text="f.reply"></span>
              <div style="opacity:.55;margin-top:4px;font-size:.75rem" v-text="fmtTime(f.replied_at)"></div>
            </div>
            <div class="fb-reply-form">
              <el-input :id="'fbReply' + f.id" v-model="replyDrafts[f.id]" :placeholder="t('replyPh')" />
              <el-button
size="small" :data-reply="f.id"
                      :disabled="busy['reply:' + f.id]" @click="sendReply(f)"
                     >{{ f.reply ? t('updateReply') : t('replyBtn') }}</el-button>
            </div>
            <div class="msg-actions" style="margin-top:8px">
              <el-button
size="small" :data-fbdel="f.id"
                      @click="removeFb(f)">{{ t('del') }}</el-button>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== 普通用户 / 游客：提交 + 我的提交 ===== -->
      <template v-else>
        <form id="fbForm" class="fb-form" @submit.prevent>
          <el-input
id="fbContent" v-model="fbDraft" type="textarea"
                    maxlength="1000" :placeholder="t('fbTextarea')" />
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <el-button
size="small" type="submit" data-kind="feedback" :disabled="submitting"
                    @click="submit('feedback')">{{ t('submitFeedback') }}</el-button>
            <el-button
size="small" type="submit" data-kind="suggestion" :disabled="submitting"
                    @click="submit('suggestion')">{{ t('submitSuggestion') }}</el-button>
          </div>
        </form>

        <div v-if="user.isLoggedIn" id="fbMyList">
          <p v-if="myFailed" class="fb-empty" v-text="t('loadFail')"></p>
          <p v-else-if="!myTotal" class="fb-empty" v-text="t('noFb')"></p>
          <template v-else>
            <div v-for="f in myShown" :key="f.id" class="fb-item">
              <div class="fb-meta">
                <span
class="fb-badge" :class="f.kind"
                      v-text="f.kind === 'feedback' ? t('feedback') : t('suggestion')"></span>
                <span class="msg-time" v-text="fmtTime(f.created_at)"></span>
              </div>
              <p class="fb-content" v-text="f.content"></p>
              <div v-if="f.reply" class="fb-reply">
                <b v-text="t('adminReply')"></b><span v-text="f.reply"></span>
                <div style="opacity:.55;margin-top:4px;font-size:.75rem" v-text="fmtTime(f.replied_at)"></div>
              </div>
              <p v-else class="fb-reply-empty" v-text="t('waitReply')"></p>
            </div>

            <div v-if="!myCollapsed && myPages > 1" class="msg-pager">
              <el-button
size="small" :data-fb-page="myCurPage - 1"
                      :disabled="myCurPage <= 1" @click="myPage = myCurPage - 1"
                     >{{ t('prevPage') }}</el-button>
              <span class="pager-info" v-text="myPageInfoText"></span>
              <el-button
size="small" :data-fb-page="myCurPage + 1"
                      :disabled="myCurPage>= myPages" @click="myPage = myCurPage + 1"
                     >{{ t('nextPage') }}</el-button>
            </div>
            <el-button
v-if="myCollapsed && myTotal> 2" size="small" class="msg-collapse-btn" data-fb-drawer
                    type="button" @click="myCollapsed = false; myPage = 1"
                   >{{ myOpenAllText }}</el-button>
            <el-button
v-else-if="!myCollapsed && myTotal> 2" size="small" class="msg-collapse-btn"
                    data-fb-collapse type="button" @click="myCollapsed = true"
                   >{{ t('collapse') }}</el-button>
          </template>
        </div>
      </template>
    </div>
  </section>
</template>
