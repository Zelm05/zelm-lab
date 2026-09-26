<script setup>
/* ==========================================================================
 * AboutView.vue —— 「关于我」
 *
 * 原状：本文件只放原站标记（data-i18n 占位），真正的行为全在
 *   src/modules/pages/about.js（784 行命令式脚本）里：applyI18n 扫全页刷文案、
 *   门控靠手工改 hidden、设置面板自己刷一遍 DOM、照片墙与星光在脚本里建。
 * 现在：文案走 packs/about.js，门控走 stores/about.js，设置走 SettingsPanel，
 *   星光与页脚联系方式各自独立成组件；本页只负责「把区块拼起来 + 极少量交互」。
 *
 * 与原站一致的行为：
 *   - 左侧目录点击后闪一下高亮（260ms），滚动到对应区块
 *   - 照片墙：进入正文时才初始化（隐藏时容器宽高为 0，建了也没用）
 *   - 密码门自动聚焦；回车即校验
 * 唯一的有意改动：左侧目录不再写 location.hash。
 *   原站用 history.replaceState 把 #secAbout 塞进地址栏 —— 那套属于伪 SPA；
 *   现在地址栏的 hash 归 vue-router 所有，塞 #secAbout 会被当成一条未知路由，
 *   所以改为 preventDefault + scrollIntoView，滚动效果不变，路由不再被污染。
 * ========================================================================== */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useAboutStore } from '@/stores/about';
import { useContentStore } from '@/stores/content';
import { useSettingsStore } from '@/stores/settings';
import { useUserStore } from '@/stores/user';
import { usePageMeta } from '@/composables/usePageMeta';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';
import { initDriftWall } from '@/modules/photo-wall';
import { ABOUT_CONTACTS, CONTACT_ICONS } from '@/data/contacts';
import SettingsPanel from '@/components/SettingsPanel.vue';
import FooterContacts from '@/components/FooterContacts.vue';
import StarField from '@/components/StarField.vue';
import EpLocaleProvider from '@/components/EpLocaleProvider.vue';
/* 项目作品：与首页共用同一组件 + 同一份数据（@/data/projects.js），不再各写一份 */
import ProjectGrid from '@/components/ProjectGrid.vue';
import MomentsBoard from '@/components/MomentsBoard.vue';
import { useRouter } from 'vue-router';

usePageMeta('about');

import { resolveAssetUrl } from '@/core/supabase';

const a = useAboutStore();
const st = useSettingsStore();
const user = useUserStore();
const { t } = useI18n('about');

/* P0 修复（2026-09-23）：页脚版权行用的是 **home** 命名空间的 footer
 *   （'© {year} Zelm · 在幽静的夜里收集星光'）—— about 包里没有这个 key。
 *   此前模板里写的是 `tHome('footer', …)`，但 tHome 从未定义 → 渲染期
 *   `TypeError: tHome is not a function` → 整个 AboutView 挂不出来，
 *   `/about` 整页空白（连登录门都看不见）。这里补上 home 命名空间的绑定。
 *   对照 HomeView.vue 用的是 `t('footer')`（它的 t 就是 home 命名空间）。 */
const { t: tHome } = useI18n('home');
/* 跨命名空间共用词（下载 / 查看 / 取消…）统一走 common 包 */
const { t: tc } = useI18n('common');

/* ---------------- 左侧导航：点击跳动高亮 ---------------- */
const flashed = ref('');
let flashTimer = 0;
let wallRaf = 0;
let wallDestroy = null;
const gateInputEl = ref(null);
const wallEl = ref(null);
/* 照片墙 / 简历：数据来自内容 store（/api/content/photos、/api/content/resume），文件在 Supabase */
const wallLoaded = ref(false);   /* 数据是否已拉过：避免先挂载空墙 -> 回落成 1 张的闪烁 */
const wallPhotos = ref([]);
const wallTitles = ref([]);
const resumeItem = ref(null);
/* ---------- 关于我：动态内容（后台可编辑） + i18n 兜底 ----------
   规则：**DB 有就用 DB，没有就用 i18n 静态文案**。
   这样站长没录入任何内容时页面照常显示，不会出现空白区块。 */
const content = useContentStore();
content.ensure('about');   /* 幂等；语言切换时 store 内部会自动重取 */

/* 站长的「管理」按钮统一跳到后台内容管理面板（只有那一套编辑界面）。
   为什么不再在前台就地编辑：同一功能维护两套编辑器必然漂移，
   而且就地编辑器只写单语，与多语言翻译表是两条路。 */
