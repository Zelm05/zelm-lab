/* ==========================================================================
 * 文案包：common —— 全站共用词汇（通用弹窗按钮、通用兜底句）
 *
 * 为什么要单开一个命名空间（而不是塞进 admin / home）：
 *   这些词不属于任何具体页面 —— 确认弹窗在主站、管理台、关于页、设置面板里都会出现。
 *   塞进随便一个页面包，会造成「弹窗模块去 import 某个页面包」的语义耦合，
 *   以后谁引用谁就说不清了。单开一个 common 最干净。
 *
 * P1-4 背景：原先这两个词**直接写死在** src/modules/confirm.js:17
 *   （`return { ok: '确定', cancel: '取消' };`，注释还写着「全站只有中文」），
 *   于是切换 English / 日本語 时确认弹窗的按钮永远是中文。
 *
 * 用词参考（历史来源）：本项目早期曾用 Vant 4 的内置 locale，三语用词沿用了它的写法 ——
 *   zh-TW: 確認 / 取消   en: Confirm / Cancel   ja: 確認 / キャンセル
 *   （Vant 依赖已于 2026-09-23 随「移动端底栏」一起移除，此处仅作选词依据留档。）
 * 这里 zh-CN 保留原值「确定」以避免视觉变化；其余三语取常用写法。
 *
 * P3-6（2026-09-23）：再收两个**跨页面重复出现**的硬编码文案进来 ——
 *   · avatarAlt：Zelm 头像的 alt（欢迎页 / 主站 / 管理台 / 登录弹窗 4 处，
 *     分属 gate / home / admin / auth 四个命名空间。同一个字符串在 4 个包里
 *     各写一遍既啰嗦又容易漏改，放 common 才对得上本包「全站共用词汇」的定位）；
 *   · qqSite：页脚 QQ 图标的悬浮提示（原先硬编码在 src/data/contacts.js）。
 * ========================================================================== */

export default {
  zh: {
    cLoadFail: '加载失败',
    cLogUpdate: '更新日志',
    cLogPersonal: '个人日志',
    cConfirmDelete: '确定删除？不可恢复',
    cDelete: '删除',
    cAddPhoto: '添加照片',
    cAddResume: '上传简历',
    cAddMoment: '发布动态',
    cAddLog: '添加记录',
    cUploading: '上传中…',
    cSaved: '已保存',
    cUploadFail: '上传失败',
    cSaveFail: '保存失败',
    cPickFile: '请选择文件',
    cPdfOnly: '只支持 PDF 文件',
    cNeedTitleContent: '标题和内容都要填',
    cNeedContent: '内容不能为空',
    cTitlePh: '标题',
    cPhotoTitlePh: '照片标题（可选）',
    cDescPh: '描述（可选）',
    cVersionPh: '版本号（如 v1.2）',
    cContentPh: '这次做了什么…',
    cMomentPh: '说点什么…',
    cCancel: '取消',
    cSave: '保存',
    ok: '确定',
    cancel: '取消',
    /** zelmConfirm() 未传 message 时的兜底句（防御性，正常调用都会传翻译好的文案） */
    confirmContinue: '确定继续吗？',
    netTimeout: '请求超时', netAborted: '请求已取消', netError: '网络错误',
    opFailed: '操作失败，请稍后重试',
    /** Zelm 头像的 alt 文本（P3-6：原 4 处硬编码） */
    avatarAlt: 'Zelm 头像',
    /** 页脚 QQ 图标的悬浮提示（P3-6：原硬编码在 data/contacts.js） */
    qqSite: 'QQ 官网',
  },
};
