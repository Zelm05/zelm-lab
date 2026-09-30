/* ==========================================================================
 * useContentStoreBrowser.js —— 「存储文件」区的状态与操作（从 ContentPanel 拆出）
 *
 * 干什么：列出某个模块对应 Supabase 桶里的实际对象（名字 / 大小 / 时间），并允许删除。
 *   典型用途是清理「换图 / 删记录之后残留的孤儿文件」。
 *
 * ⚠️ 删文件**不会动数据库行**。行里若还引用着它，前台会裂图 —— 所以删除前走
 *    全站统一的确认弹窗，文案里带上桶名与文件名。
 *
 * 归属：这是「存储桶浏览」这一件事的全部逻辑，和内容列表 / 编辑器无关，
 *   所以单独成 composable，由 ContentStoreFiles.vue 消费。
 * ========================================================================== */
import { ref, watch } from 'vue';
import { zelmConfirm } from '@/modules/confirm';
import { deleteObject, listObjects } from '@/lib/supabase';

/**
 * @param {() => string[]} buckets 当前模块对应的桶列表（getter，随模块切换而变化）
 * @param {object} [opts]
 * @param {(key: string) => string} [opts.t] 取文案（确认弹窗用）；缺省原样返回键名
 */
export function useContentStoreBrowser(buckets, opts = {}) {
  const t = opts.t || ((key) => key);
  const storeOpen = ref(false);
  const storeBusy = ref(false);
  const storeFiles = ref([]);   /* [{ bucket, name, size, updated }] */

  /* 切换模块 → 收起列表并清空缓存（避免看到上一个模块的文件） */
  watch(buckets, () => { storeOpen.value = false; storeFiles.value = []; });

  async function toggleStore() {
    storeOpen.value = !storeOpen.value;
    if (storeOpen.value) await loadStore();
  }

  async function loadStore() {
    const list = buckets() || [];
    if (!list.length) return;
    storeBusy.value = true;
    const out = [];
    for (const b of list) {
      for (const it of await listObjects(b)) out.push({ bucket: b, name: it.name, size: it.size, updated: it.updated });
    }
    out.sort((a, x) => a.name < x.name ? -1 : 1);
    storeFiles.value = out;
    storeBusy.value = false;
  }

  async function delFile(bucket, name) {
    const ok = await zelmConfirm(t('cfStoreDelConfirm') + '\n' + bucket + ' / ' + name);
    if (!ok) return;
    storeBusy.value = true;
    await deleteObject(bucket, name);
    await loadStore();
  }

  return { storeOpen, storeBusy, storeFiles, toggleStore, loadStore, delFile };
}
