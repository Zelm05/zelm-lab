/* ==========================================================================
 * useAboutPhotoWall.js —— 「关于我」页照片墙的生命周期
 *
 * 从 AboutView.vue 抽出来（原第 62–71 / 173–196 / 204–214 / 274–278 行）。
 *
 * ⚠️ 为什么 wallEl 必须由调用方传进来（而不是本文件自己 `ref(null)`）：
 *   `ref="wallEl"` 写在 AboutView 的模板里，模板 ref 只在**持有该模板的组件**
 *   setup 里被填充。如果把 ref 声明搬进 composable 而模板留在视图，
 *   视图的模板会去绑定一个不存在的 setup 变量 → 静默失效；
 *   反过来若把模板也搬进子组件，父组件的 ref 会永远是 null。
 *   两种情况都不会报错，只会表现为「照片墙永远不出现」——所以这里显式注入。
 *
 * 保留的三条原有行为（都是有原因的，别简化）：
 *   ① 站长关闭照片墙时不建墙、也不空转 rAF（容器宽高恒为 0，建了也没用）
 *   ② 等照片数据有结果再挂载：否则会先用回落照片(1 张)建墙，数据回来才变 18 张
 *   ③ 容器尺寸没就绪时 initDriftWall 返回 null → 下一帧再试
 * ========================================================================== */
import { ref, watch, nextTick, onUnmounted } from 'vue';
import { useAboutStore } from '@/stores/about';
import { useContentStore } from '@/stores/content';
import { resolveAssetUrl } from '@/lib/supabase';
import { initDriftWall } from '@/modules/photo-wall';

/**
 * @param {import('vue').Ref<HTMLElement|null>} wallEl 照片墙容器（模板 ref，由视图传入）
 */
export function useAboutPhotoWall(wallEl) {
  const a = useAboutStore();
  const content = useContentStore();

  const wallLoaded = ref(false);   /* 数据是否已拉过：避免先挂载空墙 -> 回落成 1 张的闪烁 */
  const wallPhotos = ref([]);
  const wallTitles = ref([]);

  let wallRaf = 0;
  let wallDestroy = null;

  function unmountWall() {
    if (wallRaf) { cancelAnimationFrame(wallRaf); wallRaf = 0; }
    if (wallDestroy) { wallDestroy(); wallDestroy = null; }
  }

  function mountWall() {
    unmountWall();
    // 站长关闭照片墙时板块本身不显示，容器宽高恒为 0 —— 不建、也不空转 rAF
    if (!a.photoWallOn) return;
    /* 等照片数据有结果再挂载：否则会先用回落照片(1 张)建墙，数据回来才变 18 张 */
    if (!wallLoaded.value) return;
    const el = wallEl.value;
    if (!el) return;
    // 容器尺寸还没就绪（刚解除 hidden）时返回 null，下一帧再试
    const destroy = initDriftWall(el, { onBreakpoint: mountWall, photos: wallPhotos.value, titles: wallTitles.value });
    if (!destroy) { wallRaf = requestAnimationFrame(mountWall); return; }
    wallDestroy = destroy;
  }

  /* 照片墙与简历：统一走内容 store（/api/content/photos|resume?lang=），
     失败时 store 返回空 → 这里保持原状，回落硬编码照片 / 占位文案。 */
  async function loadWall() {
    await content.ensure('photos');
    const list = content.photos || [];
    /* ⚠️ 无条件赋值：之前写成 `if (list.length)`，导致**把照片删光后墙还挂着已删的图**
       （旧值没被清掉）。清空后 initDriftWall 会自动回落到内置的兜底照片。 */
    wallPhotos.value = list.map((it) => resolveAssetUrl(it.storage_path, 'photos'));
    wallTitles.value = list.map((it) => it.title || '');
    wallLoaded.value = true;
  }

  /* 进入正文后才建墙（隐藏时容器宽高为 0，建了也没用） */
  watch(() => a.showMain, async (on) => {
    if (!on) return;
    await nextTick();
    mountWall();
  });
  /* 语言切换后照片标题会变 → 重建墙（store 会先按新语言重取，这里跟着刷新） */
  watch(() => content.photos, () => { if (a.showMain) loadWall(); });
  /* 照片异步到达后重建墙（否则首次 mount 时列表还是空的） */
  watch(wallPhotos, () => { if (a.showMain) mountWall(); });
  watch(wallLoaded, () => { if (a.showMain) mountWall(); });

  /* 卸载时拆墙（原 AboutView 的 onUnmounted 里与 clearTimeout(flashTimer) 并列） */
  onUnmounted(unmountWall);

  return { wallLoaded, wallPhotos, wallTitles, loadWall, mountWall, unmountWall };
}
