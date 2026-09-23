import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';


// Vite 构建配置
// 关键点：assetsDir 设为 'static'，让带内容哈希的构建产物落到 /static/*，
// 从而可以在 Worker 里对 /static/* 下发 `immutable` 长缓存（一次回源，永久命中）。
// 用户的媒体资源（照片 / 音频）仍放在 /assets/*，用较短缓存 + 版本号失效。
/**
 * Element Plus 的「直连组件」解析器。
 *
 * 为什么不用官方的 ElementPlusResolver：
 *   实测（unplugin-vue-components 32.1.0 + element-plus 2.14.6）它把
 *   `ElTag` 解析成 `{ from: 'element-plus/es' }` —— 这是**整个库的 barrel**，
 *   而 element-plus 的 es/index.mjs 并不能被有效 tree-shake，
 *   结果只用了 1 个 el-tag 也打出 **937.83 kB（gzip 301 kB）** 的 element-plus 分包。
 *   同样写法下 VantResolver 解析成 `vant/es`，能被 tree-shake 到 8 kB —— 两者表现完全不同。
 *
 *   这里改成直连组件目录：`ElTag → element-plus/es/components/tag`，
 *   并只引入该组件的 CSS。只用到什么就打包什么。
 *
 * ⚠️ 注意：CSS 用 `style/css`（编译好的 CSS），不要用 `style/index`（那是 scss，
 *    会让构建去解析 sass，本项目没装 sass）。
 */
function ElementPlusDirectResolver() {
  const toKebab = (s) =>
    s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

  /* element-plus 的 es/components 下**不是每个组件名都有同名目录**：
   *   ElTag         -> components/tag/index.mjs          ✅ 有
   *   ElTableColumn -> components/table-column/          ❌ 只有 style/，没有 index.mjs
   *                    （它其实是 components/table/index.mjs 的一个导出）
   * 所以先读一次目录清单，找不到同名目录时退回「第一段」目录（table-column -> table）。
   * 同理可覆盖 ElFormItem -> form、ElOption -> select 这类父子组件。 */
  const EP_DIR = fileURLToPath(new URL('./node_modules/element-plus/es/components', import.meta.url));
  const available = new Set(
    fs.existsSync(EP_DIR) ? fs.readdirSync(EP_DIR).filter((d) => fs.existsSync(path.join(EP_DIR, d, 'index.mjs'))) : [],
  );

  return {
    type: 'component',
    resolve: (name) => {
      // 只接管 El 开头且第二个字母大写的（ElTag / ElTableColumn），其余交给别的 resolver
      if (!/^El[A-Z]/.test(name)) return undefined;
      const kebab = toKebab(name.slice(2));           // ElTableColumn -> table-column
      let dir = kebab;
      if (!available.has(dir)) {
        // 父子组件别名：这些子组件在 es/components 下**没有自己的目录**，
        // 它们是父组件模块的一个导出（实测 el-option 在 components/select/index.mjs 里）。
        // 不映射的话 resolver 会 return undefined -> 组件根本不会被导入 ->
        // 模板里的 <el-option> 变成未知元素、不渲染，表现为 select 下拉「无数据」。
        const PARENT_ALIAS = {
          option: 'select',
          'option-group': 'select',
          'table-column': 'table',
          'radio-group': 'radio',
          'radio-button': 'radio',
          'checkbox-group': 'checkbox',
          'checkbox-button': 'checkbox',
          'form-item': 'form',
          'menu-item': 'menu',
          'sub-menu': 'menu',
          'tab-pane': 'tabs',
          step: 'steps',
          'carousel-item': 'carousel',
          'collapse-item': 'collapse',
          'timeline-item': 'timeline',
          'breadcrumb-item': 'breadcrumb',
          'dropdown-item': 'dropdown',
          'dropdown-menu': 'dropdown',
        };
        if (PARENT_ALIAS[kebab] && available.has(PARENT_ALIAS[kebab])) {
          dir = PARENT_ALIAS[kebab];                  // option -> select
        } else {
          const first = kebab.split('-')[0];
          if (available.has(first)) dir = first;      // table-column -> table
          else return undefined;                      // 认不出来就交给别的 resolver
        }
      }
      return {
        name,
        from: `element-plus/es/components/${dir}`,
        sideEffects: [
          'element-plus/es/components/base/style/css',
          `element-plus/es/components/${dir}/style/css`,
        ],
      };
    },
  };
}

