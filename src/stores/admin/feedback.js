/* ==========================================================================
 * src/stores/admin/feedback.js —— 反馈建议领域
 *
 * 原 stores/admin.js 的「反馈建议」段落。
 * stats 由 users 领域持有（统计卡是用户列表的），这里只往 stats.pending 写，
 * 属单向依赖，不构成循环。
 * ========================================================================== */
import { ref, reactive, computed } from 'vue';
import { getJSON, postJSON, delJSON } from '@/api/http';
import { zelmConfirm } from '@/modules/confirm';
import { pagerOf, fbKindLabel as logicFbKindLabel } from './logic';

const FB_PAGE_SIZE = 3;

export function useFeedback({ t, showToast, stats }) {
  const fbItems = ref([]);
  const fbPage = ref(1);
  const fbTotal = ref(0);
  const fbPending = ref(0);
  const fbLoading = ref(true);
  const fbDrafts = reactive({});     // id → 回复草稿
  const fbReplying = ref(0);         // 正在提交回复的反馈 id

  const fbPager = computed(() => pagerOf(fbTotal.value, fbPage.value, FB_PAGE_SIZE));
  const fbPagerInfo = computed(() => t('pagerInfo', { total: fbTotal.value, page: fbPage.value, pages: fbPager.value.pages }));
  /** 反馈面板标题右侧的「待回复 N 条」 */
  const fbNote = computed(() => (fbPending.value > 0 ? t('fbNoteTpl', { n: fbPending.value }) : '—'));

  /** 反馈条目的类型徽章文案 */
  const fbKindLabel = (kind) => logicFbKindLabel(kind, t);

  async function loadFbStats() {
    const res = await getJSON('/api/admin/feedbacks?page=' + fbPage.value + '&pageSize=' + FB_PAGE_SIZE);
    if (res.ok && res.data && res.data.stats) stats.pending = res.data.stats.pending || 0;
  }
  async function loadFeedbacks() {
    fbLoading.value = true;
    const res = await getJSON('/api/admin/feedbacks?pending=1&page=' + fbPage.value + '&pageSize=' + FB_PAGE_SIZE);
    fbLoading.value = false;
    if (!res.ok || !res.data || !res.data.items) { fbItems.value = []; fbTotal.value = 0; return; }
    const d = res.data;
    fbItems.value = d.items;
    fbTotal.value = d.total || d.items.length;
    fbPending.value = (d.stats && d.stats.pending) || 0;
  }
  function pickFbPage(p) { fbPage.value = p; return loadFeedbacks(); }
  function refreshFb() { fbPage.value = 1; loadFeedbacks(); loadFbStats(); }

  async function deleteFb(f) {
    if (!(await zelmConfirm(t('confirmDelFb')))) return;
    const res = await delJSON('/api/admin/feedbacks/' + f.id);
    if (res.ok) { showToast(t('deleted')); loadFeedbacks(); loadFbStats(); }
    else showToast((res.data && res.data.error) || t('opFail'), true);
  }
  async function replyFb(f) {
    const text = (fbDrafts[f.id] || '').trim();
    if (!text) { showToast(t('replyEmpty'), true); return; }
    fbReplying.value = f.id;
    const res = await postJSON('/api/admin/feedbacks/' + f.id + '/reply', { reply: text });
    if (res.ok) { showToast(t('replied')); loadFeedbacks(); loadFbStats(); }
    else showToast((res.data && res.data.error) || t('opFail'), true);
    fbReplying.value = 0;
  }

  return {
    fbItems, fbPage, fbTotal, fbPending, fbLoading, fbDrafts, fbReplying,
    fbPager, fbPagerInfo, fbKindLabel, fbNote,
    loadFeedbacks, loadFbStats, pickFbPage, refreshFb, deleteFb, replyFb,
  };
}
