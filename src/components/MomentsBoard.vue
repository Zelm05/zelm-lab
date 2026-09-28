<script setup>
/* ==========================================================================
 * MomentsBoard.vue —— 动态板块（前台，关于页；数据来自 /api/content/moments，支持多语言）
 * 站长在前台点「＋ 发布」就地添加；站长也可删除（含 Supabase 附件）。
 * 2026-09-28 重构：附件不再贴缩略图/图标贴片，改为正文下方的文字按钮
 * （查看 PDF / 查看图片 / 查看文件），点击打开对应查看器：
 *   PDF → 同源代理 iframe 预览（复用简历预览方案，避免 Supabase XFO 拦截）
 *   图片 → 大图查看器（点击在适应窗口/原始尺寸间切换）
 *   其他 → 新窗口打开（同源代理，国内直连 Supabase 不稳）
 * ========================================================================== */
import { ref, computed, onMounted } from 'vue';
import { useManageDialog } from '@/composables/useManageDialog';
import { useDialog } from '@/composables/useDialog';
import { useUserStore } from '@/stores/user';
import { resolveAssetUrl, proxyFileUrl } from '@/core/supabase';
import { attachmentsOf, fileKind, kindI18nKey, fileNameOf, fileIconOf } from '@/core/moment-attachments';
import { useContentStore } from '@/stores/content';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const { t } = useI18n('home');
const { t: tc } = useI18n('common');
const user = useUserStore();
const loading = ref(true);
/* 站长的「管理」按钮：在当前页就地弹出内容管理面板（不跳转 /admin） */
const { openManage } = useManageDialog();
function goManage(mod) { openManage(mod); }

/* 数据来自内容 store（多语言：/api/content/moments?lang=xx）。
   ⚠️ 语言切换不用在这里处理 —— store 内部 watch 了 i18n locale，
      会清缓存并重取已订阅的模块，items 作为 computed 自动跟着变。 */
const content = useContentStore();
const items = computed(() => content.moments);

/* 当前语言没翻译、回退了默认语言时的轻量提示（取第一条即可） */
const fallbackTip = computed(() => {
  const first = items.value[0];
  return first ? content.fallbackNotice(first) : '';
});

onMounted(async () => { await content.ensure('moments'); loading.value = false; });

/* ---- 附件：文字按钮 + 查看器 ---- */
function viewLabel(p) { return t(kindI18nKey(fileKind(p))); }

/* 查看器状态：null=关闭；{ kind:'pdf'|'img', url, name } */
const viewer = ref(null);
const zoomed = ref(false);
function openView(p) {
  const kind = fileKind(p);
  /* 其他类型：不开查看器，直接新窗口打开（同源代理 → 国内网络更稳） */
  if (kind === 'file') {
    window.open(proxyFileUrl(p, 'moments'), '_blank', 'noopener');
    return;
  }
  zoomed.value = false;
  viewer.value = {
    kind,
    /* PDF 必须走同源代理（Supabase 带 X-Frame-Options: DENY，直连会被拦）；
       <img> 标签不受 XFO 限制，图片走公开直链即可。 */
    url: kind === 'pdf' ? proxyFileUrl(p, 'moments') : resolveAssetUrl(p, 'moments'),
    name: fileNameOf(p),
  };
}
function closeViewer() { viewer.value = null; zoomed.value = false; }
const ovEl = ref(null);
/* Esc 关闭 + 焦点陷阱 + 关闭后焦点归还（与简历/证书弹窗同一套无障碍行为） */
useDialog(() => !!viewer.value, { onClose: closeViewer, panelRef: ovEl });
</script>