const router = useRouter();
function goManage(mod) {
  content.openAdmin(mod);
  router.push('/admin');
}

/** 兜底技能标签：与原来模板里写死的一致（部分走 i18n） */
const FALLBACK_SKILLS = computed(() => [
  'Excel', t('techML'), 'Power BI', 'Python', t('techRLang'), 'SPSS', 'SQL',
  t('techDataAnalysis'), t('techDataViz'),
]);

const aboutBioText = computed(() => (content.about && content.about.content) ? content.about.content : t('aboutBio'));
const aboutEduText = computed(() => t('aboutEdu'));   /* 无结构化经历时退回整段文案 */
const aboutSkills = computed(() => {
  const raw = content.about && content.about.skills;
  if (!raw) return FALLBACK_SKILLS.value;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (e) { /* JSON 坏了就兜底 */ }
  return FALLBACK_SKILLS.value;
});
const aboutExpList = computed(() => {
  const raw = content.about && content.about.experiences;
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object') : [];
  } catch (e) { return []; }
});
/** 该语言没翻译、回退了默认语言时的提示 */
const contentNotice = computed(() => content.fallbackNotice(content.about));

/* ---------- 社交链接：后台可编辑（内嵌在 /api/content/about 的 item.links） ----------
   DB 为空时回落到原来的静态清单 —— 站长还没录入时页脚不会空掉。 */
const socialContacts = computed(() => {
  const links = (content.about && content.about.links) || [];
  if (!links.length) return ABOUT_CONTACTS;
  return links.map((l) => ({
    /* 已知平台用统一的手写 SVG 图标；站长自定义的平台回落 emoji */
    path: CONTACT_ICONS[l.platform] || '',
    icon: l.icon || '🔗',
    url: l.url,
    /* label 是多语言的（about_social_link_translations），缺失时用平台标识兜底 */
    title: l.label || l.platform,
  }));
});

