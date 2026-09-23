<script setup>
/* ==========================================================================
 * MessageBoard.vue —— 留言板（响应式重写）
 *
 * 原实现（src/modules/community.js，已删除）是纯命令式：
 *   每次数据变化都 list.innerHTML = shown.map(模板串).join('') 重刷整段，
 *   交互靠 document 级事件委托 + data-* 属性反查。
 * 现在改成：
 *   数据 → ref/computed，列表 → v-for，交互 → @click，
 *   展开/收起/排序/分页/点赞态/回复草稿全部是响应式状态。
 *
 * 对外接口不变：/api/messages 系列 + /api/feedbacks(kind=report) 举报。
 * 无障碍与 id 保留原站 id（#messages / #msgSortBar / #msgPostBox / #msgInput /
 * #msgSend / #msgList / #msgReplies<id> / #msgReplyInput<id>）。
 * ========================================================================== */
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from '@/i18n';
import { useUserStore } from '@/stores/user';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { AuthPanel } from '@/modules/auth-panel';
import { zelmConfirm } from '@/modules/confirm';
import { getJSON, postJSON, delJSON } from '@/api/http';
import { apiErr, showToast } from '@/modules/toast';
import { fmtTime } from '@/core/format';

const { t } = useI18n('community');
const user = useUserStore();
const cfg = useSiteCfgStore();

const PAGE_SIZE = 5;

const list = ref([]);
const canDelete = ref(false);
const hasLoginFlag = ref(false);
const loading = ref(true);
const failed = ref(false);

const sort = ref('time');        // time=最新优先 | likes=最热优先
const collapsed = ref(true);     // 抽屉：默认只显示 2 条
const page = ref(1);

const draft = ref('');
const sending = ref(false);

const expanded = reactive({});      // msgId -> 回复区是否展开
const expandedAll = reactive({});   // msgId -> 是否展开全部回复
const replyDrafts = reactive({});   // msgId -> { text, parentReplyId, parentName }
const busy = reactive({});          // 'like:1' / 'reply:1' -> 请求中

const total = computed(() => list.value.length);
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const curPage = computed(() => Math.min(Math.max(page.value, 1), pages.value));
const sorted = computed(() => {
  const arr = list.value.slice();
  if (sort.value === 'likes') arr.sort((a, b) => (b.likes - a.likes) || (b.id - a.id));
  else arr.sort((a, b) => b.id - a.id);
  return arr;
});
const shown = computed(() => {
  if (collapsed.value) return sorted.value.slice(0, 2);
  const start = (curPage.value - 1) * PAGE_SIZE;
  return sorted.value.slice(start, start + PAGE_SIZE);
});

const postPlaceholder = computed(() =>
  (cfg.messageLoginRequired ? t('msgPlaceholder') : t('msgPlaceholderGuest')));
const openAllText = computed(() => t('openAll', { n: String(total.value) }));
const pageInfoText = computed(() => t('pageInfo', { page: String(curPage.value), pages: String(pages.value) }));

/** 发表/点赞是否要求登录，由站长在管理台配置（Cookie 首屏即同步） */
function requireLogin(kind) {
  const need = kind === 'like' ? cfg.likeLoginRequired : cfg.messageLoginRequired;
  if (!need) return true;
  if (!user.isLoggedIn) { AuthPanel.open('login'); return false; }
  return true;
}

