/* ==========================================================================
 * 文案包：auth   ← 由 src/modules/auth-panel.js 的 T 抽出
 * 全站只有中文，语言切换功能已彻底移除。
 * agreeText 含 <a> 标记，模板用 v-html 渲染。
 * ========================================================================== */

export default {
  zh: {
    titleLogin: '欢迎回来',
    titleReg: '创建账号',
    tabLogin: '登录',
    tabReg: '注册',
    username: '用户名',
    password: '密码',
    confirm: '确认密码',
    uPlace: '请输入用户名',
    loginNameHint: '用户名就是你的显示名，改名后请用新名字登录',
    pPlace: '请输入密码',
    cPlace: '再次输入密码',
    avatarLabel: '选择头像',
    avatarHint: '选一个你喜欢的头像（注册后可在设置里修改）',
    ruPlace: '请输入用户名',
    rpPlace: '请输入密码',
    uHint: '2-32 位，可包含汉字、字母、数字和下划线，不可与已有账号重复',
    pHint: '至少 8 位',
    btnLogin: '登录',
    btnReg: '注册',
    linkLogin: '还没有账号？',
    linkReg: '已有账号？',
    toReg: '去注册',
    toLogin: '去登录',
    pwMismatch: '两次输入的密码不一致',
    regOk: '注册成功，请登录',
    entering: '登录成功，正在进入…',
    netErr: '网络错误，请重试',
    close: '关闭',
    agreeText: '我已阅读并同意 <a href="#/privacy" target="_blank" rel="noopener">隐私政策</a> 与 <a href="#/privacy/t" target="_blank" rel="noopener">服务条款</a>',
    agreeRequired: '请先阅读并同意隐私政策与服务条款',
    // 顶号弹窗（单端登录守护）—— 原在 music-player 文案包，播放器移除后迁入
    kickTitle: '账号已在其他设备登录',
    conflictAria: '登录冲突确认',
    conflictDescFallback: '该账号已在别处登录，是否继续登录？继续后将顶掉原设备。',
    conflictCancel: '取消',
    conflictContinue: '继续登录',
    avCat: '猫', avDog: '狗', avPanda: '熊猫',
    avFox: '狐狸', avTiger: '老虎', avLion: '狮子',
    kickDesc: '您的账号已在另一台设备登录，您已被下线。',
    kickOk: '我知道了',
  },
};