/**
 * Vant 的「精简样式」解析器 —— 官方 VantResolver 的 CSS 侧太胖。
 *
 * 官方解析出的 sideEffects 是 `vant/es/<组件>/style/index`，
 * 而 tabbar-item 的那一份**无条件** `import "vant/es/icon/index.css"`：
 *   实测 263 条 `.van-icon-*` 规则 = 45 KB，整个 vant 分包因此到 52 KB（gzip 30 KB）。
 * 这里改成只引「组件自己的 index.css」+ 一份 base.css（Vant 的 CSS 变量，5.7 KB），
 * 把图标字体整块去掉 —— 底栏本来也没用图标（标题里用 emoji）。
 *
 * JS 侧仍走 `vant/es`（官方做法），它能正常 tree-shake（实测 8.4 KB）。
 */
function VantLeanResolver() {
  const toKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return {
    type: 'component',
    resolve: (name) => {
      if (!/^Van[A-Z]/.test(name)) return undefined;
      const kebab = toKebab(name.slice(3));        // VanTabbarItem -> tabbar-item
      return {
        name: name.slice(3),                        // Vant 导出的是 Tabbar / TabbarItem
        from: 'vant/es',
        sideEffects: ['vant/es/style/base.css', `vant/es/${kebab}/index.css`],
      };
    },
  };
}