async function load() {
  loading.value = true;
  try {
    const res = await getJSON('/api/messages');
    if (!res.ok || !res.data) { failed.value = true; return; }
    failed.value = false;
    list.value = res.data.messages || [];
    canDelete.value = !!res.data.can_delete;
    hasLoginFlag.value = res.data.login_required !== undefined;
    // 为每条留言准备回复草稿（v-model 需要对象已存在）
    list.value.forEach((m) => {
      if (!replyDrafts[m.id]) replyDrafts[m.id] = { text: '', parentReplyId: null, parentName: '' };
    });
  } catch (e) {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function doSend() {
  const content = draft.value.trim();
  if (!content) return;
  if (!requireLogin('message')) return;
  sending.value = true;
  const res = await postJSON('/api/messages', { content });
  sending.value = false;
  if (res.ok) { draft.value = ''; await load(); }
  else apiErr(res.data && res.data.error, t('loadFail'));
}

function setSort(s) {
  if (s !== 'time' && s !== 'likes') return;
  sort.value = s;
  page.value = 1;
}

function expandList() { collapsed.value = false; page.value = 1; }
function collapseList() { collapsed.value = true; }

function visibleReplies(m) {
  const all = m.replies || [];
  return expandedAll[m.id] ? all : all.slice(0, 3);
}
function replyMoreText(m) { return t('replyMore', { n: String((m.replies || []).length) }); }
function replyPlaceholder(id) {
  const d = replyDrafts[id];
  return (d && d.parentReplyId) ? t('replyTo', { name: '@' + (d.parentName || '') }) : t('replyPh');
}

function setReplyTarget(m, r) {
  const d = replyDrafts[m.id];
  if (!d) return;
  d.parentReplyId = r.id;
  d.parentName = r.username;
  const el = document.getElementById('msgReplyInput' + m.id);
  if (el) el.focus();
}

async function postReply(m) {
  if (!requireLogin('message')) return;
  const d = replyDrafts[m.id];
  const content = ((d && d.text) || '').trim();
  if (!content) { apiErr(t('emptyContent')); return; }
  busy['reply:' + m.id] = true;
  const res = await postJSON('/api/messages/' + m.id + '/replies', {
    content,
    parent_reply_id: d.parentReplyId ? Number(d.parentReplyId) : null,
  });
  busy['reply:' + m.id] = false;
  if (res.ok) { d.text = ''; d.parentReplyId = null; d.parentName = ''; await load(); }
  else apiErr(res.data && res.data.error, t('loadFail'));
}

async function toggleLike(m) {
  if (!requireLogin('like')) return;
  busy['like:' + m.id] = true;
  const res = await postJSON('/api/messages/' + m.id + '/like', {});
  busy['like:' + m.id] = false;
  if (!res.ok) { apiErr(res.data && res.data.error, t('loadFail')); return; }
  // 与原实现一致：重载列表刷新点赞数与状态（排序 / 抽屉 / 页码保持不变）
  await load();
}

async function deleteMsg(m) {
  if (!(await zelmConfirm(t('delMsg')))) return;
  const res = await delJSON('/api/messages/' + m.id);
  if (res.ok) await load();
  else apiErr(res.data && res.data.error, t('loadFail'));
}

async function deleteReply(m, r) {
  if (!(await zelmConfirm(t('delReplyConfirm')))) return;
  const res = await delJSON('/api/messages/' + m.id + '/replies/' + r.id);
  if (res.ok) await load();
  else apiErr(res.data && res.data.error, t('loadFail'));
}

/** 举报违规留言：写入反馈系统（kind=report），管理员在反馈列表处置 */
async function doReport(m) {
  if (!user.isLoggedIn) { AuthPanel.open('login'); return; }
  if (!(await zelmConfirm(t('reportConfirm')))) return;
  const res = await postJSON('/api/feedbacks', {
    kind: 'report',
    content: t('reportPrefix') + '#' + m.id,
  });
  if (res.ok) showToast(t('reportOk'));
  else apiErr(res.data && res.data.error, t('loadFail'));
}

onMounted(load);
</script>

<template>
  <section id="messages" class="glass section-block">
    <div class="section-head">
      <h2 v-text="t('messagesTitle')"></h2>
      <div id="msgSortBar" class="msg-sort">
        <el-button size="small" data-sort="time" @click="setSort('time')">{{ t('sortLatest') }}</el-button>
        <el-button size="small" data-sort="likes" @click="setSort('likes')">{{ t('sortLikes') }}</el-button>
      </div>
    </div>

    <div id="msgPostBox">
      <div class="msg-post">
        <el-input
id="msgInput" v-model="draft" maxlength="500"
               :placeholder="postPlaceholder" @keydown.enter.prevent="doSend" />
        <el-button
id="msgSend" size="small" :disabled="sending"
                @click="doSend">{{ t('post') }}</el-button>
      </div>
    </div>

    <div id="msgList">
      <p v-if="failed" class="fb-empty" v-text="t('loadFailMsg')"></p>
      <p v-else-if="!loading && !total" class="fb-empty" v-text="t('emptyMsg')"></p>
      <template v-else>
        <div v-for="m in shown" :key="m.id" class="msg-item">
          <div class="msg-meta">
            <span class="msg-author" v-text="m.username"></span>
            <span class="msg-time" v-text="fmtTime(m.created_at)"></span>
          </div>
          <p class="msg-content" v-text="m.content"></p>
          <div class="msg-actions">
            <el-button
size="small" :data-like="m.id"
                    :disabled="busy['like:' + m.id]" @click="toggleLike(m)"
                   >{{ (m.liked ? t('liked') : t('like')) + ' ' + m.likes }}</el-button>
            <el-button
size="small" :data-reply-toggle="m.id"
                    @click="expanded[m.id] = !expanded[m.id]"
                   >{{ '💬 ' + (m.reply_count || 0) }}</el-button>
            <el-button
v-if="canDelete" size="small" :data-delmsg="m.id"
                    @click="deleteMsg(m)">{{ t('del') }}</el-button>
            <el-button v-if="hasLoginFlag && user.isLoggedIn" size="small" :data-report="m.id" :title="t('reportTip')" @click="doReport(m)"
                   >{{ t('reportBtn') }}</el-button>
          </div>

          <div v-show="expanded[m.id]" :id="'msgReplies' + m.id" class="msg-replies">
            <div class="reply-form">
              <el-input
:id="'msgReplyInput' + m.id" v-model="replyDrafts[m.id].text"
                     maxlength="500" :placeholder="replyPlaceholder(m.id)"
                     @keydown.enter.prevent="postReply(m)" />
              <el-button
size="small" :data-reply-send="m.id"
                      :disabled="busy['reply:' + m.id]" @click="postReply(m)"
                     >{{ t('replySend') }}</el-button>
            </div>
            <div v-if="visibleReplies(m).length" class="reply-list">
              <div
v-for="r in visibleReplies(m)" :key="r.id"
                   class="reply-item" :class="{ 'reply-sub': r.parent_reply_id }">
                <div class="reply-meta">
                  <span class="reply-author" v-text="r.username"></span>
                  <span class="reply-time" v-text="fmtTime(r.created_at)"></span>
                </div>
                <p class="reply-content" v-text="r.content"></p>
                <div class="reply-actions">
                  <el-button
size="small" class="reply-link" :data-reply-target="r.id" :data-reply-msg="m.id"
                          type="button" @click="setReplyTarget(m, r)">{{ t('reply') }}</el-button>
                  <el-button
v-if="r.is_mine || canDelete" size="small" class="reply-link danger"
                          :data-reply-del="r.id" :data-reply-msg="m.id" type="button"
                          @click="deleteReply(m, r)">{{ t('delReply') }}</el-button>
                </div>
              </div>
            </div>
            <el-button
v-if="!expandedAll[m.id] && (m.replies || []).length> 3" size="small" class="msg-collapse-btn"
                    :data-reply-more="m.id" type="button" @click="expandedAll[m.id] = true"
                   >{{ replyMoreText(m) }}</el-button>
          </div>
        </div>

        <div v-if="!collapsed && pages > 1" class="msg-pager">
          <el-button
size="small" :data-msg-page="curPage - 1" :disabled="curPage <= 1"
                  @click="page = curPage - 1">{{ t('prevPage') }}</el-button>
          <span class="pager-info" v-text="pageInfoText"></span>
          <el-button
size="small" :data-msg-page="curPage + 1" :disabled="curPage>= pages"
                  @click="page = curPage + 1">{{ t('nextPage') }}</el-button>
        </div>
        <el-button
v-if="collapsed && total> 2" size="small" class="msg-collapse-btn" data-msg-drawer type="button"
                @click="expandList">{{ openAllText }}</el-button>
        <el-button
v-else-if="!collapsed && total> 2" size="small" class="msg-collapse-btn" data-msg-collapse
                type="button" @click="collapseList">{{ t('collapse') }}</el-button>
      </template>
    </div>
  </section>
</template>
