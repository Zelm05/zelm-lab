/* ==========================================================================
 * src/stores/admin/index.js —— 管理控制台状态（组合根）
 *
 * 原实现在 src/modules/pages/admin.js（972 行命令式脚本）里：
 *   - 用户表每次刷新都拼一整段 HTML 字符串塞进 tbody，操作列里嵌着 6 层嵌套三元
 *     表达式决定"这个按钮该不该出现"（角色 / 是否本人 / 是否站长 / 是否在线…）
 *   - 站点设置 8 个开关各自 addEventListener，然后靠 renderCfg() 反手把所有
 *     DOM 再刷一遍（值 + 状态文案 + 分段高亮 + 只读禁用，全在一个函数里）
 *   - 分页器用 document.createElement 手搓
 * 现在：数据在 store 里，权限判断收敛成纯函数，视图只负责把结果渲染出来。
 *
 * P1-3 拆分：这个文件原本是 552 行的单文件 store，现按领域拆成同目录下 4 个
 * 领域模块 + 1 个纯逻辑模块 + 1 个共享提示条，本文件只负责组装：
 *   logic.js     纯函数（权限矩阵 / 徽章 / 分页窗口 / 接口映射），零依赖、可 node 单测
 *   toast.js     全局提示条（跨领域共享）
 *   identity.js  我是谁 / 我有什么权限
 *   users.js     用户列表 + 用户操作 + 一次性明文弹窗
 *   feedback.js  反馈建议
 *   site-cfg.js  站点设置 + 清除缓存 + 关于页密码
 * 对外 API 与拆分前**逐键一致**，5 个消费方（AdminView.vue 与 admin/ 下 4 个面板）
 * 无需任何改动。init() 放在这里，因为只有组合根能同时看到全部领域。
 *
 * 保留的原站行为（逐条核对过）：
 *   - 站长（owner）账号不可被任何人修改；管理员之间不能互相操作，
 *     仅站长能授予 / 撤销管理员、删除用户、重置管理员密码、踢下线、查看密码
 *   - 统计卡片始终是全站总数，不随筛选 / 搜索 / 分页变化
 *   - 401 → 回欢迎页；403 → 显示 403 提示；其它错误 → 显示重试
 *   - 站点设置：非站长只读（可看不可改），改动立即回写 Cookie，
 *     音乐播放器开关即时作用于外壳
 * ========================================================================== */
import { defineStore } from 'pinia';
import { getJSON } from '@/api/http';
import { shell } from '@/core/shell';
import { useI18n } from '@/i18n';
import { useToast } from './toast';
import { useIdentity } from './identity';
import { useUsers } from './users';
import { useFeedback } from './feedback';
import { useSiteCfg } from './site-cfg';

export const useAdminStore = defineStore('admin', () => {
  const { t } = useI18n('admin');

  /* 组装顺序即依赖顺序：toast → identity → site-cfg → users → feedback。
     · users 需要 identity 的 me/isOwner 做权限判断；
     · feedback 需要 users 的 stats 写 stats.pending；
     · site-cfg 只依赖 toast，放在 users 之前无特别含义，纯粹是依赖最少者优先。
     全部为单向依赖，无循环。 */
  const { toast, showToast } = useToast();
  const identity = useIdentity(t);
  const siteCfg = useSiteCfg({ t, showToast });
  const users = useUsers({ t, me: identity.me, isOwner: identity.isOwner, showToast });
  const feedback = useFeedback({ t, showToast, stats: users.stats });

  /* ---------------- 返回上一页 ---------------- */
  function back() {
    if (window.history.length > 1) window.history.back();
    else shell.goPage('home');
  }

  /* ---------------- 初始化：先确认自己是管理员 ---------------- */
  async function init() {
    const res = await getJSON('/api/me');
    if (!res.ok || !res.data) { shell.goPage('gate'); return; }
    const d = res.data;
    if (d.role !== 'admin' && d.role !== 'owner') { shell.goPage('home'); return; }
    identity.me.value = d;
    identity.ready.value = true;
    siteCfg.cfgReadOnly.value = d.role !== 'owner';
    siteCfg.cfgVisible.value = d.role === 'owner' || d.role === 'admin';
    siteCfg.loadSiteCfg();
    users.loadUsers();
    feedback.loadFbStats();
    feedback.loadFeedbacks();
  }

  return {
    // 身份
    ...identity,
    // 用户
    ...users,
    // 反馈
    ...feedback,
    // 站点设置（含 apw）
    ...siteCfg,
    // 提示条
    toast,
    // 编排
    init, back, showToast,
  };
});