/* ---------- 博客 / 证书：同样是「DB 有就显示，没有就保留占位」 ---------- */
content.ensure('blogs');
content.ensure('certificates');
const blogTip = computed(() => (content.blogs.length ? content.fallbackNotice(content.blogs[0]) : ''));
const certTip = computed(() => (content.certificates.length ? content.fallbackNotice(content.certificates[0]) : ''));
/** 博客标签存的是 JSON 数组字符串 */
function blogTags(b) {
  try {
    const a = JSON.parse(b.tags || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
/** 毫秒时间戳 → YYYY-MM-DD（与日志页一致，走 core/format 的 Intl 实现） */
function fmtDate(ts) {
  if (!ts) return '';
  try { return fmtTime(ts).slice(0, 10); } catch (e) { return ''; }
}


/** 点击目录：闪一下高亮，并滚动到对应区块（不写 hash，见文件头说明） */
function jump(id) {
  flashed.value = id;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashed.value = ''; }, 260);
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
}
/** 提交密码：失败（空 / 错 / 网络）时把焦点放回输入框 —— 原站行为 */
async function onPwSubmit() {
  await a.submitPw();
  if (!a.showPwGate) return;
  await nextTick();
  try { gateInputEl.value.focus(); } catch (e) { /* 忽略 */ }
}

/* ---------------- 照片墙：进入正文后按容器尺寸初始化 ---------------- */
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

watch(() => a.showMain, async (on) => {
  if (!on) return;
  await nextTick();
  mountWall();
});
/* 密码门出现时自动聚焦输入框 */
watch(() => a.showPwGate, async (on) => {
  if (!on) return;
  await nextTick();
  try { gateInputEl.value.focus(); } catch (e) { /* 忽略 */ }
});

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
async function loadResume() {
  await content.ensure('resume');
  resumeItem.value = content.resume || null;
}
/* 语言切换后照片标题会变 → 重建墙（store 会先按新语言重取，这里跟着刷新） */
watch(() => content.photos, () => { if (a.showMain) loadWall(); });
/* 照片异步到达后重建墙（否则首次 mount 时列表还是空的） */
watch(wallPhotos, () => { if (a.showMain) mountWall(); });
watch(wallLoaded, () => { if (a.showMain) mountWall(); });

onMounted(() => {
  a.init();
  loadWall();
  loadResume();
});
onUnmounted(() => {
  clearTimeout(flashTimer);
  unmountWall();
});
</script>

<template>
<!-- P1-5：Element Plus 内置文案跟随界面语言（本组件不产生任何 DOM）。 -->
<EpLocaleProvider>
  <!-- 背景（与主站一致） -->
  <div class="bg-layer"></div>
  <div class="overlay" :style="{ opacity: st.s.overlay / 100, '--fade-to': st.s.overlay / 100 }"></div>
  <StarField />

  <!-- 左侧导航（与主站一致，各项跳转对应页面） -->
  <nav id="sideNav" class="side-nav">
    <div class="nav-header">
      <span id="navBrand" class="nav-brand">◉ Zelm</span>
    </div>
    <div id="navItems" class="nav-items">
      <div class="nav-group">
        <a class="nav-item" href="#secAbout" :class="{ active: flashed === 'secAbout' }" @click.prevent="jump('secAbout')">{{ t('aboutTitle') }}</a>
        <a id="navPhotos" class="nav-item" href="#secPhotos" :hidden="!a.photoWallOn" :class="{ active: flashed === 'secPhotos' }" @click.prevent="jump('secPhotos')">{{ t('photoWallTitle') }}</a>
        <a class="nav-item" href="#secProjects" :class="{ active: flashed === 'secProjects' }" @click.prevent="jump('secProjects')">{{ t('navProjects') }}</a>
        <a class="nav-item" href="#moments" :class="{ active: flashed === 'moments' }" @click.prevent="jump('moments')">{{ tHome('momentsTitle') }}</a>
        <a class="nav-item" href="#secBlog" :class="{ active: flashed === 'secBlog' }" @click.prevent="jump('secBlog')">{{ t('blogTitle') }}</a>
        <a class="nav-item" href="#secResume" :class="{ active: flashed === 'secResume' }" @click.prevent="jump('secResume')">{{ t('resumeTitle') }}</a>
        <a class="nav-item" href="#secCerts" :class="{ active: flashed === 'secCerts' }" @click.prevent="jump('secCerts')">{{ t('certTitle') }}</a>
      </div>
      <div class="nav-divider"></div>
      <!-- 与主站 SideNav 同构的原生按钮（曾用 el-button，圆角/字号与相邻 a.nav-item 不一致，2026-09-21 对齐） -->
      <a class="nav-item" href="#/logs">{{ tHome('logsNav') }}</a>
      <button id="navSettingsBtn" type="button" class="nav-item" @click="st.openPanel()">{{ t('settingsBtn') }}</button>
    </div>
  </nav>

  <header class="site-header">
    <div class="header-top">
      <div class="brand-col">
        <div class="brand">
          <span class="brand-icon">◉</span>
          <span class="brand-text">Zelm · {{ t('aboutTitle') }}</span>
        </div>
      </div>
      <div class="header-right">
        <div id="userBox" class="user-box">
          <span id="guestBox" class="guest-btns" :hidden="user.isLoggedIn">
            <el-button id="guestLogin" size="small" data-auth-open="login">{{ t('loginBtn') }}</el-button>
            <el-button id="guestRegister" size="small" data-auth-open="register">{{ t('registerBtn') }}</el-button>
          </span>
          <span id="userInfo" class="user-info" :hidden="!user.isLoggedIn">
            <span id="userName" class="user-name">{{ user.name }}</span>
            <a id="adminBtn" class="user-admin" href="#/admin" :hidden="!user.isAdmin">{{ t('adminBtnLabel') }}</a>
            <!-- 登出：仅当站长允许「免登录进入关于页」时才会出现（需登录进入时不显示） -->
            <el-button id="userLogout" size="small" class="user-logout" type="button" :hidden="a.logoutHidden" @click="a.logout()">{{ t('logoutBtn') }}</el-button>
          </span>
        </div>
      </div>
    </div>
  </header>

  <!-- 登录门 -->
  <div id="notLoginGate" class="gate-overlay" :hidden="!a.showLoginGate">
    <div class="gate-card">
      <h3>{{ t('aboutLoginTitle') }}</h3>
      <p class="gate-sub">{{ t('aboutLoginSub') }}</p>
      <el-button id="goLoginBtn" size="small" @click="a.goLogin()">{{ t('aboutLoginBtn') }}</el-button>
    </div>
  </div>

  <!-- 密码门 -->
  <div id="aboutGate" class="gate-overlay" :hidden="!a.showPwGate">
    <div class="gate-card">
      <h3>{{ t('gateTitle') }}</h3>
      <p class="gate-sub">{{ t('gateSub') }}</p>
      <el-input
id="gateInput"
        ref="gateInputEl"
        v-model="a.pw"
        type="password"
        maxlength="32"
        autocomplete="off"
        placeholder="••••"
        @keydown.enter="onPwSubmit()" />
      <el-button id="gateBtn" size="small" :disabled="a.pwBusy" @click="onPwSubmit()">{{ t('gateBtn') }}</el-button>
      <div id="gateMsg" class="gate-msg">{{ a.pwMsg }}</div>
      <p class="gate-tip">{{ t('gateTip') }}</p>
    </div>
  </div>

  <!-- 正文 -->
  <main id="aboutMain" class="about-main" :hidden="!a.showMain">
    <!-- 关于我 -->
    <!-- 关于我：**站长可在后台编辑**（/api/content/about），没录入时用 i18n 静态文案兜底 -->
    <section id="secAbout" class="about-section">
      <h2>{{ t('aboutTitle') }}</h2>
      <p class="sub">{{ t('aboutSub') }}</p>
      <!-- 当前语言没翻译时的轻量提示（后端回退了默认语言） -->
      <p v-if="contentNotice" class="content-fallback-tip">{{ contentNotice }}</p>
      <div class="about-grid">
        <div class="about-card">
          <h3>📖 <span>{{ t('aboutBioTitle') }}</span></h3>
          <p>{{ aboutBioText }}</p>
        </div>
        <div class="about-card">
          <h3>🎓 <span>{{ t('aboutEduTitle') }}</span></h3>
          <!-- 经历：后台可填结构化列表（{period, role, org, desc}），没填就退回整段文案 -->
          <ul v-if="aboutExpList.length" class="about-exp-list">
            <li v-for="(e, i) in aboutExpList" :key="i">
              <span v-if="e.period" class="about-exp-period">{{ e.period }}</span>
              <span v-if="e.role || e.org" class="about-exp-role">{{ [e.role, e.org].filter(Boolean).join(' · ') }}</span>
              <span v-if="e.desc" class="about-exp-desc">{{ e.desc }}</span>
            </li>
          </ul>
          <p v-else>{{ aboutEduText }}</p>
        </div>
        <div class="about-card">
          <h3>🛠 <span>{{ t('aboutStackTitle') }}</span></h3>
          <div class="tag-cloud">
            <span v-for="s in aboutSkills" :key="s" class="tag">{{ s }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 照片墙 -->
    <section id="secPhotos" class="about-section" :hidden="!a.photoWallOn">
      <h2>📷 <span>{{ t('photoWallTitle') }}</span>
        <button v-if="user.isOwner" type="button" class="owner-add" @click="goManage('photos')">{{ tHome('photoWallManage') }}</button>
      </h2>
      <p class="sub">{{ t('photoWallSub') }}</p>
      <div id="photoWall" ref="wallEl" class="drift-wall"></div>
    </section>

    <!-- 项目作品 -->
    <section id="secProjects" class="about-section">
      <h2>{{ t('projectsTitle') }}</h2>
      <p class="sub">{{ t('projectsSub') }}</p>
      <!-- 与首页同一组件、同一数据源；不开打赏（donate 默认 false） -->
      <ProjectGrid />
    </section>

    <!-- 动态（原朋友圈，已迁到关于页） -->
    <MomentsBoard />

    <!-- 技术博客 -->
    <!-- 博客：站长在后台录入（/api/content/blogs），只显示「已发布」的 -->
    <section id="secBlog" class="about-section">
      <h2>{{ t('blogTitle') }}</h2>
      <p class="sub">{{ t('blogSub') }}</p>
      <p v-if="blogTip" class="content-fallback-tip">{{ blogTip }}</p>
      <ul v-if="content.blogs.length" class="blog-list">
        <li v-for="b in content.blogs" :key="b.id" class="blog-item">
          <div class="blog-head">
            <h3>{{ b.title }}</h3>
            <span v-if="b.published_at" class="blog-date">{{ fmtDate(b.published_at) }}</span>
          </div>
          <p v-if="b.summary" class="blog-summary">{{ b.summary }}</p>
          <p v-if="b.content" class="blog-body">{{ b.content }}</p>
          <div v-if="blogTags(b).length" class="tag-cloud">
            <span v-for="tg in blogTags(b)" :key="tg" class="tag">{{ tg }}</span>
          </div>
          <a
            v-if="b.attach_path" class="blog-attach"
            :href="resolveAssetUrl(b.attach_path, 'blog-assets')" target="_blank" rel="noopener noreferrer"
          >{{ tc('cDownload') }}</a>
        </li>
      </ul>
      <!-- 后台还没录入时保留原来的占位，不出现空白区块 -->
      <ul v-else class="blog-list">
        <li class="blog-item"><a href="#" @click.prevent>{{ t('blogComing') }}</a></li>
      </ul>
    </section>

    <!-- 简历 -->
    <section id="secResume" class="about-section">
      <h2>
        {{ t('resumeTitle') }}
        <button v-if="user.isOwner" type="button" class="owner-add" @click="goManage('resume')">{{ tHome('resumeManage') }}</button>
      </h2>
      <p class="sub">{{ t('resumeSub') }}</p>
      <div class="resume-box">
        <p v-if="!resumeItem">{{ t('resumePlaceholder') }}</p>
        <a v-else class="resume-dl" :href="resolveAssetUrl(resumeItem.storage_path, 'resume')" target="_blank" rel="noopener noreferrer">{{ t('resumeDownload') }}</a>
      </div>
    </section>

    <!-- 证书：站长在后台录入（/api/content/certificates） -->
    <section id="secCerts" class="about-section">
      <h2>{{ t('certTitle') }}</h2>
      <p class="sub">{{ t('certSub') }}</p>
      <p v-if="certTip" class="content-fallback-tip">{{ certTip }}</p>
      <div class="cert-grid">
        <template v-if="content.certificates.length">
          <div v-for="c in content.certificates" :key="c.id" class="cert-card">
            <img
              v-if="c.image_path" class="cert-img"
              :src="resolveAssetUrl(c.image_path, 'certificate-assets')" :alt="c.name || ''"
              loading="lazy" decoding="async" width="120" height="120"
            />
            <span v-else class="cert-icon">🏅</span>
            <h3>{{ c.name }}</h3>
            <p v-if="c.issuer" class="cert-issuer">{{ c.issuer }}</p>
            <p v-if="c.issue_date" class="cert-date">{{ c.issue_date }}</p>
            <p v-if="c.description" class="cert-desc">{{ c.description }}</p>
            <a
              v-if="c.pdf_path" class="cert-pdf"
              :href="resolveAssetUrl(c.pdf_path, 'certificate-assets')" target="_blank" rel="noopener noreferrer"
            >{{ tc('cView') }}</a>
          </div>
        </template>
        <!-- 后台还没录入时保留原来的占位 -->
        <div v-else class="cert-card">
          <span class="cert-icon">🏅</span>
          <h3>{{ t('certWip') }}</h3>
        </div>
      </div>
    </section>
  
</main>

  <footer class="about-footer">
    <FooterContacts :contacts="socialContacts" ns="about" />
    <p>{{ tHome('footer', { year: new Date().getFullYear() }) }}</p>
    <p class="footer-disclaimer">{{ t('footerDisclaimer') }}</p>
    <p class="footer-legal">
      <a href="#/privacy">{{ t('linkPrivacy') }}</a>
      <span aria-hidden="true"> · </span>
      <a href="#/privacy/t">{{ t('linkTerms') }}</a>
      <span aria-hidden="true"> · </span>
      <span>{{ t('copyrightContact') }}</span>：<a href="mailto:yz050930@gmail.com">yz050930@gmail.com</a>
    </p>
  </footer>

  <!-- 设置面板（与主站同一个组件，共享 zelm_settings） -->
  <SettingsPanel />
</EpLocaleProvider>
</template>

<!-- 样式原在 src/styles/pages/about.css，已合并进本组件 -->
<style>
/* 来自 about.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
/* 预加载背景色避免白屏 */
  html:where([data-page="about"]) { background-color: #061814; scroll-behavior: smooth; }
  html:where([data-page="about"])[data-theme="light"] { background-color: #e6f2ea; }
  :where(html[data-page="about"]) body { background-color: #061814; margin: 0; }
  :where(html[data-page="about"]) [hidden] { display: none !important; }
  /* ===== 顶部登录态（与主站一致） ===== */
  :where(html[data-page="about"]) .user-box { display:flex; align-items:center; gap:10px; }
  :where(html[data-page="about"]) .guest-btns { display:inline-flex; gap:8px; }
  :where(html[data-page="about"]) .user-btn { background:transparent; border:1px solid color-mix(in srgb, var(--accent) 40%, transparent); color:var(--accent); padding:4px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-family:inherit; transition:all .2s; display:inline-flex; align-items:center; height:30px; box-sizing:border-box; white-space:nowrap; }
  :where(html[data-page="about"]) .user-btn:hover { background:color-mix(in srgb, var(--accent) 12%, transparent); box-shadow:0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
  :where(html[data-page="about"]) .user-info { display:inline-flex; align-items:center; gap:8px; }
  :where(html[data-page="about"]) .user-name { color:var(--accent); font-weight:600; font-size:14px; white-space:nowrap; }
  /* 登出按钮：用 var(--text) 而非硬编码浅灰，浅色主题下同样清晰可读 */
  :where(html[data-page="about"]) .user-logout { background:transparent; border:1px solid color-mix(in srgb, var(--text) 28%, transparent); color:var(--text); padding:0 12px; border-radius:8px; cursor:pointer; font-size:13px; height:30px; box-sizing:border-box; display:inline-flex; align-items:center; white-space:nowrap; font-family:inherit; transition:all .2s; }
  :where(html[data-page="about"]) .user-logout:hover { border-color:var(--accent); color:var(--accent); }
  :where(html[data-page="about"]) .user-admin { background:transparent; border:1px solid color-mix(in srgb, var(--accent) 40%, transparent); color:var(--accent); padding:0 12px; border-radius:8px; cursor:pointer; font-size:13px; text-decoration:none; display:inline-flex; align-items:center; height:30px; box-sizing:border-box; white-space:nowrap; }
  :where(html[data-page="about"]) .user-admin:hover { box-shadow:0 0 10px color-mix(in srgb, var(--accent) 35%, transparent); }
  /* 导航链接（主站 nav-item 是 button，这里用 a） */
  :where(html[data-page="about"]) .side-nav a.nav-item { text-decoration: none; }
  :where(html[data-page="about"]) .side-nav .nav-item.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent) 25%, transparent);
    font-weight: 600;
  }
  /* ===== 密码门 / 登录门 ===== */
  :where(html[data-page="about"]) .gate-overlay {
    position: fixed; inset: 0; z-index: 2000;
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: rgba(2, 8, 6, 0.55);
    backdrop-filter: blur(8px) brightness(0.55) saturate(120%); -webkit-backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
  }
  :where(html[data-page="about"]) .gate-card {
    width: min(380px, 92vw);
    max-height: 86%;
    padding: 24px;
    border-radius: 20px;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    color: var(--text);
    animation: gatePop .3s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes gatePop { from { opacity: 0; transform: scale(.92) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  :where(html[data-page="about"]) .gate-card h3 { margin: 0 0 6px; font-size: 1.25rem; color: var(--accent); letter-spacing: 1px; }
  :where(html[data-page="about"]) .gate-card .gate-sub { margin: 0 0 18px; font-size: 0.875rem; color: var(--muted); }
  :where(html[data-page="about"]) .gate-input {
    width: 100%; box-sizing: border-box; padding: 11px 14px;
    border-radius: 11px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text);
    font-size: 1rem; font-family: inherit; outline: none;
    text-align: center; letter-spacing: 4px;
    transition: border-color .2s, box-shadow .2s;
  }
  :where(html[data-page="about"]) .gate-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
  :where(html[data-page="about"]) .gate-btn {
    width: 100%; margin-top: 14px; padding: 12px;
    border: none; border-radius: 11px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #022; font-size: 1rem; font-weight: 700; font-family: inherit;
    cursor: pointer; letter-spacing: 2px;
    transition: transform .15s, box-shadow .2s;
    box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  :where(html[data-page="about"]) .gate-btn:hover { transform: translateY(-1px); }
  :where(html[data-page="about"]) .gate-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
  :where(html[data-page="about"]) .gate-msg { margin-top: 12px; font-size: .8rem; min-height: 16px; color: #f87171; }
  :where(html[data-page="about"]) .gate-tip { font-size: .78rem; opacity: .5; margin: 14px 0 0; }
  :where(html[data-page="about"]) .gate-login-btn {
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent);
    padding: 9px 22px; border-radius: 999px;
    font-size: 0.875rem; font-family: inherit; cursor: pointer;
    transition: all .2s;
  }
  :where(html[data-page="about"]) .gate-login-btn:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 20%, transparent); }
  /* ===== 关于页主体 ===== */
  /* ===== 顶部：结构已改成与主站 HomeView 同构（brand-col + header-right），
     样式完全复用全局 .site-header 规则（16px 40px / 高 64），本页不再做专属覆盖
     —— 2026-09-22 用户反馈两个导航栏格式没统一，此前 padding/brand 各搞一套。 ====== */
  :where(html[data-page="about"]) .about-main { max-width: 1080px; margin: 0 auto; padding: 20px 20px 44px; display: flex; flex-direction: column; gap: 18px; }
  :where(html[data-page="about"]) .about-section {
    border-radius: var(--radius, 20px);
    background: var(--surface);
    border: 1px solid var(--border);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    padding: 20px 22px;
    scroll-margin-top: 24px;
  }
  :where(html[data-page="about"]) .about-section h2 { font-size: 1.25rem; color: var(--accent); margin: 0 0 10px; letter-spacing: 1px; }
  :where(html[data-page="about"]) .about-section .sub { margin: 0 0 10px; font-size: 0.875rem; color: var(--muted); }
  :where(html[data-page="about"]) .about-grid { display: grid; /* 固定 3 列等宽：minmax(0,1fr) 防止内容把列撑宽（auto-fit 的 1fr = minmax(auto,1fr) 会不等宽） */ grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  :where(html[data-page="about"]) .about-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); }
  :where(html[data-page="about"]) .about-card h3 { font-size: 1rem; margin: 0 0 10px; color: var(--text); }
  :where(html[data-page="about"]) .about-card p { font-size: 0.875rem; line-height: 1.7; color: var(--muted); margin: 0; }
  :where(html[data-page="about"]) .tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
  :where(html[data-page="about"]) .tag { padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); font-size: .78rem; }
  :where(html[data-page="about"]) .project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  :where(html[data-page="about"]) .project-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); }
  :where(html[data-page="about"]) .project-card h3 { font-size: 1rem; margin: 0 0 8px; color: var(--text); }
  :where(html[data-page="about"]) .project-card p { font-size: 0.875rem; line-height: 1.7; color: var(--muted); margin: 0 0 12px; }
  :where(html[data-page="about"]) .project-links a { color: var(--accent); font-size: 0.875rem; text-decoration: none; }
  :where(html[data-page="about"]) .project-links a:hover { text-decoration: underline; }
  :where(html[data-page="about"]) .blog-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  :where(html[data-page="about"]) .blog-item { background: rgba(255,255,255,.04); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; font-size: 0.875rem; color: var(--muted); }
  :where(html[data-page="about"]) .blog-item a { color: var(--muted); text-decoration: none; }
  :where(html[data-page="about"]) .resume-box { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); font-size: 0.875rem; color: var(--muted); }
  :where(html[data-page="about"]) .resume-box .resume-dl { display: inline-block; margin-top: 12px; color: var(--accent); text-decoration: none; }
  :where(html[data-page="about"]) .cert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  :where(html[data-page="about"]) .cert-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: var(--shadow); text-align: center; color: var(--muted); font-size: 0.875rem; }
  :where(html[data-page="about"]) .cert-icon { font-size: 1.5rem; display: block; margin-bottom: 8px; }
  :where(html[data-page="about"]) .cert-card h3 { font-size: 0.875rem; color: var(--text); margin: 0; }
  :where(html[data-page="about"]) .about-footer { max-width: 1080px; margin: -30px auto 0; padding: 0 20px 40px; text-align: center; font-size: 0.75rem; color: var(--muted); opacity: .7; }
  /* ===== 照片墙（DriftWall 香草移植：轨道取模无缝循环） ===== */
  :where(html[data-page="about"]) .drift-wall {
    position: relative; width: 100%; height: 420px; overflow: hidden;
    border-radius: 18px; border: 1px solid var(--border); background: #060010;
    perspective: var(--dw-perspective, 1200px);
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 var(--dw-edge, 40%), #000 calc(100% - var(--dw-edge, 40%)), transparent);
    mask-image: linear-gradient(to bottom, transparent, #000 var(--dw-edge, 40%), #000 calc(100% - var(--dw-edge, 40%)), transparent);
  }
  /* left 用 47% 而非 50%：5 列 plane 总宽超出容器，rotateY 透视下右侧溢出明显更多，
     视觉重心偏右（2026-09-22 用户反馈「内容往左边移动一点」）—— 锚点左移 3% 矫正。 */
  :where(html[data-page="about"]) .drift-wall__plane { position: absolute; left: 47%; top: 50%; transform-style: preserve-3d; will-change: transform; display: flex; gap: var(--dw-gap, 18px); }
  :where(html[data-page="about"]) .drift-wall__col { position: relative; flex: 0 0 auto; }
  :where(html[data-page="about"]) .drift-wall__track { will-change: transform; }
  :where(html[data-page="about"]) .drift-wall__tile {
    position: relative; box-sizing: border-box;
    width: var(--dw-tile-w, 200px); height: var(--dw-tile-h, 132px);
    margin-bottom: var(--dw-gap, 18px);
    border-radius: var(--dw-radius, 14px);
    overflow: hidden; background: #111; cursor: pointer;
    transition: transform .25s ease, filter .3s ease;
    outline: none;
  }
  :where(html[data-page="about"]) .drift-wall__tile img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
  :where(html[data-page="about"]) .drift-wall--gray .drift-wall__tile img { filter: grayscale(1); }
  :where(html[data-page="about"]) .drift-wall__tile.is-active { transform: translateY(calc(var(--dw-lift, 64px) * -1)) scale(1.04); z-index: 2; }
  :where(html[data-page="about"]) .drift-wall__tile.is-active img { filter: none; }
  :where(html[data-page="about"]) .drift-wall__overlay { position: absolute; inset: 0; background: var(--dw-overlay, #060010); opacity: var(--dw-dim, .55); transition: opacity .25s; pointer-events: none; }
  :where(html[data-page="about"]) .drift-wall__tile.is-active .drift-wall__overlay { opacity: 0; }
  @media (max-width: 768px) {
    :where(html[data-page="about"]) .user-box { flex-wrap: wrap; justify-content: flex-end; row-gap: 6px; }
    :where(html[data-page="about"]) .user-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
  }
  @media (max-width: 640px) {
    /* 页头对齐统一（2026-09-24）：与 home 一致改为居中。
       原文为「本页顶栏保持左对齐，不与汉堡导航重叠」—— 汉堡菜单早已彻底移除（见 late-overrides.css），
       该理由已失效；且这是全站**唯一**的页头对齐差异（桌面端各页本就一致）。 */
    :where(html[data-page="about"]) .site-header { flex-direction: column; align-items: center; text-align: center; }
    :where(html[data-page="about"]) .drift-wall { height: 300px; border-radius: 12px; }
    :where(html[data-page="about"]) .about-section { padding: 18px 14px; }
    :where(html[data-page="about"]) .about-main { padding: 14px 10px 36px; }
  }

  /* 极窄屏（≤479px）卡片才改单列 —— 3 列在 400px 下每列只有 ~108px，太挤。
     断点取 479 而不是 767：700px 时内容区还有 ~640px，3 列（每列 213px）完全放得下，
     而且这样 700 与 1280 的排版一致（用户要求「等比缩放、排版不变」）。 */
  @media (max-width: 479px) {
    :where(html[data-page="about"]) .about-grid,
    :where(html[data-page="about"]) .project-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ===== 动态内容（2026-09-26）：回退提示 + 结构化经历列表 =====
     提示做成浅色小字 —— 规范要求「轻量提示」，不能抢正文的视觉重量。 */
  :where(html[data-page="about"]) .content-fallback-tip {
    margin: 0 0 12px; font-size: 0.75rem; opacity: 0.55;
  }
  :where(html[data-page="about"]) .about-exp-list {
    list-style: none; margin: 0; padding: 0; display: grid; gap: 8px;
  }
  :where(html[data-page="about"]) .about-exp-list li {
    display: grid; gap: 2px; font-size: 0.875rem; line-height: 1.6;
  }
  :where(html[data-page="about"]) .about-exp-period { font-size: 0.75rem; opacity: 0.6; }
  :where(html[data-page="about"]) .about-exp-role { font-weight: 600; }
  :where(html[data-page="about"]) .about-exp-desc { opacity: 0.85; white-space: pre-wrap; }

  /* ===== 博客 / 证书：动态内容的补充样式（2026-09-26）=====
     .blog-list/.blog-item/.cert-grid/.cert-card 的外观在全局 CSS 里，这里只补新增元素的排布。 */
  :where(html[data-page="about"]) .blog-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  }
  :where(html[data-page="about"]) .blog-head h3 { margin: 0; }
  :where(html[data-page="about"]) .blog-date { font-size: 0.75rem; opacity: 0.55; flex: 0 0 auto; }
  :where(html[data-page="about"]) .blog-summary { margin: 6px 0 0; opacity: 0.85; }
  :where(html[data-page="about"]) .blog-body {
    margin: 6px 0 0; font-size: 0.9375rem; line-height: 1.8; white-space: pre-wrap; word-break: break-word;
  }
  :where(html[data-page="about"]) .blog-attach {
    display: inline-block; margin-top: 8px; font-size: 0.8125rem; color: var(--accent);
  }
  :where(html[data-page="about"]) .cert-img {
    width: 120px; height: 120px; object-fit: cover; border-radius: 12px; margin-bottom: 8px;
  }
  :where(html[data-page="about"]) .cert-issuer { margin: 2px 0 0; font-size: 0.8125rem; opacity: 0.8; }
  :where(html[data-page="about"]) .cert-date { margin: 2px 0 0; font-size: 0.75rem; opacity: 0.55; }
  :where(html[data-page="about"]) .cert-desc { margin: 6px 0 0; font-size: 0.875rem; opacity: 0.85; }
  :where(html[data-page="about"]) .cert-pdf {
    display: inline-block; margin-top: 8px; font-size: 0.8125rem; color: var(--accent);
  }
</style>
