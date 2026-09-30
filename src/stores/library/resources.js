/* ==========================================================================
 * src/stores/library/resources.js —— 资源下载领域
 *
 * 原 stores/library.js 的「资源下载」段落：种子 + localStorage 持久化 + 分类标签。
 * 存储键沿用原站（zelm_resources）。
 *
 * DEFAULT_RESOURCES 的数据本体自原文件逐行搬来（用 sed 按行区间抽取），未做任何改动。
 *
 * 注意 loadResources / saveResources / ensureDefaultResources 原先是本文件私有函数
 * （与 store 同处一个文件，不需要导出）。拆分后 store 搬到了 ./index.js，
 * 因此这三个必须导出给组合根使用 —— 但它们**不属于** `@/stores/library` 的
 * 对外接口，index.js 只转出 DEFAULT_RESOURCES / LS_RES / itemCats /
 * resCatLabel / itemCatLabel。
 * ========================================================================== */
import { t } from './i18n';

export const DEFAULT_RESOURCES = [
  { title: { 'zh-CN': 'Clash Verge Rev', 'zh-TW': 'Clash Verge Rev', en: 'Clash Verge Rev', ja: 'Clash Verge Rev' }, desc: { 'zh-CN': "Star 130k+ 的 Clash 桌面客户端，支持 Windows / macOS / Linux。", 'zh-TW': "Star 130k+ 的 Clash 桌面客戶端，支持 Windows / macOS / Linux。", en: "Clash desktop client with 130k+ stars, for Windows / macOS / Linux.", ja: "スター 130k+ の Clash デスクトップクライアント。" }, url: 'https://github.com/clash-verge-rev/clash-verge-rev', category: '开源项目', icon: '🚀', tags: ['代理', 'VPN', '开源'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'PyCharm', 'zh-TW': 'PyCharm', en: 'PyCharm', ja: 'PyCharm' }, desc: { 'zh-CN': "JetBrains 出品的 Python 集成开发环境官方下载。", 'zh-TW': "JetBrains 出品的 Python 集成開發環境官方下載。", en: "Official download of the Python IDE by JetBrains.", ja: "JetBrains 製 Python IDE の公式ダウンロード。" }, url: 'https://www.jetbrains.com/pycharm/download/', category: '开发工具', icon: '💻', tags: ['IDE', 'Python'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'RStudio', 'zh-TW': 'RStudio', en: 'RStudio', ja: 'RStudio' }, desc: { 'zh-CN': "RStudio IDE 官方下载（Posit）。", 'zh-TW': "RStudio IDE 官方下載（Posit）。", en: "Official download of the RStudio IDE (Posit).", ja: "RStudio IDE の公式ダウンロード（Posit）。" }, url: 'https://posit.co/download/rstudio-desktop/', category: '开发工具', icon: '🖥️', tags: ['R', 'IDE'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'TeXstudio', 'zh-TW': 'TeXstudio', en: 'TeXstudio', ja: 'TeXstudio' }, desc: { 'zh-CN': "LaTeX 编辑器 TeXstudio 官方下载。", 'zh-TW': "LaTeX 編輯器 TeXstudio 官方下載。", en: "Official download of the TeXstudio LaTeX editor.", ja: "LaTeX エディタ TeXstudio の公式ダウンロード。" }, url: 'https://www.texstudio.org/', category: '开发工具', icon: '📜', tags: ['LaTeX', '编辑器'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'TeXworks', 'zh-TW': 'TeXworks', en: 'TeXworks', ja: 'TeXworks' }, desc: { 'zh-CN': "TeX Live 自带的 LaTeX 编辑器官方下载。", 'zh-TW': "TeX Live 自帶的 LaTeX 編輯器官方下載。", en: "Official download of the LaTeX editor bundled with TeX Live.", ja: "TeX Live 同梱の LaTeX エディタ。" }, url: 'https://www.tug.org/texworks/', category: '开发工具', icon: '📄', tags: ['LaTeX', '编辑器'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'VS Code', 'zh-TW': 'VS Code', en: 'VS Code', ja: 'VS Code' }, desc: { 'zh-CN': "微软出品轻量级代码编辑器官方下载。", 'zh-TW': "微軟出品輕量級代碼編輯器官方下載。", en: "Official download of the lightweight code editor by Microsoft.", ja: "Microsoft 製の軽量コードエディタ。" }, url: 'https://code.visualstudio.com/download', category: '开发工具', icon: '📝', tags: ['编辑器', '开发'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'Steam', 'zh-TW': 'Steam', en: 'Steam', ja: 'Steam' }, desc: { 'zh-CN': "Steam 官方客户端下载页面。", 'zh-TW': "Steam 官方客戶端下載頁面。", en: "Official Steam client download page.", ja: "Steam 公式クライアントのダウンロード。" }, url: 'https://s.team/', category: '游戏平台', icon: '🎮', tags: ['游戏', '平台'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'Python', 'zh-TW': 'Python', en: 'Python', ja: 'Python' }, desc: { 'zh-CN': "Python 官方下载页面，获取最新解释器。", 'zh-TW': "Python 官方下載頁面，獲取最新解釋器。", en: "Official Python download page for the latest interpreter.", ja: "Python の公式ダウンロードページ。" }, url: 'https://www.python.org/downloads/', category: '编程语言', icon: '🐍', tags: ['Python', '编程'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'R', 'zh-TW': 'R', en: 'R', ja: 'R' }, desc: { 'zh-CN': "R 语言官方下载，统计计算与图形。", 'zh-TW': "R 語言官方下載，統計計算與圖形。", en: "Official download of the R language for statistical computing and graphics.", ja: "統計計算とグラフィックスのための R 言語。" }, url: 'https://cran.r-project.org/', category: '编程语言', icon: '📊', tags: ['R', '统计'], added: '2026-08-22', size: '—' },
  { title: { 'zh-CN': 'OriginLab Origin', 'zh-TW': 'OriginLab Origin', en: 'OriginLab Origin', ja: 'OriginLab Origin' }, desc: { 'zh-CN': "科学绘图与数据分析软件官方下载（数据分析/科研绘图常用）。", 'zh-TW': "科學繪圖與數據分析軟件官方下載（數據分析/科研繪圖常用）。", en: "Official download of Origin — scientific plotting and data analysis software.", ja: "科学グラフ・データ分析ソフト Origin の公式ダウンロード。" }, url: 'https://www.originlab.com/', category: '学习', icon: '📈', tags: ['数据分析', '科研绘图'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'LINGO', 'zh-TW': 'LINGO', en: 'LINGO', ja: 'LINGO' }, desc: { 'zh-CN': "数学建模与优化求解软件官方下载（Lindo Systems）。", 'zh-TW': "數學建模與優化求解軟件官方下載（Lindo Systems）。", en: "Official download of LINGO — optimization solver by Lindo Systems.", ja: "数理モデリング・最適化ソルバ LINGO の公式ダウンロード。" }, url: 'https://www.lindo.com/', category: '学习', icon: '🧮', tags: ['数学建模', '优化'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'MATLAB', 'zh-TW': 'MATLAB', en: 'MATLAB', ja: 'MATLAB' }, desc: { 'zh-CN': "MathWorks 数值计算与数据分析软件官方页面。", 'zh-TW': "MathWorks 數值計算與數據分析軟件官方頁面。", en: "Official page of MATLAB by MathWorks for numerical computing.", ja: "MathWorks MATLAB の公式ページ。" }, url: 'https://www.mathworks.com/products/matlab.html', category: '编程语言', icon: '🧠', tags: ['数据分析', '数值计算'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'Navicat', 'zh-TW': 'Navicat', en: 'Navicat', ja: 'Navicat' }, desc: { 'zh-CN': "数据库可视化开发管理工具（navcat）官方下载。", 'zh-TW': "數據庫可視化開發管理工具（navcat）官方下載。", en: "Official download of the Navicat database management tool.", ja: "データベース管理ツール Navicat の公式ダウンロード。" }, url: 'https://navicat.com.cn/products', category: '开发工具', icon: '🗄️', tags: ['数据库', 'SQL'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': "WPS Office 考试版", 'zh-TW': "WPS Office 考試版", en: "WPS Office (NCRE)", ja: "WPS Office (NCRE)" }, desc: { 'zh-CN': "全国计算机等级考试（NCRE）WPS Office 教育考试专用版下载。", 'zh-TW': "全國計算機等級考試（NCRE）WPS Office 教育考試專用版下載。", en: "WPS Office education edition for China's NCRE exams.", ja: "全国コンピュータ等級試験（NCRE）用 WPS Office。" }, url: 'https://ncre.neea.edu.cn/html1/report/1507/861-1.htm', category: '学习', icon: '📚', tags: ['WPS', 'NCRE', '考试'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'IntelliJ IDEA', 'zh-TW': 'IntelliJ IDEA', en: 'IntelliJ IDEA', ja: 'IntelliJ IDEA' }, desc: { 'zh-CN': "JetBrains 出品 Java 集成开发环境官方下载。", 'zh-TW': "JetBrains 出品 Java 集成開發環境官方下載。", en: "Official download of the Java IDE by JetBrains.", ja: "JetBrains 製 Java IDE の公式ダウンロード。" }, url: 'https://www.jetbrains.com/idea/download/', category: '开发工具', icon: '💡', tags: ['IDE', 'Java'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'WebStorm', 'zh-TW': 'WebStorm', en: 'WebStorm', ja: 'WebStorm' }, desc: { 'zh-CN': "JetBrains 出品 JavaScript 前端开发 IDE 官方下载。", 'zh-TW': "JetBrains 出品 JavaScript 前端開發 IDE 官方下載。", en: "Official download of the JavaScript IDE by JetBrains.", ja: "JetBrains 製 JavaScript IDE の公式ダウンロード。" }, url: 'https://www.jetbrains.com/webstorm/download/', category: '开发工具', icon: '🌊', tags: ['IDE', 'JavaScript'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'Dev-C++', 'zh-TW': 'Dev-C++', en: 'Dev-C++', ja: 'Dev-C++' }, desc: { 'zh-CN': "轻量 C/C++ 集成开发环境，Embarcadero 官方 GitHub 仓库。", 'zh-TW': "輕量 C/C++ 集成開發環境，Embarcadero 官方 GitHub 倉庫。", en: "Lightweight C/C++ IDE — official Embarcadero GitHub repo.", ja: "軽量 C/C++ IDE。Embarcadero 公式 GitHub。" }, url: 'https://github.com/Embarcadero/Dev-Cpp', category: '开发工具', icon: '⚙️', tags: ['C++', 'IDE', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'CC Switch', 'zh-TW': 'CC Switch', en: 'CC Switch', ja: 'CC Switch' }, desc: { 'zh-CN': "Claude Code 服务商一键切换工具（开源 GitHub 仓库）。", 'zh-TW': "Claude Code 服務商一鍵切換工具（開源 GitHub 倉庫）。", en: "One-click provider switcher for Claude Code (open-source GitHub repo).", ja: "Claude Code のプロバイダ切替ツール（オープンソース）。" }, url: 'https://github.com/farion1231/cc-switch', category: '开源项目', icon: '🔀', tags: ['Claude', '切换工具', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'React', 'zh-TW': 'React', en: 'React', ja: 'React' }, desc: { 'zh-CN': "Meta 出品的 JavaScript UI 框架官方文档与下载。", 'zh-TW': "Meta 出品的 JavaScript UI 框架官方文檔與下載。", en: "Official docs and downloads for the JavaScript UI framework by Meta.", ja: "Meta 製 JavaScript UI フレームワークの公式ドキュメント。" }, url: 'https://react.dev/', category: '开源项目', icon: '⚛️', tags: ['前端', '框架', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': "VLC 播放器", 'zh-TW': "VLC 播放器", en: "VLC Media Player", ja: "VLC メディアプレーヤー" }, desc: { 'zh-CN': "开源万能视频播放器官方下载，支持几乎所有格式。", 'zh-TW': "開源萬能視頻播放器官方下載，支持幾乎所有格式。", en: "Official download of the open-source VLC player — plays almost everything.", ja: "オープンソースの万能動画プレーヤー。" }, url: 'https://www.videolan.org/vlc/', category: '视频', icon: '🎬', tags: ['播放器', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'DaVinci Resolve', 'zh-TW': 'DaVinci Resolve', en: 'DaVinci Resolve', ja: 'DaVinci Resolve' }, desc: { 'zh-CN': "达芬奇：专业视频剪辑与调色软件官方下载。", 'zh-TW': "達芬奇：專業視頻剪輯與調色軟件官方下載。", en: "Official download of DaVinci Resolve — pro video editing and color grading.", ja: "動画編集・カラーグレーディングの DaVinci Resolve。" }, url: 'https://www.blackmagicdesign.com/products/davinciresolve', category: '视频', icon: '🎞️', tags: ['剪辑', '调色'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'Blender', 'zh-TW': 'Blender', en: 'Blender', ja: 'Blender' }, desc: { 'zh-CN': "开源三维建模与动画软件官方下载。", 'zh-TW': "開源三維建模與動畫軟件官方下載。", en: "Official download of the open-source 3D modeling and animation suite.", ja: "オープンソース 3D モデリング・アニメーションソフト。" }, url: 'https://www.blender.org/download/', category: '视频', icon: '🧊', tags: ['3D', '建模', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'OBS Studio', 'zh-TW': 'OBS Studio', en: 'OBS Studio', ja: 'OBS Studio' }, desc: { 'zh-CN': "开源录屏与直播推流软件官方下载。", 'zh-TW': "開源錄屏與直播推流軟件官方下載。", en: "Official download of the open-source screen recorder and streaming app.", ja: "オープンソースの録画・配信ソフト。" }, url: 'https://obsproject.com/download', category: '视频', icon: '📹', tags: ['录屏', '直播', '开源'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'Obsidian', 'zh-TW': 'Obsidian', en: 'Obsidian', ja: 'Obsidian' }, desc: { 'zh-CN': "本地优先的 Markdown 笔记与知识库软件官方下载。", 'zh-TW': "本地優先的 Markdown 筆記與知識庫軟件官方下載。", en: "Official download of Obsidian — local-first Markdown notes and knowledge base.", ja: "ローカル優先の Markdown ノートアプリ。" }, url: 'https://obsidian.md/download', category: '工具', icon: '📓', tags: ['笔记', 'Markdown'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'itch.io', 'zh-TW': 'itch.io', en: 'itch.io', ja: 'itch.io' }, desc: { 'zh-CN': "独立游戏发布与下载平台。", 'zh-TW': "獨立遊戲發布與下載平台。", en: "Platform for publishing and downloading indie games.", ja: "インディーゲームの配信プラットフォーム。" }, url: 'https://itch.io/', category: '游戏', icon: '👾', tags: ['独立游戏', '平台'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'GOG', 'zh-TW': 'GOG', en: 'GOG', ja: 'GOG' }, desc: { 'zh-CN': "无 DRM 游戏平台，老游戏与经典作品丰富。", 'zh-TW': "無 DRM 遊戲平台，老遊戲與經典作品豐富。", en: "DRM-free game store rich in classics.", ja: "DRM フリーのゲームストア。クラシックが豊富。" }, url: 'https://www.gog.com/', category: '游戏', icon: '🕹️', tags: ['游戏', 'DRM-Free'], added: '2026-08-23', size: '—' },
  { title: { 'zh-CN': 'Node.js', 'zh-TW': 'Node.js', en: 'Node.js', ja: 'Node.js' }, desc: { 'zh-CN': "JavaScript 运行时官方中文下载与文档，LTS 长期支持版本推荐。", 'zh-TW': "JavaScript 運行時官方中文下載與文檔，LTS 長期支持版本推薦。", en: "Official Node.js downloads and docs — LTS recommended.", ja: "JavaScript ランタイム Node.js の公式ダウンロードとドキュメント。" }, url: 'https://nodejs.org/zh-cn', category: '编程语言', icon: '🟢', tags: ['Node.js', 'JavaScript', '运行时'], added: '2026-08-23', size: '—' }
];

export const LS_RES = 'zelm_resources';

export function loadResources() {
  let arr = null;
  try { arr = JSON.parse(localStorage.getItem(LS_RES)); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || arr.length === 0) {
    arr = DEFAULT_RESOURCES.map((r, i) => ({ ...r, id: 'r' + (i + 1) }));
  }
  arr.forEach((r, i) => { if (!r.id) r.id = 'r' + i + Date.now(); });
  return arr;
}

export function saveResources(list) {
  try { localStorage.setItem(LS_RES, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
}

/** 把新增的默认资源合并进已有数据（不覆盖自定义条目），并同步种子字段。 */
export function ensureDefaultResources(list) {
  let changed = false;
  DEFAULT_RESOURCES.forEach((d, i) => {
    const idx = list.findIndex((r) => r.url === d.url);
    if (idx === -1) {
      list.push({ ...d, id: 'r_new_' + i + '_' + Date.now() });
      changed = true;
    } else {
      const r = list[idx];
      if (JSON.stringify(r.category) !== JSON.stringify(d.category) ||
          r.title !== d.title || r.desc !== d.desc || r.icon !== d.icon) {
        r.category = d.category; r.title = d.title; r.desc = d.desc; r.icon = d.icon;
        changed = true;
      }
    }
  });
  return changed;
}

/* 一个资源可有多个分类：category 支持字符串或数组 */
export function itemCats(item) {
  if (Array.isArray(item.category)) return item.category;
  return item.category ? [item.category] : [];
}

const RES_CAT_MAP = {
  '仓库': 'catRepo', '服务': 'catSvc', '工具': 'catTool', '视频': 'catVideo',
  '开发工具': 'catDev', '游戏平台': 'catGame', '开源项目': 'catOpenSource', '编程语言': 'catLang',
  '学习': 'catStudy', '游戏': 'catGames',
};
export function resCatLabel(cat) {
  const key = RES_CAT_MAP[cat];
  return key ? t(key) : cat;
}
export function itemCatLabel(item) {
  return itemCats(item).map((c) => resCatLabel(c)).join(' · ');
}
