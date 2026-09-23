/* ==========================================================================
 * 文案包：settings   —— 设置面板专用（主站 / 关于我 两页共用）
 *
 * 原站主站与关于页各写了一份设置面板：同一句文案在两个 DICT 里各存一份、
 * 键名还不同（themeSwitch / themeMode、sizeSmall / fontSizeSmall …），
 * 两套 applySettings / updateSegs 各自刷 DOM。现在面板只有一个组件、
 * 文案只有一份。
 * ========================================================================== */

export default {
  zh: {
    panelTitle: '设置',
    close: '关闭',
    groupLang: '语言',
    langLabel: '界面语言',

    groupTheme: '外观主题',
    themeMode: '主题模式', themeLight: '☀️ 浅色', themeDark: '🌙 深色',
    schemeLabel: '配色方案',
    schemeDefault: '极简青绿', schemeMorandi: '莫兰迪低饱和', schemeEye: '高对比护眼',
    schemeSunset: '日落橙', schemeOcean: '海洋蓝', schemeViolet: '紫罗兰',
    schemeSakura: '樱花粉', schemeAurora: '极光绿',
    fontLabel: '字体', fontSans: '无衬线', fontMono: '等宽',
    fontSizeLabel: '字体大小', sizeSmall: '小', sizeMedium: '中', sizeLarge: '大',
    animSwitch: '动画效果',
    bgFxLabel: '背景效果', bgFxNone: '🚫 无', bgFxParticles: '✨ 粒子',
    stars: '星光特效',
    overlayStrength: '背景遮罩',

    groupLayout: '布局与交互',
    navMode: '导航栏模式', navFixed: '固定置顶', navHide: '滚动隐藏',
    tocSwitch: '侧边目录',
    smoothSwitch: '平滑滚动',

    groupPrivacy: '隐私与访客偏好',
    visitorSwitch: '访客统计', visitorLabel: '本机访问次数',
    externalSwitch: '外链新开标签页',
    resetPrefs: '重置配置',
    resetConfirm: '确定清除所有偏好设置并恢复默认吗？页面将刷新。',

    groupAbout: '关于本站',
    aboutStack: '建站技术', aboutSource: '开源地址', aboutVersion: '版本号', aboutDisclaimer: '免责说明',
    aboutDisclaimerText: '个人学习作品集，仅供交流使用',
  },
};
