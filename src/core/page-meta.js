/* ==========================================================================
 * 页面级元信息：<title> / <html> 的页面级 class / 视图级 SEO meta
 *
 * 结构（2026-09-23 起支持多语言）：
 *   每页 = {
 *     htmlClass,                       // '' | 'site-open'
 *     og,                              // 是否输出 og:* / twitter:* 一组
 *     title{4语}, desc{4语},           // <title> / description（同时用于 og:description、twitter:description）
 *     siteName{4语}, ogTitle{4语},     // og:site_name / og:title（同时用于 twitter:title）
 *     imageAlt{4语}|null,              // og:image:alt（可选）
 *     url, image, canonical,           // 结构字段，与语言无关，共用
 *   }
 *   —— 文本字段一律是**多语言桶** { 'zh-CN', 'zh-TW', en, ja }；
 *   usePageMeta() 按当前 locale 取值并生成 <meta>，**切换语言时实时重绘**。
 *
 * 历史说明：本文件原先由一次性迁移脚本 zelm_vueify.cjs 从各页 *.meta.json 汇总生成
 *   （文件头曾写「自动生成，请勿手改」）。该脚本与源 json 均不在仓库中，
 *   故本文件现为**手工维护**——改标题/描述直接改这里即可。
 *
 * 注意：index.html 里带 data-page-meta="shell" 的那组是**社交爬虫兜底**
 *   （爬虫不执行 JS，读的是原始 HTML），保持中文、不随语言切换；运行时会由
 *   usePageMeta() 摘除并替换为本页的对应语言版本。
 * ========================================================================== */

/** 多语言桶快捷构造 */
const B = (zhCN, zhTW, en, ja) => ({ 'zh-CN': zhCN, 'zh-TW': zhTW, en, ja });

export const PAGE_META = {
  gate: {
    htmlClass: '',
    og: true,
    title: B(
      'Zelm 的信息资源库 | 个人作品、工具与资源集合站',
      'Zelm 的資訊資源庫 | 個人作品、工具與資源集合站',
      "Zelm's Resource Hub | Works, tools & resources",
      'Zelm の情報リソース庫 | 作品・ツール・リソース集',
    ),
    siteName: B('Zelm 的信息资源库', 'Zelm 的資訊資源庫', "Zelm's Resource Hub", 'Zelm の情報リソース庫'),
    desc: B(
      'Zelm 的信息资源库：个人作品、工具与资源集合站，收录常用网站、开发工具、学习资料与作品集。',
      'Zelm 的資訊資源庫：個人作品、工具與資源集合站，收錄常用網站、開發工具、學習資料與作品集。',
      "Zelm's Resource Hub — a personal portfolio and a collection of handy websites, dev tools, study materials and works.",
      'Zelm の情報リソース庫。よく使うサイト・開発ツール・学習資料・作品をまとめた個人のポートフォリオです。',
    ),
    ogTitle: B('Zelm 的信息资源库', 'Zelm 的資訊資源庫', "Zelm's Resource Hub", 'Zelm の情報リソース庫'),
    imageAlt: null,
    url: 'https://luminae.dpdns.org/',
    image: 'https://luminae.dpdns.org/assets/avatar.jpg',
    canonical: 'https://luminae.dpdns.org/',
  },
  home: {
    htmlClass: 'site-open',
    og: true,
    title: B('Zelm 的信息资源库', 'Zelm 的資訊資源庫', "Zelm's Resource Hub", 'Zelm の情報リソース庫'),
    siteName: B('Zelm 的信息资源库', 'Zelm 的資訊資源庫', "Zelm's Resource Hub", 'Zelm の情報リソース庫'),
    desc: B(
      'Zelm 的资源库首页：常用网站导航、快捷网页、小游戏与社区留言板。',
      'Zelm 的資源庫首頁：常用網站導覽、快捷網頁、小遊戲與社群留言板。',
      "Zelm's Resource Hub home: site navigation, quick links, mini games and a community guestbook.",
      'Zelm の情報リソース庫ホーム。サイトナビ、クイックリンク、ミニゲーム、コミュニティ掲示板。',
    ),
    ogTitle: B('Zelm 的信息资源库 · 首页', 'Zelm 的資訊資源庫 · 首頁', "Zelm's Resource Hub · Home", 'Zelm の情報リソース庫 · ホーム'),
    imageAlt: B('Zelm 照片墙封面', 'Zelm 照片牆封面', 'Zelm photo wall cover', 'Zelm フォトウォールのカバー'),
    url: 'https://luminae.dpdns.org/home',
    image: 'https://luminae.dpdns.org/assets/photos/photo-01.webp',
    canonical: 'https://luminae.dpdns.org/home',
  },
  about: {
    htmlClass: 'site-open',
    og: true,
    title: B('关于我 · Zelm', '關於我 · Zelm', 'About me · Zelm', 'About · Zelm'),
    siteName: B('Zelm 的信息资源库', 'Zelm 的資訊資源庫', "Zelm's Resource Hub", 'Zelm の情報リソース庫'),
    desc: B(
      'Zelm 的个人介绍与照片墙，记录日常、兴趣与作品足迹。',
      'Zelm 的個人介紹與照片牆，記錄日常、興趣與作品足跡。',
      "Zelm's profile and photo wall — daily life, interests and works.",
      'Zelm のプロフィールとフォトウォール。日常・趣味・作品の記録。',
    ),
    ogTitle: B('关于我 · Zelm', '關於我 · Zelm', 'About me · Zelm', 'About · Zelm'),
    imageAlt: null,
    url: 'https://luminae.dpdns.org/about',
    image: 'https://luminae.dpdns.org/assets/bg.jpg',
    canonical: 'https://luminae.dpdns.org/about',
  },
  admin: {
    htmlClass: '',
    og: false,
    title: B('Zelm 管理控制台', 'Zelm 管理控制台', 'Zelm Admin Console', 'Zelm 管理コンソール'),
  },
  privacy: {
    htmlClass: '',
    og: false,
    title: B('隐私政策与服务条款 · Zelm', '隱私政策與服務條款 · Zelm', 'Privacy Policy & Terms of Service · Zelm', 'プライバシーポリシーと利用規約 · Zelm'),
    desc: B(
      'Zelm 站点的隐私政策、服务条款与版权投诉处理说明。',
      'Zelm 站點的隱私政策、服務條款與版權投訴處理說明。',
      "Zelm's privacy policy, terms of service and copyright complaint handling.",
      'Zelm のプライバシーポリシー、利用規約、著作権侵害の申し立てについて。',
    ),
    canonical: 'https://luminae.dpdns.org/privacy.html',
  },
};
