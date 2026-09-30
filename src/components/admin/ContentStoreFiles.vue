<script setup>
/* ==========================================================================
 * ContentStoreFiles.vue —— 后台内容面板的「存储文件」区（从 ContentPanel 拆出）
 *
 * 展示某个模块对应 Supabase 桶里**实际存在**的文件，并可逐个删除。
 * 典型用途：换图 / 删记录之后清理残留的孤儿文件。
 *
 * ⚠️ 删文件不会动数据库行；行里若还引用着它，前台会裂图（确认框里已提示）。
 *
 * 模板是从父组件逐字节搬过来的（连变量名都没改），状态与操作在
 * useContentStoreBrowser 里 —— 本组件只负责渲染。
 * ========================================================================== */
import { useI18n } from '@/i18n';
import { fmtSize } from './content-panel-logic';
import { useContentStoreBrowser } from '@/composables/useContentStoreBrowser';

const props = defineProps({
  /** 该模块对应的 Supabase 桶；空数组时整块不渲染 */
  storeBuckets: { type: Array, default: () => [] },
});

const { t } = useI18n('admin');
const { t: tc } = useI18n('common');

const { storeOpen, storeBusy, storeFiles, toggleStore, delFile } =
  useContentStoreBrowser(() => props.storeBuckets, { t });
</script>

<template>
    <div v-if="storeBuckets.length" class="cf-store">
      <div class="cf-store-head">
        <span class="cf-hint">{{ t('cfStoreFiles') }} · {{ storeBuckets.join(' / ') }}</span>
        <el-button size="small" :disabled="storeBusy" @click="toggleStore">
          {{ storeOpen ? tc('cClose') : t('cfStoreView') }}
        </el-button>
      </div>
      <template v-if="storeOpen">
        <p v-if="!storeFiles.length && !storeBusy" class="cf-msg">{{ t('cfStoreEmpty') }}</p>
        <ul v-else class="cf-list">
          <li v-for="f in storeFiles" :key="f.bucket + '/' + f.name" class="cf-row">
            <span class="cf-row-title cf-ellipsis" :title="f.name">{{ f.name }}</span>
            <span class="cf-badges"><span class="cf-badge">{{ fmtSize(f.size) }}</span></span>
            <span class="cf-actions">
              <el-button size="small" type="danger" :disabled="storeBusy" @click="delFile(f.bucket, f.name)">{{ tc('cDelete') }}</el-button>
            </span>
          </li>
        </ul>
      </template>
    </div>
</template>

<style scoped>
.cf-hint { font-size: 0.75rem; opacity: 0.55; }
.cf-msg { margin: 0; font-size: 0.8125rem; opacity: 0.8; }
.cf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; min-width: 0; }
/* ⚠️ min-width: 0 是关键：grid/flex 子项默认 min-width:auto = 内容宽度，
   长标题会撑爆父级 .cf-modal，让 ellipsis 完全失效。显式归零才能让
   标题/输入框真的按 ellipsis 截断，而不是把整行推出窗口外。 */
.cf-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 10px; min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(255, 255, 255, 0.02);
}
.cf-store { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.cf-store-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cf-row-title { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; }
.cf-badges { display: flex; gap: 4px; flex: none; }
.cf-badge {
  padding: 1px 6px; border-radius: 999px; font-size: 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.16); opacity: 0.4;
}
.cf-badge.on { border-color: var(--accent); color: var(--accent); opacity: 1; }
.cf-actions { display: flex; gap: 6px; flex: none; }
.cf-ellipsis { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
