<script setup>
/* ==========================================================================
 * HomeView.vue —— 主站
 *
 * 原状：本视图只是「原 home.html 标记 + initHome() 桥接」——标记照搬，行为全在
 *   src/modules/pages/home.js（3354 行）里用 getElementById + innerHTML 驱动。
 * 现在：页面由若干组件拼成，状态归各自的 store：
 *     SideNav            左侧导航（锚点滚动 / 汉堡菜单 / 滚动隐藏）
 *     QuickLinks         快捷网页（筛选 / 搜索 / 分页 / 增删改）
 *     Resources          资源下载（同上 + 富详情）
 *     Games              小游戏（外壳；引擎在 modules/games/index.js）
 *     MessageBoard / FeedbackBoard   留言板 / 反馈建议（第 2 批已组件化）
 *     SettingsPanel      设置弹窗（主站 / 关于我共用）+ 两个专属分组插槽
 *     DonateModal / AboutPwModal / ParticleBg  浮层与背景
 *     StarField / FooterContacts     与关于页共用的背景与页脚
 *
 * 文案全部走 packs/home.js（t()）。注意：原站 applyLang() 会用词典覆盖标记里的
 * 文本，所以页面实际显示的是**词典**里的句子 —— 本视图按词典取值，而不是照抄
 * 旧标记里的那份中文（两处并不完全一致，见 REWRITE_PLAN 的保真说明）。
 * ========================================================================== */
import { ref, onMounted, onUnmounted } from 'vue';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { useContentStore } from '@/stores/content';
import { useUserStore } from '@/stores/user';
import { useSettingsStore } from '@/stores/settings';
import { usePageMeta } from '@/composables/usePageMeta';
import { useI18n } from '@/core/i18n';
import { shell } from '@/core/shell';

import StarField from '@/components/StarField.vue';
import FooterContacts from '@/components/FooterContacts.vue';
import EpLocaleProvider from '@/components/EpLocaleProvider.vue';
import SettingsPanel from '@/components/SettingsPanel.vue';
import MessageBoard from '@/components/MessageBoard.vue';
import FeedbackBoard from '@/components/FeedbackBoard.vue';
import SideNav from '@/components/home/SideNav.vue';
import QuickLinks from '@/components/home/QuickLinks.vue';
import Resources from '@/components/home/Resources.vue';
import Games from '@/components/home/Games.vue';
import ParticleBg from '@/components/home/ParticleBg.vue';
import DonateModal from '@/components/home/DonateModal.vue';
import ProjectGrid from '@/components/ProjectGrid.vue';
import AboutPwModal from '@/components/home/AboutPwModal.vue';
import SettingsAccount from '@/components/home/SettingsAccount.vue';
import SettingsData from '@/components/home/SettingsData.vue';


const cfg = useSiteCfgStore();
/* 站点头像统一走内容 store（后台「关于我」可换）；未上传时回落到内置图 */
const content = useContentStore();
content.ensure('about');
const user = useUserStore();
const st = useSettingsStore();
const { t } = useI18n('home');
/* P3-6：头像 alt 走 common 命名空间（跨页面共用文案） */
const { t: tc } = useI18n('common');
usePageMeta('home');

/* 登录态由 App.vue 统一拉取（拉 /api/me + 监听 zelm:login），这里不再重复请求 */

/* ---------------- 登出（原站：清 Cookie 后整页刷新） ---------------- */
async function onLogout() {
  await user.logout();
  window.location.reload();
}
function onAdmin(e) {
  e.preventDefault();
  shell.goPage('admin');
}

/* ---------------- 访客统计（仅访问量计数，无个人信息） ---------------- */
const VISIT_KEY = 'zelm_visits';
const visitorCount = ref(0);
function initVisitorCount() {
  let n = 0;
  try { n = parseInt(localStorage.getItem(VISIT_KEY), 10) || 0; } catch (e) { /* 忽略 */ }
  if (!st.s.visitorCount) return;
  let counted = false;
  try { counted = sessionStorage.getItem('zelm_visit_counted') === '1'; } catch (e) { /* 忽略 */ }
  if (!counted) {
    n++;
    try {
      localStorage.setItem(VISIT_KEY, String(n));
      sessionStorage.setItem('zelm_visit_counted', '1');
    } catch (e) { /* 忽略 */ }
  }
  visitorCount.value = n;
}

