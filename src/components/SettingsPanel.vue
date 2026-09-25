<script setup>
/* ==========================================================================
 * SettingsPanel.vue —— 设置弹窗（主站 / 关于我 共用）
 *
 * 原状：两个页面各写了一份几乎相同的设置面板标记，各配一套
 *   loadSettings / saveSettings / applySettings / updateSegs + 十来个
 *   addEventListener，改一项就回头把整个面板刷一遍。
 * 现在：一个组件 + 一个 store。开关直接写 store，store 负责落 DOM 与持久化；
 *   分段按钮的选中态由 :class 派生，不再有 updateSegs 这个函数。
 *
 * 两页的差异通过 prop / 插槽表达：
 *   visitor  —— 是否显示「访客统计」（只有主站有）
 *   默认插槽 —— 主站额外的「账号安全 / 数据管理 / 数据统计」分组
 *
 * --------------------------------------------------------------------------
 * 2026-09-21 排版重构：控件全部换成**原生元素**
 *   原来用的是 el-radio-group / el-select / el-switch / el-slider。
 *   问题（有截图为证）：el-radio-button 渲染成一排**未加样式的原生圆点**，
 *   跟旁边的胶囊分段按钮完全不是一套语言；行高在 36/40/44/48 之间跳；
 *   开关靠右、分段控件居中，两条竖线都对不齐。
 *
 *   现在统一成项目里已有的原生控件（与 AuthPanel / 管理台同一套）：
 *     el-radio-group → .seg + .seg-btn        （胶囊分段，admin 页同款）
 *     el-switch      → .switch-input + .switch（原生 checkbox + 视觉开关）
 *     el-slider      → <input type="range">   （accent-color 上色）
 *     el-select      → 原生 <select>           （.settings-select）
 *     el-button      → 原生 <button>           （.modal-close / .settings-btn）
 *
 *   行结构统一为「标签 + 控件」两列：
 *     <div class="settings-row"><span class="settings-label">…</span><span class="settings-ctrl">…</span></div>
 *   控件统一靠右对齐（原来开关靠右、分段居中），行高统一 34px。
 * ========================================================================== */
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/core/i18n';
import { zelmConfirm } from '@/modules/confirm';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import { useDialog } from '@/composables/useDialog';

defineProps({
  visitor: { type: Boolean, default: false },
  visitorCount: { type: [Number, String], default: 0 },
});

const st = useSettingsStore();
const { t } = useI18n('settings');

const THEMES = ['light', 'dark'];
const SCHEMES = ['default', 'morandi', 'eye', 'sunset', 'ocean', 'violet', 'sakura', 'aurora'];
const FONTS = ['sans', 'mono'];
const SIZES = [
  { v: 'small', k: 'sizeSmall' }, { v: 'medium', k: 'sizeMedium' }, { v: 'large', k: 'sizeLarge' },
];
const NAV_MODES = [
  { v: 'fixed', k: 'navFixed' }, { v: 'hide', k: 'navHide' },
];
/** 配色方案 key → i18n key（scheme + 首字母大写） */
const schemeKey = (sc) => 'scheme' + sc.charAt(0).toUpperCase() + sc.slice(1);

/* 无障碍（WCAG 2.1.2 / 2.4.3）：Esc 关闭 + Tab 在面板内循环 + 关闭后焦点归位。
   原来只有一句手写的 Esc 监听，没有焦点陷阱 —— 键盘用户 Tab 会跑到背后的页面上。 */
const panelEl = ref(null);
useDialog(() => st.panelOpen, { onClose: () => st.closePanel(), panelRef: panelEl });

async function onReset() {
  if (!(await zelmConfirm(t('resetConfirm')))) return;
  st.reset();
}
</script>

