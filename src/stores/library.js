/* ==========================================================================
 * src/stores/library.js —— 快捷网页 + 资源下载（Pinia）
 *
 * 原状：src/modules/pages/home.js 里两套几乎同构的「种子 + localStorage 持久化
 *   + 关键词过滤 + 分类过滤 + 分页」逻辑，各占约 300 行；渲染全部靠 innerHTML，
 *   再给每张卡片、每个页码按钮单独 addEventListener。
 * 现在：数据与持久化收在这里，两个区块组件（QuickLinks.vue / Resources.vue）
 *   只持有「当前分类 / 关键词 / 页码」这点 UI 状态，列表交给模板 v-for。
 *
 * 存储键与数据结构**完全沿用原站**（zelm_quicklinks / zelm_resources）：
 * 老用户自己添加的条目、置顶状态都不会丢，导出的配置也能被原站版本读回。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useI18n, i18n } from '@/core/i18n';

const { t } = useI18n('home');

/* =========================================================
 * 快捷网页（默认知名站点 + 自定义增删）
 * ========================================================= */
export const QUICK_SEED = [
  { name: '12306', url: 'https://www.12306.cn', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#0066CC"><path d="M12 2C8 2 4 3 4 6v10c0 1.5.5 3 2 4l-1 2h14l-1-2c1.5-1 2-2.5 2-4V6c0-3-4-4-8-4zm-3 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm6 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM6 9V7h12v2H6z"/></svg>', group: '工具', desc: { 'zh-CN': "中国铁路官方购票平台。", 'zh-TW': "中國鐵路官方購票平台。", en: "Official ticketing platform of China Railway.", ja: "中国鉄道の公式乗車券予約プラットフォーム。" } },
  { name: { 'zh-CN': "百度", en: "Baidu" }, url: 'https://www.baidu.com', icon: '🐾', group: '搜索', desc: { 'zh-CN': "全球最大的中文搜索引擎，资料检索首选。", 'zh-TW': "全球最大的中文搜尋引擎，資料檢索首選。", en: "The largest Chinese search engine — the go-to for web search.", ja: "世界最大級の中国語検索エンジン。" } },
  { name: { 'zh-CN': "哔哩哔哩", en: "Bilibili" }, url: 'https://www.bilibili.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#FB7299"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>', group: ['视频', '学习'], desc: { 'zh-CN': "年轻人学习、娱乐与创作社区。", 'zh-TW': "年輕人學習、娛樂與創作社區。", en: "Video community for learning, entertainment and creation.", ja: "若者に人気の動画コミュニティ。" } },
  { name: { 'zh-CN': "重科统一认证", en: "CQUST CAS" }, url: 'https://cas.cqust.edu.cn/authserver/login?service=https%3A%2F%2Fcasp.cqust.edu.cn%2Flogin%3FportalService%3Dhttps%253A%252F%252Fcasp.cqust.edu.cn%252Findex.html%2523%252F%23%2F', icon: '🔐', group: '校园', desc: { 'zh-CN': "重庆科技大学统一身份认证平台，校内系统单点登录。", 'zh-TW': "重慶科技大學統一身份認證平台，校內系統單點登錄。", en: "Unified identity authentication (SSO) for CQUST campus systems.", ja: "重慶科技大学の統一認証プラットフォーム（学内 SSO）。" } },
  { name: { 'zh-CN': "菜鸟教程", en: "Runoob" }, url: 'https://www.runoob.com', icon: '📖', group: ['校园', '学习'], desc: { 'zh-CN': "编程入门教程，涵盖前端、后端、数据库等多种技术。", 'zh-TW': "編程入門教程，涵蓋前端、後端、數據庫等多種技術。", en: "Beginner-friendly programming tutorials covering frontend, backend, databases and more.", ja: "初心者向けプログラミングチュートリアル集。" } },
  { name: { 'zh-CN': "超星学习通", en: "Chaoxing" }, url: 'https://www.chaoxing.com', icon: '📚', group: '校园', desc: { 'zh-CN': "高校常用在线学习平台，课程签到与作业提交。", 'zh-TW': "高校常用在線學習平台，課程簽到與作業提交。", en: "Popular online learning platform for universities — attendance and assignments.", ja: "大学で広く使われるオンライン学習プラットフォーム。" } },
  { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#00A67E"><path d="M22.281 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.748-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.585a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.526-3.019l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.364v2.331a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.645zM2.34 7.895a4.485 4.485 0 0 1 2.369-1.977V11.6a.766.766 0 0 0 .388.676l5.815 3.35-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.596 3.855l-5.833-3.388 2.02-1.164a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.124v-5.682a.79.79 0 0 0-.412-.681zm2.01-3.024l-.141-.085-4.774-2.781a.776.776 0 0 0-.785 0L9.409 9.23V6.883a.066.066 0 0 1 .028-.057l4.83-2.786a4.5 4.5 0 0 1 6.68 4.665zM8.307 12.063l-2.02-1.164a.08.08 0 0 1-.038-.057V5.28a4.5 4.5 0 0 1 7.375-3.458l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.364l2.602-1.498 2.607 1.498v2.996l-2.597 1.498-2.607-1.498z"/></svg>', group: 'AI', desc: { 'zh-CN': "OpenAI 的旗舰 AI 对话助手。", 'zh-TW': "OpenAI 的旗艦 AI 對話助手。", en: "OpenAI flagship AI chat assistant.", ja: "OpenAI の旗艦 AI アシスタント。" } },
  { name: 'Claude', url: 'https://claude.ai', icon: '🪐', group: 'AI', desc: { 'zh-CN': "Anthropic 出品，长文写作与代码能力突出。", 'zh-TW': "Anthropic 出品，長文寫作與代碼能力突出。", en: "By Anthropic — strong at long-form writing and coding.", ja: "Anthropic 製。長文執筆とコードに強い。" } },
  { name: 'CSDN', url: 'https://www.csdn.net', icon: '📰', group: ['校园', '学习'], desc: { 'zh-CN': "中文技术博客社区，编程问题解答与技术分享。", 'zh-TW': "中文技術博客社區，編程問題解答與技術分享。", en: "Chinese tech blog community for Q&A and knowledge sharing.", ja: "中国の技術ブログコミュニティ。" } },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🐋', group: 'AI', desc: { 'zh-CN': "国产开源大模型，推理能力强且免费。", 'zh-TW': "國產開源大模型，推理能力強且免費。", en: "Chinese open-source LLM — strong reasoning, free to use.", ja: "中国発オープンソース大規模モデル。推論が強力で無料。" } },
  { name: { 'zh-CN': "高德地图", en: "Amap" }, url: 'https://www.amap.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#2B99FF"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>', group: '工具', desc: { 'zh-CN': "导航与生活服务地图。", 'zh-TW': "導航與生活服務地圖。", en: "Maps, navigation and local life services.", ja: "ナビと生活サービス地図。" } },
  { name: 'Gemini', url: 'https://gemini.google.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#4285F4"><path d="M12 2L9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z"/></svg>', group: 'AI', desc: { 'zh-CN': "Google 的多模态 AI 助手。", 'zh-TW': "Google 的多模態 AI 助手。", en: "Multimodal AI assistant by Google.", ja: "Google のマルチモーダル AI アシスタント。" } },
  { name: 'GitHub', url: 'https://github.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-3.795-.735-.54-1.38-1.32-1.755-1.32-1.755-1.08-.735.085-.72.085-.72 1.2.09 1.83 1.215 1.83 1.215 1.065 1.83 2.79 1.305 3.48.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>', group: '工具', desc: { 'zh-CN': "代码托管与开源协作平台。", 'zh-TW': "代碼託管與開源協作平台。", en: "Code hosting and open-source collaboration platform.", ja: "コードホスティングとオープンソース協作プラットフォーム。" } },
  { name: 'Gmail', url: 'https://mail.google.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#EA4335"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>', group: '工具', desc: { 'zh-CN': "Google 邮箱服务。", 'zh-TW': "Google 郵箱服務。", en: "Email service by Google.", ja: "Google のメールサービス。" } },
  { name: 'Google', url: 'https://www.google.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#4285F4"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>', group: '搜索', desc: { 'zh-CN': "全球搜索引擎，学术与开发检索常用。", 'zh-TW': "全球搜尋引擎，學術與開發檢索常用。", en: "Global search engine — common for academic and dev searches.", ja: "世界中で使われる検索エンジン。" } },
  { name: { 'zh-CN': "京东", en: "JD.com" }, url: 'https://www.jd.com', icon: '📦', group: '购物', desc: { 'zh-CN': "自营电商，3C 数码与次日达体验好。", 'zh-TW': "自營電商，3C 數碼與次日達體驗好。", en: "B2C e-commerce known for electronics and next-day delivery.", ja: "中国の大手 EC。デジタル製品と翌日配達が強み。" } },
  { name: { 'zh-CN': "掘金", en: "Juejin" }, url: 'https://juejin.cn', icon: '⛏️', group: '校园', desc: { 'zh-CN': "开发者技术社区，前端、后端、移动端技术文章分享。", 'zh-TW': "開發者技術社區，前端、後端、移動端技術文章分享。", en: "Developer community sharing frontend, backend and mobile articles.", ja: "開発者向け技術コミュニティ。" } },
  { name: { 'zh-CN': "慕课网", en: "imooc" }, url: 'https://www.imooc.com', icon: '💻', group: '学习', desc: { 'zh-CN': "国内知名IT技能学习平台，编程视频教程丰富。", 'zh-TW': "國內知名IT技能學習平台，編程視頻教程豐富。", en: "Well-known IT skills platform with rich programming video courses.", ja: "中国屈指の IT スキル学習プラットフォーム。" } },
  { name: 'Perplexity', url: 'https://www.perplexity.ai', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4l4 8-4 8-4-8z"/></svg>', group: 'AI', desc: { 'zh-CN': "AI 驱动的实时答案搜索引擎。", 'zh-TW': "AI 驅動的實時答案搜索引擎。", en: "AI-powered real-time answer engine.", ja: "AI 搭載のリアルタイム回答エンジン。" } },
  { name: 'QQ', url: 'https://im.qq.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#12B7F5"><path d="M21.395 15.035a39.548 39.548 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.527 4.632 17.351 0 12 0S4.473 4.632 4.473 9.241c0 .274.013.804.014.836l-1.08 2.695a38.97 38.97 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.541.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.133-.458-.301-.778-.482-.356-1.233-.646-1.845-.835 1.638-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673z"/></svg>', group: '社交', desc: { 'zh-CN': "腾讯QQ官方网站，可下载客户端或使用网页版聊天。", 'zh-TW': "騰訊QQ官方網站，可下載客戶端或使用網頁版聊天。", en: "Official Tencent QQ site — desktop client or web chat.", ja: "腾讯 QQ の公式サイト。" } },
  { name: { 'zh-CN': "淘宝", en: "Taobao" }, url: 'https://www.taobao.com', icon: '🛒', group: '购物', desc: { 'zh-CN': "阿里巴巴旗下综合购物平台。", 'zh-TW': "阿里巴巴旗下綜合購物平台。", en: "Comprehensive shopping marketplace by Alibaba.", ja: "阿里巴巴系の総合ショッピングモール。" } },
  { name: { 'zh-CN': "腾讯课堂", en: "Tencent Classroom" }, url: 'https://ke.qq.com', icon: '📚', group: '学习', desc: { 'zh-CN': "腾讯在线教育平台，职业培训与考证课程丰富。", 'zh-TW': "騰訊在線教育平台，職業培訓與考證課程豐富。", en: "Online education platform by Tencent for vocational training and certifications.", ja: "腾讯のオンライン教育プラットフォーム。" } },
  { name: { 'zh-CN': "通义千问", en: "Qwen" }, url: 'https://tongyi.aliyun.com', icon: '🧠', group: 'AI', desc: { 'zh-CN': "阿里云推出的大语言模型。", 'zh-TW': "阿里雲推出的大語言模型。", en: "Large language model by Alibaba Cloud.", ja: "Alibaba Cloud の大規模言語モデル。" } },
  { name: { 'zh-CN': "网易云课堂", en: "NetEase Cloud Class" }, url: 'https://study.163.com', icon: '🎓', group: '学习', desc: { 'zh-CN': "网易旗下在线学习平台，职场技能与兴趣课程。", 'zh-TW': "網易旗下在線學習平台，職場技能與興趣課程。", en: "NetEase online learning platform for career skills and hobbies.", ja: "NetEase 系オンライン学習プラットフォーム。" } },
  { name: { 'zh-CN': "微博", en: "Weibo" }, url: 'https://weibo.com', icon: '📢', group: '社交', desc: { 'zh-CN': "中文社交媒体与实时热点广场。", 'zh-TW': "中文社交媒體與實時熱點廣場。", en: "Chinese social media and trending topics.", ja: "中国のソーシャルメディアとトレンド広場。" } },
  { name: { 'zh-CN': "文心一言", en: "ERNIE Bot" }, url: 'https://yiyan.baidu.com', icon: '💡', group: 'AI', desc: { 'zh-CN': "百度推出的中文 AI 助手。", 'zh-TW': "百度推出的中文 AI 助手。", en: "Chinese AI assistant by Baidu.", ja: "百度の AI アシスタント。" } },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org', icon: '📚', group: '搜索', desc: { 'zh-CN': "自由百科全书。", 'zh-TW': "自由百科全書。", en: "The free encyclopedia.", ja: "自由な百科事典。" } },
  { name: { 'zh-CN': "我要自学网", en: "51zxw" }, url: 'https://www.51zxw.net', icon: '✏️', group: '学习', desc: { 'zh-CN': "设计、办公、编程等软件视频教程自学平台。", 'zh-TW': "設計、辦公、編程等軟件視頻教程自學平台。", en: "Self-study video tutorials for design, office and programming software.", ja: "デザイン・オフィス・プログラミングの動画チュートリアルサイト。" } },
  { name: 'X (Twitter)', url: 'https://x.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>', group: '社交', desc: { 'zh-CN': "实时资讯与社交平台。", 'zh-TW': "實時資訊與社交平台。", en: "Real-time news and social platform.", ja: "リアルタイム情報と SNS プラットフォーム。" } },
  { name: { 'zh-CN': "学堂在线", en: "XuetangX" }, url: 'https://www.xuetangx.com', icon: '🎓', group: '校园', desc: { 'zh-CN': "清华大学推出的精品慕课平台，高校课程在线学习。", 'zh-TW': "清華大學推出的精品慕課平台，高校課程在線學習。", en: "MOOC platform by Tsinghua University — online university courses.", ja: "清華大学発の MOOC プラットフォーム。" } },
  { name: { 'zh-CN': "学信网", en: "CHSI" }, url: 'https://www.chsi.com.cn', icon: '🎫', group: '校园', desc: { 'zh-CN': "教育部学历查询官方网站，学籍学历认证与查询。", 'zh-TW': "教育部學歷查詢官方網站，學籍學歷認證與查詢。", en: "Official MOE site for academic credential verification (CHSI).", ja: "中国教育部の学籍・学歴認証公式サイト。" } },
  { name: { 'zh-CN': "雨课堂", en: "Rain Classroom" }, url: 'https://www.yuketang.cn', icon: '📱', group: '学习', desc: { 'zh-CN': "清华大学推出的智慧教学工具，在线课堂与作业提交。", 'zh-TW': "清華大學推出的智慧教學工具，在線課堂與作業提交。", en: "Smart teaching tool by Tsinghua — online classes and homework.", ja: "清華大学発のスマート教育ツール。" } },
  { name: 'YouTube', url: 'https://www.youtube.com', icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>', group: '视频', desc: { 'zh-CN': "全球最大视频平台，教程与纪录内容丰富。", 'zh-TW': "全球最大視頻平台，教程與紀錄內容豐富。", en: "The world's largest video platform — tutorials and documentaries.", ja: "世界最大の動画プラットフォーム。" } },
  { name: { 'zh-CN': "知乎", en: "Zhihu" }, url: 'https://www.zhihu.com', icon: '📝', group: '社交', desc: { 'zh-CN': "问答与深度内容社区。", 'zh-TW': "問答與深度內容社區。", en: "Q&A and in-depth content community.", ja: "Q&A と深い内容のコミュニティ。" } },
  { name: { 'zh-CN': "知网", en: "CNKI" }, url: 'https://www.cnki.net', icon: '📄', group: '校园', desc: { 'zh-CN': "中国知网，学术论文检索与下载，毕业论文查重必备。", 'zh-TW': "中國知網，學術論文檢索與下載，畢業論文查重必備。", en: "CNKI — academic paper search and download; essential for thesis checks.", ja: "中国知網（CNKI）。学術論文の検索・ダウンロード。" } },
  { name: { 'zh-CN': "中国大学MOOC", en: "China MOOC" }, url: 'https://www.icourse163.org', icon: '🏫', group: '校园', desc: { 'zh-CN': "网易与高教社推出的慕课平台，国内名校课程免费学。", 'zh-TW': "網易與高教社推出的慕課平台，國內名校課程免費學。", en: "MOOC platform by NetEase and Higher Ed Press — free courses from top universities.", ja: "NetEase と高教社の MOOC。名門大学の講座が無料。" } },
  { name: 'Qwerty Learner', url: 'https://qwerty.kaiyi.cool', icon: '⌨️', group: '学习', desc: { 'zh-CN': "键盘打字练习工具，支持单词、代码等多种练习模式。", 'zh-TW': "鍵盤打字練習工具，支持單詞、代碼等多種練習模式。", en: "Typing practice tool — words, code and more modes.", ja: "タイピング練習ツール。単語やコードなど複数モード。" } },
  { name: { 'zh-CN': "网易云音乐", en: "NetEase Music" }, url: 'https://music.163.com', icon: '🎵', group: '娱乐', desc: { 'zh-CN': "网易旗下音乐播放平台，海量曲库与社区评论。", 'zh-TW': "網易旗下音樂播放平台，海量曲庫與社區評論。", en: "NetEase music streaming with a huge library and community comments.", ja: "NetEase 系音楽ストリーミング。" } },
  { name: { 'zh-CN': "抖音", en: "Douyin" }, url: 'https://www.douyin.com', icon: '🎬', group: '娱乐', desc: { 'zh-CN': "抖音短视频官方网页版，海量短视频内容。", 'zh-TW': "抖音短視頻官方網頁版，海量短視頻內容。", en: "Official web version of Douyin short videos.", ja: "抖音（Douyin）の公式ウェブ版。" } },
  { name: 'Kaggle', url: 'https://www.kaggle.com', icon: '🤖', group: '学习', desc: { 'zh-CN': "全球数据科学竞赛平台，数据集、Notebook 与课程一应俱全。", 'zh-TW': "全球數據科學競賽平台，數據集、Notebook 與課程一應俱全。", en: "The global data science competition hub — datasets, notebooks and courses.", ja: "世界のデータサイエンス競技プラットフォーム。" } },
  { name: { 'zh-CN': "Gitee 码云", en: "Gitee" }, url: 'https://gitee.com', icon: '🐉', group: '工具', desc: { 'zh-CN': "国内代码托管平台，支持 Git 仓库与团队协作。", 'zh-TW': "國內代碼託管平台，支持 Git 倉庫與團隊協作。", en: "Chinese code hosting platform with Git repos and team collaboration.", ja: "中国のコードホスティング平台。Git とチーム協作を支援。" } }
];

/* 存储键沿用原站 */
export const LS_QUICK = 'zelm_quicklinks';

function loadQuick() {
  let arr = null;
  try { arr = JSON.parse(localStorage.getItem(LS_QUICK)); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || arr.length === 0) {
    arr = QUICK_SEED.map((q, i) => ({ ...q, id: 'q' + (i + 1), pinned: false }));
  }
  arr.forEach((q, i) => {
    if (!q.id) q.id = 'q' + i + Date.now();
    if (q.pinned === undefined) q.pinned = false;
  });
  return arr;
}

function saveQuick(list) {
  try { localStorage.setItem(LS_QUICK, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
}

/**
 * 把种子里新增的站点补进来，并同步既有条目的分组 / 名称 / 图标 / 简介
 * （用户的 id 与置顶状态保留）—— 原站 ensureDefaultQuickLinks。
 */
function ensureDefaultQuickLinks(list) {
  let changed = false;
  QUICK_SEED.forEach((d, i) => {
    const idx = list.findIndex((q) => q.url === d.url);
    if (idx === -1) {
      list.push({ ...d, id: 'q_new_' + i + '_' + Date.now(), pinned: false });
      changed = true;
    } else {
      const q = list[idx];
      if (q.name !== d.name || JSON.stringify(q.group) !== JSON.stringify(d.group) || q.icon !== d.icon || q.desc !== d.desc) {
        q.name = d.name; q.group = d.group; q.icon = d.icon; q.desc = d.desc;
        changed = true;
      }
    }
  });
  return changed;
}

/* 分类显示名（与原站 QUICK_CAT_MAP 一致） */
const QUICK_CAT_MAP = {
  '全部': 'all',
  '工具': 'catTool', '购物': 'catShopping', '社交': 'catSocial', '视频': 'catVideo',
  '搜索': 'catSearch', '校园': 'catCampus', '学习': 'catStudy', '娱乐': 'catFun', 'AI': 'catAI',
};
export function quickCatLabel(g) {
  const key = QUICK_CAT_MAP[g];
  return key ? t(key) : g;
}

/* 快捷网页支持多分类：group 可为字符串或数组 */
export function qGroups(q) {
  if (Array.isArray(q.group)) return q.group;
  return q.group ? [q.group] : [];
}

/* =========================================================
 * 资源下载（持久化 + 增删 + 富详情）
 * ========================================================= */
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

function loadResources() {
  let arr = null;
  try { arr = JSON.parse(localStorage.getItem(LS_RES)); } catch (e) { arr = null; }
  if (!Array.isArray(arr) || arr.length === 0) {
    arr = DEFAULT_RESOURCES.map((r, i) => ({ ...r, id: 'r' + (i + 1) }));
  }
  arr.forEach((r, i) => { if (!r.id) r.id = 'r' + i + Date.now(); });
  return arr;
}

function saveResources(list) {
  try { localStorage.setItem(LS_RES, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
}

/** 把新增的默认资源合并进已有数据（不覆盖自定义条目），并同步种子字段。 */
function ensureDefaultResources(list) {
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

/*
 * 数据字段支持**按语言分桶**（{ 'zh-CN', 'zh-TW', en, ja }）或纯字符串两种形态：
 *   - 种子数据（QUICK_SEED / DEFAULT_RESOURCES）带四语言桶；
 *   - 用户自建条目 / 老版本 localStorage 数据是纯中文串，回落 zh-CN。
 * 读取一律走 locField：优先当前 locale，缺失回落 zh-CN（2026-09-22 起）。
 */
function locField(v) {
  if (typeof v === 'string') return v;
  if (!v) return '';
  const loc = i18n.global.locale.value;
  return v[loc] || v['zh-CN'] || v.zh || Object.values(v)[0] || '';
}
/* P1 修复（2026-09-23）：资源条目的 tags 在英/日界面下漏中文。
 *
 * 原实现 `if (Array.isArray(v)) return v;` —— 纯数组原样返回，而种子全是
 * `tags: ['代理','VPN','开源']` 这种纯中文数组，于是切到 en/ja 仍显示中文。
 * （分类没有这个问题：category 走 RES_CAT_MAP → i18n key，机制见下方。）
 *
 * 修法沿用**与 RES_CAT_MAP 完全相同的机制**：中文标签 → i18n key → t()。
 *   为什么不用「把种子的 tags 改成四语言桶」：
 *   ① 桶方案要改 27 条种子 + 4 份数组（约 270 个标签串），而映射表只需 27 个 key，
 *      且 IDE / 开源 这类标签在多条条目里复用，映射表天然去重；
 *   ② 更关键：`ensureDefaultResources()` 只同步 category/title/desc/icon，**不含 tags**
 *      —— 桶方案若不改这个函数，老用户的 localStorage 里仍是旧的中文数组，
 *      会出现「新用户正常、老用户照旧漏中文」的静默半修复。映射在渲染期发生，
 *      存储里存什么无所谓，因此**不需要任何数据迁移**；
 *   ③ 语言中立的标签（IDE / Python / SQL / VPN …）与用户自建标签不在表内 → 原样返回，
 *      行为与今天完全一致。
 *
 * 若将来仍想改成桶形态，本函数已同时支持：数组 → 逐项映射；对象 → 先取当前 locale
 * 的数组再逐项映射。两种形态可共存。 */
const TAG_MAP = {
  '代理': 'tagProxy',
  '优化': 'tagOptimize',
  '切换工具': 'tagSwitcher',
  '前端': 'tagFrontend',
  '剪辑': 'tagEditing',
  '平台': 'tagPlatform',
  '建模': 'tagModeling',
  '开发': 'tagDev',
  '开源': 'tagOpenSource',
  '录屏': 'tagScreenRec',
  '播放器': 'tagPlayer',
  '数值计算': 'tagNumeric',
  '数学建模': 'tagMathModeling',
  '数据分析': 'tagDataAnalysis',
  '数据库': 'tagDatabase',
  '框架': 'tagFramework',
  '游戏': 'tagGame',
  '独立游戏': 'tagIndieGame',
  '直播': 'tagLive',
  '科研绘图': 'tagSciPlot',
  '笔记': 'tagNotes',
  '统计': 'tagStatistics',
  '编程': 'tagProgramming',
  '编辑器': 'tagEditor',
  '考试': 'tagExam',
  '调色': 'tagColorGrading',
  '运行时': 'tagRuntime',
};

/** 单个标签的显示名（不在表内的原样返回，例如 IDE / Python / 用户自建标签） */
export function tagLabel(tag) {
  const key = TAG_MAP[tag];
  return key ? t(key) : tag;
}

function locTags(v) {
  const mapAll = (arr) => (Array.isArray(arr) ? arr.map(tagLabel) : []);
  if (Array.isArray(v)) return mapAll(v);
  if (!v) return [];
  const loc = i18n.global.locale.value;
  return mapAll(v[loc] || v['zh-CN'] || v.zh);
}
export function itemName(item) { return locField(item && item.name); }
export function itemTitle(item) { return locField(item && item.title); }
export function itemDesc(item) { return locField(item && item.desc); }
export function itemFull(item) { return locField(item && item.full); }
export function itemTags(item) { return locTags(item && item.tags); }

export const useLibraryStore = defineStore('library', () => {
  const quick = ref(loadQuick());
  if (ensureDefaultQuickLinks(quick.value)) saveQuick(quick.value);

  const resources = ref(loadResources());
  if (ensureDefaultResources(resources.value)) saveResources(resources.value);

  /* ---------------- 快捷网页 ---------------- */
  function quickTogglePin(id) {
    const q = quick.value.find((x) => x.id === id);
    if (!q) return;
    q.pinned = !q.pinned;
    saveQuick(quick.value);
  }
  function quickRemove(id) {
    quick.value = quick.value.filter((x) => x.id !== id);
    saveQuick(quick.value);
  }
  function quickAdd(item) {
    quick.value.push(item);
    saveQuick(quick.value);
  }
  /** 恢复默认列表：清掉本地记录后按种子重算（原站 resetQuickBtn） */
  function quickReset() {
    try { localStorage.removeItem(LS_QUICK); } catch (e) { /* 忽略 */ }
    quick.value = loadQuick();
  }

  /* ---------------- 资源下载 ---------------- */
  function resRemove(id) {
    resources.value = resources.value.filter((x) => x.id !== id);
    saveResources(resources.value);
  }
  function resAdd(item) {
    resources.value.push(item);
    saveResources(resources.value);
  }

  /* ---------------- 过滤 / 排序（原站口径） ---------------- */
  function filterQuick(group, keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    const list = quick.value.filter((q) => {
      if (group !== '全部' && !qGroups(q).includes(group)) return false;
      if (!kw) return true;
      const hay = (itemName(q) + ' ' + (q.name || '') + ' ' + itemDesc(q) + ' ' + (typeof q.group === 'string' ? q.group : (q.group || []).join(' ')) + ' ' + (q.url || '')).toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    // 置顶优先，然后按名称拼音 A-Z
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return itemName(a).localeCompare(itemName(b), 'zh-CN');
    });
    return list;
  }

  function filterRes(category, keyword) {
    const term = (keyword || '').toLowerCase().trim();
    const out = resources.value.filter((item) => {
      const matchCat = category === '全部' || itemCats(item).includes(category);
      const title = (itemTitle(item) + ' ' + (item.title || '')).toLowerCase();
      const desc = itemDesc(item).toLowerCase();
      const tags = itemTags(item).map((x) => x.toLowerCase());
      const matchSearch = !term || title.includes(term) || desc.includes(term) || tags.some((x) => x.includes(term));
      return matchCat && matchSearch;
    });
    out.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), 'zh-CN'));
    return out;
  }

  /** 快捷网页筛选条：全部 + 出现过的分类，按显示名排序 */
  function quickFilterGroups() {
    const set = new Set();
    quick.value.forEach((q) => qGroups(q).forEach((g) => set.add(g)));
    return ['全部', ...Array.from(set).sort((a, b) => quickCatLabel(a).localeCompare(quickCatLabel(b), 'zh-CN'))];
  }
  /** 资源分类筛选条 */
  function resFilterCats() {
    return ['全部', ...Array.from(new Set(resources.value.flatMap((r) => itemCats(r))))
      .sort((a, b) => resCatLabel(a).localeCompare(resCatLabel(b), 'zh-CN'))];
  }

  return {
    quick, resources,
    quickTogglePin, quickRemove, quickAdd, quickReset,
    resRemove, resAdd,
    filterQuick, filterRes, quickFilterGroups, resFilterCats,
  };
});