/* ---------------- 外链新开标签页（事件委托，切换即时生效） ---------------- */
function onDocClickExternal(e) {
  if (!st.s.externalBlank) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank') return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#') || href.startsWith('mailto:')) return;
  try {
    const h = new URL(a.href, location.href).hostname;
    if (h && h !== location.hostname) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  } catch (err) { /* 忽略非法链接 */ }
}

/* ---------------- 弹窗 ---------------- */
const donateOpen = ref(false);
const aboutPw = ref(null);

/* ---------------- 项目作品 ----------------
 * 卡片网格 + 详情弹窗 + 打赏提示都已抽到 @/components/ProjectGrid.vue，
 * 数据源在 @/data/projects.js —— 关于页（AboutView）用的是同一个组件与同一份数据，
 * 所以两边天然同步，不会再各写一份然后漂移。
 * 这里只保留「打赏弹窗」的开关（打赏提示被点击时由组件 emit('donate') 触发）。 */

onMounted(() => {
  initVisitorCount();
  document.addEventListener('click', onDocClickExternal);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClickExternal);
});
</script>

<template>
<!-- P1-5：Element Plus 内置文案（表格空态 / 下拉无数据 / 骨架屏 aria…）跟随界面语言。
     该组件不产生任何 DOM，包裹后页面结构与布局不变；子节点缩进保持原样以缩小 diff。 -->