<template>
  <section id="moments" class="about-section">
    <h2>
      {{ t('momentsTitle') }}
      <button v-if="user.isOwner" type="button" class="owner-add" @click="goManage('moments')">{{ t('momentsManage') }}</button>
    </h2>
    <p class="section-sub">{{ t('momentsSub') }}</p>

    <p v-if="fallbackTip" class="content-fallback-tip">{{ fallbackTip }}</p>
    <p v-if="loading" class="block-empty">…</p>
    <p v-else-if="!items.length" class="block-empty">{{ t('momentsEmpty') }}</p>

    <ul v-else class="moments-list">
      <li v-for="m in items" :key="m.id" class="moment-item">
        <div class="moment-main">
          <p class="moment-content">{{ m.content }}</p>
          <!-- 附件按钮行：固定在正文下方（2026-09-28），按类型显示不同文案 -->
          <div v-if="attachmentsOf(m).length" class="moment-attachments">
            <button
              v-for="(p, i) in attachmentsOf(m)" :key="i"
              type="button" class="moment-file-btn"
              :title="fileNameOf(p)" @click="openView(p)"
            >
              <span class="moment-file-btn-icon" aria-hidden="true">{{ fileIconOf(p) }}</span>{{ viewLabel(p) }}
            </button>
          </div>
          <p class="moment-meta">
            {{ fmtTime(m.created_at) }}<template v-if="m.location"> · {{ m.location }}</template>
          </p>
        </div>
      </li>
    </ul>

    <!-- 附件查看器：PDF 内嵌预览 / 图片大图（Teleport 到全局遮罩层，避免被父级 overflow 裁剪） -->
    <Teleport to="#overlayRoot">
      <div v-if="viewer" class="moment-viewer-ov" @click.self="closeViewer">
        <div ref="ovEl" class="moment-viewer" role="dialog" aria-modal="true" :aria-label="viewer.name || t('momentsTitle')">
          <button type="button" class="moment-viewer-close" :aria-label="tc('cClose')" @click="closeViewer">✕</button>
          <iframe
            v-if="viewer.kind === 'pdf'" class="moment-viewer-frame"
            :src="viewer.url" :title="viewer.name"
          ></iframe>
          <template v-else>
            <!-- 图片大图：点击在「适应窗口 / 原始尺寸」间切换（移动端放大会出滚动条） -->
            <img
              class="moment-viewer-img" :class="{ 'moment-viewer-img--zoom': zoomed }"
              :src="viewer.url" :alt="viewer.name" @click="zoomed = !zoomed"
            />
            <p class="moment-viewer-name">{{ viewer.name }}</p>
          </template>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* 查看器遮罩 + 面板：颜色全走 CSS 变量（深浅主题 / 配色方案自动跟随） */
.moment-viewer-ov { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  padding:20px; background:rgba(0,0,0,.6); }
.moment-viewer { position:relative; width:min(860px,94vw); height:min(86vh,900px);
  display:flex; flex-direction:column; overflow:auto; padding:14px;
  background:var(--surface); border:1px solid var(--border); border-radius:18px;
  box-shadow:var(--shadow); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); }
.moment-viewer-close { position:absolute; top:10px; right:10px; z-index:2; width:32px; height:32px;
  display:flex; align-items:center; justify-content:center; border-radius:50%;
  border:1px solid var(--border); background:var(--surface); color:inherit;
  font-size:0.9rem; line-height:1; cursor:pointer; transition:all .18s; }
.moment-viewer-close:hover { border-color:color-mix(in srgb, var(--accent) 55%, transparent); color:var(--accent); }
.moment-viewer-frame { flex:1; width:100%; border:none; border-radius:12px; background:transparent; }
.moment-viewer-img { max-width:100%; max-height:78vh; margin:auto; border-radius:10px;
  cursor:zoom-in; object-fit:contain; }
.moment-viewer-img--zoom { max-width:none; max-height:none; cursor:zoom-out; }
.moment-viewer-name { margin:8px 0 0; font-size:0.75rem; opacity:.6; text-align:center;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* 手机端：遮罩内边距收窄，面板贴边少留白 */
@media (max-width:640px) {
  .moment-viewer-ov { padding:10px; }
  .moment-viewer { padding:10px; border-radius:14px; }
}
</style>
