/* ==========================================================================
 * projects.js —— 项目作品的**唯一数据源**
 *
 * 为什么单独抽出来：首页（HomeView）与关于页（AboutView）都要展示项目作品。
 * 原先两边各写一份，结果是**各写各的、已经漂移**：
 *   · 首页 3 个（zelm / campus / shin），卡片是「摘要 + 点击看详情弹窗」；
 *   · 关于页写死 2 个（少了 shin），直接把完整介绍铺在卡片里，外链也是硬编码的，
 *     没有详情弹窗。
 * 这类「同一份内容抄两份」必然继续漂移，所以收敛到这里，两个页面都从这里取。
 *
 * 用法：因为文案要走 i18n（t），这里导出的是**工厂函数**而不是常量数组 ——
 * 组件在自己的 setup 里传进自己的 t，语种切换时自然跟着变。
 *   import { buildProjects } from '@/data/projects';
 *   const projects = buildProjects(t);      // t 来自 useI18n('home')
 *
 * 字段说明：
 *   id       唯一键（v-for :key）
 *   title    卡片标题
 *   summary  卡片摘要（首页/关于页卡片上显示的就是它）
 *   full     详情弹窗里的完整介绍
 *   img      可选，详情弹窗右侧配图
 *   links[]  详情弹窗里的按钮：{ label, href, download?, external?, ghost? }
 * ========================================================================== */

export function buildProjects(t) {
  return [
    {
      id: 'zelm',
      title: t('projectZelmTitle'),
      summary: t('projectZelmSummary'),
      full: t('projectZelmDesc'),
      links: [
        { label: t('projectCampusLink'), href: 'https://github.com/Zelm05/zelm-lab', external: true },
      ],
    },
    {
      id: 'campus',
      title: t('projectCampusTitle'),
      summary: t('projectCampusSummary'),
      full: t('projectCampusDesc'),
      links: [
        { label: t('projectCampusLink'), href: 'https://github.com/Zelm05/campus-autologin', external: true },
        { label: t('projectCampusApk'), href: 'assets/downloads/Autologin-v1.0.3_release.apk', download: 'Autologin-v1.0.3_release.apk' },
        { label: t('projectCampusWin'), href: 'assets/downloads/Autologin_v1.2.1_x64_setup.exe', download: 'Autologin_v1.2.1_x64_setup.exe' },
      ],
    },
    {
      id: 'shin',
      title: t('projectShinTitle'),
      summary: t('projectShinSummary'),
      full: t('projectShinDesc'),
      img: 'assets/projects/shinchan-watchface.webp',
      links: [
        { label: t('projectShinDl'), href: 'assets/downloads/蜡笔小新_1.0.bin', download: '蜡笔小新_1.0.bin' },
      ],
    },
  ];
}