<template>
  <div id="settingsOverlay" class="modal-overlay" :hidden="!st.panelOpen" @click.self="st.closePanel()">
    <div id="settingsPanel" ref="panelEl" class="modal settings-modal" role="dialog" aria-modal="true" :aria-label="t('panelTitle')">
      <div class="settings-modal-header">
        <h2 class="settings-modal-title">{{ t('panelTitle') }}</h2>
        <button id="settingsClose" type="button" class="modal-close settings-close" :aria-label="t('close')" @click="st.closePanel()">✕</button>
      </div>

      <div class="settings-modal-body">

        <!-- ===== 语言 ===== -->
        <section class="settings-group">
          <h3>{{ t('groupLang') }}</h3>
          <div class="settings-row">
            <span class="settings-label">{{ t('langLabel') }}</span>
            <span class="settings-ctrl settings-ctrl--grow"><LanguageSwitcher /></span>
          </div>
        </section>

        <!-- ===== 外观主题 ===== -->
        <section class="settings-group">
          <h3>{{ t('groupTheme') }}</h3>

          <div class="settings-row">
            <span class="settings-label">{{ t('themeMode') }}</span>
            <span class="settings-ctrl">
              <span id="themeSeg" class="seg">
                <button
v-for="th in THEMES" :key="th" type="button" class="seg-btn"
                  :class="{ active: st.s.theme === th }" @click="st.set('theme', th)">
                  {{ th === 'light' ? t('themeLight') : t('themeDark') }}
                </button>
              </span>
            </span>
          </div>

          <div class="settings-row">
            <label class="settings-label" for="schemeSel">{{ t('schemeLabel') }}</label>
            <span class="settings-ctrl">
              <select
id="schemeSel" class="settings-select" :value="st.s.scheme"
                @change="st.set('scheme', $event.target.value)">
                <option v-for="sc in SCHEMES" :key="sc" :value="sc">{{ t(schemeKey(sc)) }}</option>
              </select>
            </span>
          </div>

          <div class="settings-row">
            <span class="settings-label">{{ t('fontLabel') }}</span>
            <span class="settings-ctrl">
              <span id="fontSeg" class="seg">
                <button
v-for="f in FONTS" :key="f" type="button" class="seg-btn"
                  :class="{ active: st.s.font === f }" @click="st.set('font', f)">
                  {{ f === 'sans' ? t('fontSans') : t('fontMono') }}
                </button>
              </span>
            </span>
          </div>

          <div class="settings-row">
            <span class="settings-label">{{ t('fontSizeLabel') }}</span>
            <span class="settings-ctrl">
              <span id="fontSizeSeg" class="seg">
                <button
v-for="z in SIZES" :key="z.v" type="button" class="seg-btn"
                  :class="{ active: st.s.fontSize === z.v }" @click="st.set('fontSize', z.v)">
                  {{ t(z.k) }}
                </button>
              </span>
            </span>
          </div>

          <label class="settings-row">
            <span class="settings-label">{{ t('animSwitch') }}</span>
            <span class="settings-ctrl">
              <input
id="setAnimations" type="checkbox" class="switch-input"
                :checked="st.s.animations" @change="st.set('animations', $event.target.checked)" />
              <span class="switch"></span>
            </span>
          </label>

          <div class="settings-row">
            <span class="settings-label">{{ t('bgFxLabel') }}</span>
            <span class="settings-ctrl">
              <span id="bgFxSeg" class="seg">
                <button
type="button" class="seg-btn" :class="{ active: !st.s.backgroundFx }"
                  @click="st.set('backgroundFx', false)">{{ t('bgFxNone') }}</button>
                <button
type="button" class="seg-btn" :class="{ active: !!st.s.backgroundFx }"
                  @click="st.set('backgroundFx', true)">{{ t('bgFxParticles') }}</button>
              </span>
            </span>
          </div>

          <label class="settings-row">
            <span class="settings-label">{{ t('stars') }}</span>
            <span class="settings-ctrl">
              <input
id="setStars" type="checkbox" class="switch-input"
                :checked="st.s.stars" @change="st.set('stars', $event.target.checked)" />
              <span class="switch"></span>
            </span>
          </label>

          <div class="settings-row settings-row--fill">
            <label class="settings-label" for="setOverlay">{{ t('overlayStrength') }}</label>
            <span class="settings-ctrl">
              <input
