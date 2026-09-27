/* migration-025 —— 项目作品新增「下载文件」字段（存 project-assets 桶）
 *
 * 背景：项目作品（校园网自动登录的 APK/EXE、小米手环表盘 bin 等）原本把下载文件
 *       当作本地静态资源（assets/downloads/*.apk）随 Worker Assets 发布，
 *       无法在后台管理、也无法按语言/版本更新。
 *       现在改为像博客附件 / 证书 PDF 一样，把下载文件上传到专用桶 project-assets，
 *       库里只存「桶前缀引用」（project-assets/proj/<id>/<name>），渲染时走 resolveAssetUrl。
 *
 * 列与语言无关 → 加在主表 projects（不是 project_translations）。
 * 可空：历史/现有项目没上传下载文件时不影响读取与展示。
 */
ALTER TABLE projects ADD COLUMN download_path TEXT;