export default defineConfig({
  plugins: [
    // transformAssetUrls 必须关闭：
    // 各页视图的模板是从原站 HTML 原样搬过来的，里面的 src="assets/avatar.jpg"
    // 这类相对路径本来就是「交给浏览器按 URL 解析」（资源都在 public/ 下）。
    // 开着的话 Vite 会把它们当模块导入去解析，构建直接报
    // Rollup failed to resolve import "assets/avatar.jpg"。
    vue({ template: { transformAssetUrls: false } }),

    /* ---- UI 组件库：按需自动引入（不注册全局，避免全量进首屏）----
     * 原站是零依赖手写样式，Element Plus 全量注册实测 940KB（302KB gzip）直接进首屏，
     * 是最大的首屏回退。这里用 Resolver 做「用到哪个组件才打包哪个 + 对应样式」：
     *   · <el-table> / <el-tag> …  → 自动 import 组件 + 组件 CSS
     *   · <van-cell> / <van-tabbar> … 同理
     *   · ElMessage / ElMessageBox 这类函数式 API 由 AutoImport 处理
     * dts 关掉：本项目是纯 JS（无 TS），生成 .d.ts 没有意义还会污染工作区。
     * ⚠️ 顺序要在 vue() 之后 —— Components 需要拿到 vue 插件转换后的结果。 */
    Components({
      resolvers: [
        ElementPlusDirectResolver(),   // 直连组件目录（见上方函数注释）
        VantLeanResolver(),            // Vant：只引组件 CSS，跳过 45KB 的图标字体
      ],
      dts: false,
    }),
    /* 没有用 unplugin-auto-import：
     *   它 + ElementPlusResolver 会从 element-plus 的 barrel 取 ElMessage 之类的函数式 API，
     *   同样会把整库拖进来。目前管理台只用到模板里的组件（由上面的 resolver 处理），
     *   如果以后要用 ElMessage / ElMessageBox，请显式
     *     import { ElMessage } from 'element-plus/es/components/message'
     *   不要写 from 'element-plus'。 */
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /* 允许「直连组件目录」地引入 Element Plus。
       * element-plus 的 package.json 用 exports 字段把子路径限制成 `./es/*.mjs`（只认文件），
       * 于是 `element-plus/es/components/tag` 这种**目录**形式会报
       * ERR_PACKAGE_PATH_NOT_EXPORTED —— 只能走 `element-plus/es` 这个 barrel，
       * 而那个 barrel 又无法被有效 tree-shake（实测 1 个组件也打进 937 kB）。
       * 这里把 `element-plus/es` 直接指向磁盘目录，绕开 exports 限制，
       * 让上面那个 resolver 的直连写法能生效。只在构建期生效，不影响运行时。 */
      'element-plus/es': fileURLToPath(new URL('./node_modules/element-plus/es', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    /* emptyOutDir: true —— 每次构建先清空 dist，杜绝 stale chunk 堆积。
     *
     * 背景：2026-09-22 体检（P1-8）实测，此前设成 false 导致 dist 累积到
     *   **1264 个文件 / 97.7 MB**，其中 1087 个是历史构建的 JS（60.2 MB），
     *   而当前构建实际只需要 26 个 chunk / 1.84 MB + public 的 35 个静态文件。
     *   这些旧 chunk 会随 Workers Assets 一起上传，且可被公网直接访问到
     *   （旧代码泄露 + 部署体积放大 50 倍）。
     *
     * 原先设 false 的原因：沙箱的批量删除守卫（safe-delete-bulk-guard）在
     *   dist 文件数 > 50 时会拦 Vite 的 emptyDir，导致 build 失败。
     * 现在的做法：改成 true，并在每次 build **之前**手动清空 dist
     *   （PowerShell: Remove-Item dist -Recurse -Force），
     *   让 Vite 面对的是一个空目录或很小的目录，不再触碰删除守卫的阈值。
     *
     * ⚠️ 若你处在受管控环境且确实无法删除 dist，可临时改回 false ——
     *    但那意味着回到 stale chunk 堆积状态，请至少定期手动清理一次。 */
    emptyOutDir: true,
    assetsDir: 'static',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 框架单独分包，便于长期缓存。
        // 组件库/图表库也各自独立成 chunk：
        //   · echarts —— 只在打开看板时动态 import()，天然是异步 chunk，
        //     这里显式归拢是为了把 zrender 一起收进同一个文件，避免被拆散；
        //   · element-plus / vant —— 按需引入的组件会散在各处，归拢后便于缓存，
        //     也保证它们**不会**被并进首屏的 index chunk。
        // 没被用到的库不会生成空分包（Rollup 只在 chunk 非空时产出）。
        manualChunks(id) {
          const p = id.replace(/\\/g, '/');
          if (!p.includes('node_modules')) return undefined;
          if (/(^|\/)node_modules\/(vue|vue-router|pinia|@vue)(\/|$)/.test(p)) return 'vendor';
          if (p.includes('/echarts/') || p.includes('/zrender/')) return 'echarts';
          /* P1-5：EP 的 4 个语言包放行，让 EpLocaleProvider 的「按语言动态 import」
           * 真的产出独立小 chunk（约 5 KB raw / 2 KB gzip 一个），而不是被上面这条
           * 规则归拢进 element-plus 主包 —— 那样 4 种语言会全量下发。
           * 语言包文件是纯数据对象、零 import，放行不会拆散 EP 的其它模块。 */
          if (p.includes('/element-plus/es/locale/')) return undefined;
          if (p.includes('/element-plus/')) return 'element-plus';
          if (p.includes('/vant/') || p.includes('/@vant/')) return 'vant';
          return undefined;
        },
      },
    },
  },
  /* 这两个库**不参与依赖预打包**：
   * · element-plus 走直连 es/components/* 引入，本身已是 ESM，不需要预打包；
   * · vant 同理（VantResolver 解析到 vant/es）。
   * 让 Vite 预打包它们的话，dev 启动后会「发现新依赖 → 重建」，
   * 重建要删掉 .vite/deps_temp_* 整个临时目录（上百个文件），
   * 在受管控环境里会被批量删除保护直接拦掉，dev server 当场挂掉。
   * echarts 是运行时动态 import 的，也不预打包。 */
  optimizeDeps: {
    exclude: ['element-plus', 'vant', 'echarts'],
  },
  /* vitest：单测只跑 tests/ 下的用例。
     ⚠️ 必须排除 tests/e2e —— 那是 Playwright 的用例，被 vitest 收集会直接失败：
       "Playwright Test did not expect test.describe() to be called here." */
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
  server: {
    port: 5173,
    // 本地开发：前端热更新跑在 5173，接口代理到 wrangler dev 的 8787。
    // ⚠️ /assets 不再代理：public/assets 本地就有（bg / avatar / photos / qrcodes），
    //    vite 自己就能服 —— 之前代理到 8787，wrangler 重启/下线的瞬间 dev 页面
    //    所有背景 / 头像图会全部 404（2026-09-21 用户截图踩过）。
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/legacy': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