<EpLocaleProvider>
  <div class="bg-layer"></div>
  <div class="overlay" :style="{ opacity: st.s.overlay / 100, '--fade-to': st.s.overlay / 100 }"></div>
  <StarField />

  <!-- 左侧导航栏 -->
  <SideNav />

  <header class="site-header">
    <div class="header-top">
      <div class="brand-col">
        <div class="brand">
          <span class="brand-icon">◉</span>
          <span class="brand-text">Zelm</span>
        </div>
      </div>
      <div class="header-right">
        <div id="userBox" class="user-box">
          <span v-show="!user.isLoggedIn" id="guestBox" class="guest-btns">
            <el-button id="guestLogin" size="small" data-auth-open="login">{{ t('loginBtn') }}</el-button>
            <el-button id="guestRegister" size="small" data-auth-open="register">{{ t('registerBtn') }}</el-button>
          </span>
          <span v-show="user.isLoggedIn" id="userInfo" class="user-info">
            <span id="userName" class="user-name">{{ user.name }}</span>
            <button v-show="user.isAdmin" id="adminBtn" type="button" class="user-admin" @click="onAdmin">{{ t('adminBtnLabel') }}</button>
            <el-button id="userLogout" size="small" class="user-logout" type="button" @click="onLogout">{{ t('logoutBtn') }}</el-button>
          </span>
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <section id="home" class="intro glass hero">
      <h1>{{ t('introTitle') }}</h1>
      <p>{{ t('introText') }}</p>
    </section>

    <!-- ===== 关于我 ===== -->
    <section v-show="cfg.homeAboutOn" id="about" class="glass section-block">
      <div class="section-head">
        <h2>{{ t('aboutTitle') }}</h2>
      </div>
      <p class="section-sub">{{ t('aboutSub') }}</p>
      <div class="about-grid">
        <div class="about-card glass-inner">
          <h3>📖 <span>{{ t('aboutBioTitle') }}</span></h3>
          <p>{{ t('aboutBio') }}</p>
        </div>
      </div>
      <!-- 入口：完整关于我（作品集）独立页，需登录 + 每次输入密码 -->
      <div class="about-more">
        <button id="aboutEnterBtn" type="button" class="about-enter-btn" @click="aboutPw.enter()">
          📖 <span>{{ t('aboutMore') }}</span> <span class="about-enter-arrow">→</span>
        </button>
      </div>
    </section>

    <!-- ===== 项目作品（紧跟在「关于我」之后，导航栏同步有入口） ===== -->
    <section id="projects" class="glass section-block">
      <div class="section-head">
        <h2>{{ t('projectsTitle') }}</h2>
      </div>
      <p class="section-sub">{{ t('projectsSub') }}</p>
      <!-- 首页带打赏提示（donate）；关于页用同一组件但不开打赏 -->
      <ProjectGrid :donate="true" @donate="donateOpen = true" />
    </section>

    <!-- ===== 工具合集（快捷网页 / 资源下载 / 小游戏） ===== -->
    <div id="tools" class="tools-wrap">
      <QuickLinks />
      <Resources />
      <Games />
    </div><!-- /#tools 工具合集 -->

    <!-- ===== 留言板（响应式组件，自己拉 /api/messages） ===== -->
    <MessageBoard />

    <!-- ===== 反馈建议（响应式组件，按角色渲染管理员 / 普通用户视图） ===== -->
    <FeedbackBoard />
  </main>

  <!-- 设置弹窗（主站：带访客统计 + 账号安全 / 数据管理 / 数据统计三个专属分组） -->
  <SettingsPanel :visitor="true" :visitor-count="visitorCount">
    <SettingsAccount />
    <SettingsData />
  </SettingsPanel>

  <!-- 今日运势浮动按钮 + 弹窗 -->

  <!-- 头像查看大图弹窗。
       ⚠ 死 UI：原站 home.html 里有这套标记，但自始至终没有任何打开它的入口
       （唯一的绑定写在 gate.js 里，而 gate 页根本没有 #avatarViewer）。
       按「不擅自删除原站内容」保留标记，未加交互。 -->
  <div id="avatarViewer" class="avatar-viewer" hidden>
    <div class="avatar-viewer-overlay"></div>
    <div class="avatar-viewer-content">
      <el-button id="avatarViewerClose" size="small" class="avatar-viewer-close" :aria-label="t('detailClose')">×</el-button>
      <img class="avatar-viewer-img" :src="content.avatarUrl" :alt="tc('avatarAlt')" width="256" height="256" />
      <div class="avatar-viewer-actions">
        <a class="avatar-viewer-save" :href="content.avatarUrl" download="Zelm-avatar.jpg">
          ⬇ {{ t('saveAvatar') }}
        </a>
      </div>
    </div>
  </div>

  <!-- 简约粒子背景（由设置控制显隐） -->
  <ParticleBg />

  <footer class="site-footer">
    <el-button id="donateBtn" class="donate-btn" size="small" :title="t('donateTitle')" @click="donateOpen = true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      <span>{{ t('donateLabel') }}</span>
    </el-button>
    <FooterContacts ns="home" />
    <p>{{ t('footer', { year: new Date().getFullYear() }) }}</p>
    <p class="footer-disclaimer">{{ t('footerDisclaimer') }}</p>
    <p class="footer-legal">
      <a href="#/privacy">{{ t('linkPrivacy') }}</a>
      <span aria-hidden="true"> · </span>
      <a href="#/privacy/t">{{ t('linkTerms') }}</a>
      <span aria-hidden="true"> · </span>
      <span>{{ t('copyrightContact') }}</span>：<a href="mailto:yz050930@gmail.com">yz050930@gmail.com</a>
    </p>
  </footer>

  <!-- 打赏弹窗 -->
  <DonateModal v-model:open="donateOpen" />

  <!-- 关于页访问密码弹窗（未登录先弹登录框） -->
  <AboutPwModal ref="aboutPw" />
</EpLocaleProvider>
</template>

