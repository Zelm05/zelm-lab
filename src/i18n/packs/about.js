/* ==========================================================================
 * 文案包：about   ← 由 src/modules/pages/about.js 的 DICT 抽出
 * 全站只有中文，语言切换功能已彻底移除。
 *
 * 说明（迁移时逐条核对过的一点）：
 *   原站「关于我」页的标记里，有几处 data-i18n 用的键在本页 DICT 里根本不存在
 *   （footerDisclaimer / linkPrivacy / linkTerms / copyrightContact），
 *   applyI18n 匹配不到就跳过，于是页面显示的是标记里写死的中文。
 *   这里把这 4 条补进包里 —— 文案一字未改，只是从「写死在 HTML」变成「可查」。
 *
 * 设置面板的文案（外观主题 / 布局与交互 / 隐私与访客偏好 / 关于本站）
 * 已统一到 packs/settings.js：主站与关于页共用同一个面板组件，
 * 这里不再保留第二份，避免两边改一处忘一处。
 * ========================================================================== */

export default {
  zh: {
    /* 左侧导航 / 页头 */
    aboutTitle: '关于我', navProjects: '项目作品', blogTitle: '技术博客',
    resumeTitle: '简历', certTitle: '证书', photoWallTitle: '照片墙', settingsBtn: '设置',
    loginBtn: '登录', registerBtn: '注册', logoutBtn: '登出', adminBtnLabel: '管理后台',

    /* 门控：登录门 */
    aboutLoginTitle: '请先登录', aboutLoginSub: '完整关于我页面需要登录账号后才能进入', aboutLoginBtn: '登录账号',
    /* 门控：密码门 */
    gateTitle: '关于我 · 完整版', gateSub: '请输入访问密码', gateBtn: '进入', gateTip: '每次进入都需要输入密码',
    pwEmpty: '请输入密码', pwWrong: '密码错误，请重试', netErr: '网络错误，请重试',

    /* 关于我 */
    aboutSub: '应用统计学专业 · 数据分析方向 · 持续沉淀与分享',
    aboutBioTitle: '个人简介', aboutBio: '应用统计学专业本科，正在系统性学习 SQL / Python / 数据可视化与 BI 工具，用数据把业务故事讲清楚。',
    aboutEduTitle: '教育背景', aboutEdu: '重庆科技大学 · 应用统计学（本科）。',
    aboutStackTitle: '擅长技术栈',
    techML: '机器学习', techRLang: 'R语言', techDataAnalysis: '数据分析', techDataViz: '数据可视化',

    /* 照片墙 */
    photoWallSub: '回忆与灵感，慢慢漂过眼前',

    /* 项目作品 */
    projectsTitle: '项目作品', projectsSub: '实战项目展示，含源码入口与实现说明。',
    projectZelmTitle: 'Zelm 的信息资源库',
    projectZelmDesc: '个人信息资源库，从前端到后端独立完成的作品集项目。后端基于 Cloudflare Workers + D1（SQLite）实现账号体系、留言板、反馈建议与管理后台；前端为 Vue 3 + Vite，按路由分包、静态资源交由 Workers Assets 托管。',
    projectCampusTitle: '校园网自动登录（CQUST）',
    projectCampusDesc: '面向CQUST校园网的自动登录工具：开机自启、断线自动重连、后台保活，免去每次手动认证 portal 的麻烦。同时提供 Windows 桌面端与 Android 移动端，移动端 UI 针对小屏重新设计，桌面端常驻托盘，适合宿舍/机房环境长期在线使用，持续更新中。',
    projectCampusLink: 'GitHub →',

    /* 技术博客 / 简历 / 证书 */
    blogSub: '学习笔记 · 踩坑教程 · 数理与编程干货', blogComing: '📝 文章筹备中，敬请期待…',
    resumeSub: '在线预览 + PDF 下载', resumePlaceholder: '📄 简历文件制作中，PDF 下载入口将在此提供。', resumeDownload: '⬇ 下载 PDF',
    certSub: '四六级 · 计算机二级 · 竞赛获奖', certWip: '证书展示筹备中…',

    /* 页脚联系方式（tooltip 里的账号名与扫码提示） */
    qqNumber: 'QQ号', douyinAccount: '抖音号', scanToAdd: '扫码添加', scanToFollow: '扫码关注',

    /* 页脚声明与法务链接 */
    footerDisclaimer: '本站为个人学习与技术交流用途的作品集，站内资料多整理自互联网公开信息，仅作学习参考，不用于任何商业用途。若您认为站内内容侵犯了您的合法权益，请通过下方邮箱联系，我们会在核实后及时处理。',
    linkPrivacy: '隐私政策', linkTerms: '服务条款', copyrightContact: '版权/侵权投诉',
  },
};