id="setOverlay" type="range" class="settings-range" min="0" max="100"
                :value="st.s.overlay" :style="{ '--fill': st.s.overlay + '%' }"
                @input="st.set('overlay', Number($event.target.value))" />
              <span id="setOverlayVal" class="range-val">{{ st.s.overlay }}%</span>
            </span>
          </div>
        </section>

        <!-- ===== 布局与交互 ===== -->
        <section class="settings-group">
          <h3>{{ t('groupLayout') }}</h3>

          <div class="settings-row">
            <span class="settings-label">{{ t('navMode') }}</span>
            <span class="settings-ctrl">
              <span id="navModeSeg" class="seg">
                <button
v-for="m in NAV_MODES" :key="m.v" type="button" class="seg-btn"
                  :class="{ active: st.s.navMode === m.v }" @click="st.set('navMode', m.v)">
                  {{ t(m.k) }}
                </button>
              </span>
            </span>
          </div>

          <label class="settings-row">
            <span class="settings-label">{{ t('tocSwitch') }}</span>
            <span class="settings-ctrl">
              <input
id="setToc" type="checkbox" class="switch-input"
                :checked="st.s.toc" @change="st.set('toc', $event.target.checked)" />
              <span class="switch"></span>
            </span>
          </label>

          <label class="settings-row">
            <span class="settings-label">{{ t('smoothSwitch') }}</span>
            <span class="settings-ctrl">
              <input
id="setSmooth" type="checkbox" class="switch-input"
                :checked="st.s.smoothScroll" @change="st.set('smoothScroll', $event.target.checked)" />
              <span class="switch"></span>
            </span>
          </label>
        </section>

        <!-- ===== 隐私与访客偏好 ===== -->
        <section class="settings-group">
          <h3>{{ t('groupPrivacy') }}</h3>

          <template v-if="visitor">
            <label class="settings-row">
              <span class="settings-label">{{ t('visitorSwitch') }}</span>
              <span class="settings-ctrl">
                <input
id="setVisitor" type="checkbox" class="switch-input"
                  :checked="st.s.visitorCount" @change="st.set('visitorCount', $event.target.checked)" />
                <span class="switch"></span>
              </span>
            </label>
            <p class="visitor-line" :hidden="!st.s.visitorCount">
              👀 <span>{{ t('visitorLabel') }}</span>：<b id="visitorCount">{{ visitorCount }}</b>
            </p>
          </template>

          <label class="settings-row">
            <span class="settings-label">{{ t('externalSwitch') }}</span>
            <span class="settings-ctrl">
              <input
id="setExternal" type="checkbox" class="switch-input"
                :checked="st.s.externalBlank" @change="st.set('externalBlank', $event.target.checked)" />
              <span class="switch"></span>
            </span>
          </label>

          <div class="settings-row settings-row--action">
            <button id="resetPrefsBtn" type="button" class="settings-btn settings-btn--danger" @click="onReset">
              {{ t('resetPrefs') }}
            </button>
          </div>
        </section>

        <!-- 页面自有分组（主站：账号安全 / 数据管理 / 数据统计） -->
        <slot />

        <!-- ===== 关于本站 ===== -->
        <section class="settings-group">
          <h3>{{ t('groupAbout') }}</h3>
          <ul class="about-site">
            <li><span>{{ t('aboutStack') }}</span>：Vue 3 / Hono / Cloudflare D1</li>
            <li><span>{{ t('aboutSource') }}</span>：<a href="https://github.com/Zelm05" target="_blank" rel="noopener noreferrer">github.com/Zelm05</a></li>
            <li><span>{{ t('aboutVersion') }}</span>：v1.0.0</li>
            <li><span>{{ t('aboutDisclaimer') }}</span>：{{ t('aboutDisclaimerText') }}</li>
          </ul>
        </section>

      </div>
    </div>
  </div>
</template>
