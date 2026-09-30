/* ==========================================================================
 * src/stores/admin/identity.js —— 「我是谁 / 我有什么权限」
 *
 * 原 stores/admin.js 的「身份」段落。只放状态与派生状态，不发请求；
 * 拉取与跳转由 index.js 的 init() 编排（那里是组合根，能看到所有领域）。
 * ========================================================================== */
import { ref, computed } from 'vue';

export function useIdentity(t) {
  const me = ref(null);
  const ready = ref(false);          // 权限校验完成
  const isOwner = computed(() => !!me.value && me.value.role === 'owner');
  const adminSub = computed(() =>
    me.value
      ? t('currentAccount') + me.value.username +
        (me.value.role === 'owner' ? t('roleOwnerSuffix') : t('roleAdminSuffix'))
      : '',
  );

  return { me, ready, isOwner, adminSub };
}