<!-- 样式原在 src/styles/pages/home.css，已合并进本组件 -->
<style>
/* 来自 home.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
/* 预加载背景色，避免页面跳转时白屏闪烁 */
    html:where([data-page="home"]) { background-color: #061814; }
    :where(html[data-page="home"]) body { background-color: #061814; }
    /* 强制隐藏属性生效：避免作者样式的 display 覆盖 [hidden]（如 .guest-btns/.user-info） */
    :where(html[data-page="home"]) [hidden] { display: none !important; }
    :where(html[data-page="home"]) .user-box { display:flex; align-items:center; gap:10px; }
    :where(html[data-page="home"]) .guest-btns { display:inline-flex; gap:8px; }
    :where(html[data-page="home"]) .user-btn { background:transparent; border:1px solid color-mix(in srgb, var(--accent) 40%, transparent); color:var(--accent); padding:4px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-family:inherit; transition:all .2s; display:inline-flex; align-items:center; height:30px; box-sizing:border-box; white-space:nowrap; }
    :where(html[data-page="home"]) .user-btn:hover { background:color-mix(in srgb, var(--accent) 12%, transparent); box-shadow:0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
    :where(html[data-page="home"]) .user-info { display:inline-flex; align-items:center; gap:8px; }
    :where(html[data-page="home"]) .user-name { color:var(--accent); font-weight:600; font-size:14px; white-space:nowrap; }
    :where(html[data-page="home"]) .user-logout { background:transparent; border:1px solid rgba(255,255,255,.25); color:#e2e8f0; padding:0 12px; border-radius:8px; cursor:pointer; font-size:13px; height:30px; box-sizing:border-box; display:inline-flex; align-items:center; white-space:nowrap; }
    :where(html[data-page="home"]) .user-logout:hover { border-color:var(--accent); color:var(--accent); }
    :where(html[data-page="home"]) .user-admin { background:transparent; border:1px solid color-mix(in srgb, var(--accent) 40%, transparent); color:var(--accent); padding:0 12px; border-radius:8px; cursor:pointer; font-size:13px; text-decoration:none; display:inline-flex; align-items:center; height:30px; box-sizing:border-box; white-space:nowrap; }
    :where(html[data-page="home"]) .user-admin:hover { box-shadow:0 0 10px color-mix(in srgb, var(--accent) 35%, transparent); }
    /* ===== 留言板 / 反馈建议 ===== */
    :where(html[data-page="home"]) .msg-post { display:flex; gap:10px; margin-bottom:18px; }
    :where(html[data-page="home"]) .msg-input { flex:1; min-width:0; padding:10px 14px; border-radius:11px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-size:.9rem; font-family:inherit; outline:none; transition:border-color .2s, box-shadow .2s; }
    :where(html[data-page="home"]) .msg-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
    /* 留言板按钮重设（2026-09-25 第六批）：真按钮是 el-button（MessageBoard.vue），
     * 用 html:root 提权；旧的 .msg-btn/.like-btn 等类在 DOM 中不存在，已删。 */
    html:root #msgSend { border:none; border-radius:999px; height:40px; padding:0 20px; background:linear-gradient(135deg,color-mix(in srgb, var(--accent) 92%, transparent),color-mix(in srgb, var(--accent-2) 92%, transparent)); color:#022; font-weight:700; letter-spacing:1px; transition:transform .15s, box-shadow .2s; }
    html:root #msgSend:hover { transform:translateY(-1px); box-shadow:0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent); }
    html:root #msgSend:disabled { opacity:.55; transform:none; box-shadow:none; }
    html:root .msg-sort .el-button.is-active, html:root .msg-sort .el-button[data-sort].is-active { border-color:var(--accent); color:var(--accent); }
    html:root .msg-like { color:#7dd3c8; }
    html:root .msg-like:hover { border-color:#7dd3c8; color:#7dd3c8; }
    html:root .msg-like.liked { background:rgba(244,114,182,.14); border-color:#f472b6; color:#f472b6; }
    html:root .msg-actions .el-button.msg-report { color:#facc15; }
    html:root .msg-actions .el-button.msg-report:hover { border-color:rgba(250,204,21,.5); color:#facc15; }
    html:root .msg-actions .el-button[data-delmsg] { color:#f87171; }
    html:root .msg-actions .el-button[data-delmsg]:hover { background:rgba(248,113,113,.12); border-color:#f87171; }
    :where(html[data-page="home"]) .msg-item { padding:14px 4px; border-bottom:1px dashed rgba(255,255,255,.08); }
    :where(html[data-page="home"]) .msg-meta { display:flex; align-items:center; gap:8px; font-size:.8rem; flex-wrap:wrap; }
    :where(html[data-page="home"]) .msg-author { color:var(--accent); font-weight:600; }
    :where(html[data-page="home"]) .msg-time { opacity:.5; }
    :where(html[data-page="home"]) .msg-content { margin:6px 0 0; font-size:0.9rem; line-height:1.6; word-break:break-word; }
    :where(html[data-page="home"]) .msg-actions { margin-top:8px; display:flex; gap:10px; align-items:center; }
    /* 卡片改 flex 列：按钮排吸底 → 一排 4 张卡的按钮在同一条线上（2026-09-25 第六批） */
    :where(html[data-page="home"]) .quick-card, :where(html[data-page="home"]) .resource-card { display:flex; flex-direction:column; }
    :where(html[data-page="home"]) .card-actions { display:flex; align-items:center; gap:8px; margin-top:auto; padding-top:12px; }
    :where(html[data-page="home"]) .card-actions .item-pin, :where(html[data-page="home"]) .card-actions .item-del { position:static; opacity:1; }
    :where(html[data-page="home"]) .item-go { display:inline-flex; align-items:center; justify-content:center; height:36px; padding:0 16px; border-radius:999px; border:none; background:linear-gradient(135deg,color-mix(in srgb, var(--accent) 90%, transparent),color-mix(in srgb, var(--accent-2) 90%, transparent)); color:#022; font-size:0.875rem; font-weight:700; font-family:inherit; text-decoration:none; cursor:pointer; transition:transform .15s, box-shadow .2s; }
    :where(html[data-page="home"]) .item-go:hover { transform:translateY(-1px); box-shadow:0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent); }
    /* ===== 留言回复 ===== */
    :where(html[data-page="home"]) .msg-replies { margin-top:10px; padding:12px 14px; border-radius:12px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); }
    :where(html[data-page="home"]) .reply-form { display:flex; gap:8px; margin-bottom:10px; }
    :where(html[data-page="home"]) .reply-form input { flex:1; min-width:0; padding:7px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-size:0.875rem; font-family:inherit; outline:none; }
    :where(html[data-page="home"]) .reply-form input:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
    :where(html[data-page="home"]) .reply-send { padding:0 16px; font-size:.8rem; }
    :where(html[data-page="home"]) .reply-list { display:flex; flex-direction:column; gap:4px; }
    :where(html[data-page="home"]) .reply-item { padding:8px 10px; border-radius:10px; background:rgba(255,255,255,.03); }
    :where(html[data-page="home"]) .reply-item.reply-sub { margin-left:16px; background:color-mix(in srgb, var(--accent) 5%, transparent); }
    :where(html[data-page="home"]) .reply-meta { display:flex; align-items:center; gap:8px; font-size:0.75rem; flex-wrap:wrap; }
    :where(html[data-page="home"]) .reply-author { color:var(--accent); font-weight:600; }
    :where(html[data-page="home"]) .reply-time { opacity:.5; }
    :where(html[data-page="home"]) .reply-content { margin:4px 0 0; font-size:0.875rem; line-height:1.55; word-break:break-word; }
    :where(html[data-page="home"]) .reply-actions { margin-top:6px; display:flex; gap:10px; }
    :where(html[data-page="home"]) .reply-link { border:none; background:none; color:var(--accent); font-size:0.75rem; font-family:inherit; cursor:pointer; padding:0; opacity:.85; }
    :where(html[data-page="home"]) .reply-link:hover { opacity:1; text-decoration:underline; }
    :where(html[data-page="home"]) .reply-link.danger { color:#f87171; }
    html:where([data-page="home"])[data-theme="light"] .msg-replies { background:rgba(45,122,90,.05); border-color:rgba(45,122,90,.12); }
    html:where([data-page="home"])[data-theme="light"] .reply-form input { background:rgba(255,255,255,.7); border-color:rgba(45,122,90,.18); color:#143325; }
    html:where([data-page="home"])[data-theme="light"] .reply-form input:focus { border-color:#2d7a5a; box-shadow:0 0 0 3px rgba(45,122,90,.12); }
    html:where([data-page="home"])[data-theme="light"] .reply-item { background:rgba(45,122,90,.04); }
    html:where([data-page="home"])[data-theme="light"] .reply-item.reply-sub { background:rgba(45,122,90,.07); }
    html:where([data-page="home"])[data-theme="light"] .reply-btn { border-color:rgba(45,122,90,.2); }
    :where(html[data-page="home"]) .fb-tabs { display:inline-flex; background:rgba(255,255,255,.07); border-radius:999px; padding:3px; gap:3px; border:1px solid color-mix(in srgb, var(--accent) 18%, transparent); margin-bottom:14px; }
    :where(html[data-page="home"]) .fb-tab { border:none; background:none; color:rgba(255,255,255,.6); font-size:0.875rem; font-weight:600; font-family:inherit; padding:6px 18px; border-radius:999px; cursor:pointer; transition:all .2s; }
    :where(html[data-page="home"]) .fb-tab.active { background:linear-gradient(135deg,color-mix(in srgb, var(--accent) 90%, transparent),color-mix(in srgb, var(--accent-2) 90%, transparent)); color:#022; }
    :where(html[data-page="home"]) .fb-form { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
    :where(html[data-page="home"]) .fb-textarea { width:100%; box-sizing:border-box; min-height:90px; padding:10px 14px; border-radius:11px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-size:.9rem; font-family:inherit; outline:none; resize:vertical; }
    :where(html[data-page="home"]) .fb-textarea:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
    :where(html[data-page="home"]) .fb-item { padding:14px 4px; border-bottom:1px dashed rgba(255,255,255,.08); }
    :where(html[data-page="home"]) .fb-meta { display:flex; align-items:center; gap:8px; font-size:.8rem; flex-wrap:wrap; }
    :where(html[data-page="home"]) .fb-badge { padding:2px 10px; border-radius:999px; font-size:0.75rem; font-weight:600; }
    :where(html[data-page="home"]) .fb-badge.feedback { background:color-mix(in srgb, var(--accent-2) 16%, transparent); color:#9db8ff; border:1px solid color-mix(in srgb, var(--accent-2) 35%, transparent); }
    :where(html[data-page="home"]) .fb-badge.suggestion { background:rgba(251,191,36,.14); color:#ffd27a; border:1px solid rgba(251,191,36,.35); }
    :where(html[data-page="home"]) .fb-content { margin:6px 0 0; font-size:.9rem; line-height:1.6; word-break:break-word; }
    :where(html[data-page="home"]) .fb-reply { margin-top:8px; padding:10px 14px; border-radius:10px; background:color-mix(in srgb, var(--accent) 7%, transparent); border-left:3px solid var(--accent); font-size:0.875rem; }
    :where(html[data-page="home"]) .fb-reply b { color:var(--accent); }
    :where(html[data-page="home"]) .fb-reply-empty { opacity:.55; font-size:0.875rem; margin-top:10px; }
    :where(html[data-page="home"]) .fb-reply-form { display:flex; gap:8px; margin-top:8px; }
    :where(html[data-page="home"]) .fb-reply-form input { flex:1; min-width:0; padding:7px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-size:0.875rem; font-family:inherit; outline:none; }
    :where(html[data-page="home"]) .fb-reply-form input:focus { border-color:var(--accent); }
    :where(html[data-page="home"]) .fb-empty { opacity:.55; font-size:0.875rem; padding:14px 0; }
    :where(html[data-page="home"]) .fb-stats { display:flex; gap:14px; margin-bottom:14px; font-size:0.875rem; opacity:.85; flex-wrap:wrap; }
    :where(html[data-page="home"]) .fb-stats b { color:var(--accent); }
    html:where([data-page="home"])[data-theme="light"] .msg-input, html:where([data-page="home"])[data-theme="light"] .fb-textarea, html:where([data-page="home"])[data-theme="light"] .fb-reply-form input { background:rgba(45,122,90,.06); border-color:rgba(45,122,90,.18); color:#143325; }
    html:where([data-page="home"])[data-theme="light"] .msg-input:focus, html:where([data-page="home"])[data-theme="light"] .fb-textarea:focus, html:where([data-page="home"])[data-theme="light"] .fb-reply-form input:focus { border-color:#2d7a5a; box-shadow:0 0 0 3px rgba(45,122,90,.14); }
    html:where([data-page="home"])[data-theme="light"] .fb-tabs { background:rgba(45,122,90,.08); border-color:rgba(45,122,90,.18); }
    html:where([data-page="home"])[data-theme="light"] .fb-tab { color:rgba(26,46,34,.6); }
    html:where([data-page="home"])[data-theme="light"] .fb-tab.active { color:#022; }
    html:where([data-page="home"])[data-theme="light"] .fb-reply { background:rgba(45,122,90,.07); }
    html:where([data-page="home"])[data-theme="light"] .like-btn { border-color:rgba(45,122,90,.2); }
    html:where([data-page="home"])[data-theme="light"] .like-btn.liked { background:rgba(45,122,90,.12); color:#2d7a5a; }
</style>
