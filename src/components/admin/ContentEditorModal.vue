<script setup>
/* ==========================================================================
 * ContentEditorModal.vue —— 后台内容面板的**编辑器模态**（从 ContentPanel 拆出）
 *
 * 拆出来的原因：ContentPanel 原来一个文件里同时装着「模块 tab + 列表 + 存储文件浏览 +
 * 编辑器模态」，模态本身占掉了整个模板的一半。这里只负责**渲染与交互**，
 * 所有状态与 IO（adminSave / 上传 / 机翻 / 清理孤儿文件）都留在父组件的
 * useContentEditor —— 本组件是「纯受控」的：props 进来，事件出去。
 *
 * ⚠️ 模板是从父组件**逐字节搬运**过来的，连变量名都没改（props / 方法名与原来的
 *    局部变量同名）。这么做的目的是让「拆组件」这件事本身**不产生任何行为差异**，
 *    而不是为了少改几个字。改动它之前请先想清楚这一点。
 *
 * ⚠️ 模板里那条 v-if="editor" 的注释是**血的教训**，不要删：
 *    外层只有 :hidden（CSS 隐藏，子表达式照样求值），少了 v-if 就会在 editor 为 null
 *    时渲染 null.main → 抛 TypeError → 整块渲染成空注释节点（弹层和 /admin 全白）。
 * ========================================================================== */
import { ref } from 'vue';
import { LANGS, useI18n } from '@/i18n';
import { useDialog } from '@/composables/useDialog';
import { parseFilesList, imageUrlOf, langFilledIn } from './content-panel-logic';
import SocialLinksEditor from './SocialLinksEditor.vue';
import ProjectImagesEditor from './ProjectImagesEditor.vue';

const props = defineProps({
  currentModule: { type: Object, default: null },
  currentFields: { type: Object, default: () => ({ main: [], tr: [] }) },
  activeMod: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  msg: { type: String, default: '' },
  translating: { type: Boolean, default: false },
  /** 哪个语言的当前内容是机翻草稿（仅用于提示） */
  draftLang: { type: String, default: '' },
});

/* 编辑草稿：null = 关闭；{ id, main:{}, tr:{ lang: {field:value} }, orig }
 *
 * ⚠️ 这里刻意用 defineModel 而不是普通 prop：表单控件要**直接写进草稿的字段**
 *    （v-model="editor.main[f.key]"），也就是子组件确实会改这份数据。
 *    用普通 prop 会命中 vue/no-mutating-props —— 那条规则防的是「子组件偷改父状态」，
 *    而这里是父子刻意共享的一份草稿（拆组件之前它就在父组件里被同样地改），
 *    所以用 defineModel 把它**显式声明成双向绑定**，而不是靠关规则来绕过。
 *    父组件保存时读的就是这一份，不需要子组件再回传整个对象。 */
const editor = defineModel('editor', { type: Object, default: null });

/* 语言切换是父子的共享状态：父组件要用它挑列表标题，这里要用它切表单字段 */
const editLang = defineModel('editLang', { type: String, default: 'zh-CN' });

const emit = defineEmits(['close', 'save', 'translate', 'pick-file', 'remove-file']);

const { t } = useI18n('admin');
const { t: tc } = useI18n('common');

const panelEl = ref(null);
useDialog(() => !!editor.value, { onClose: () => closeEditor(), panelRef: panelEl });

/* 与父组件同名的薄包装：只为让模板能整段搬运（见文件头说明）。
   真正改状态/发请求的动作一律 emit 回父组件。 */
function closeEditor() { emit('close'); }
function save() { emit('save'); }
function machineTranslate() { emit('translate'); }
function pickFile(field) { emit('pick-file', field); }
function removeFileAt(field, idx) { emit('remove-file', field, idx); }
function filesList(field) { return parseFilesList(editor.value && editor.value.main[field.key]); }
function imgPreview(field) { return imageUrlOf(editor.value, field); }
function langFilled(code) { return langFilledIn(props.currentFields.tr, editor.value && editor.value.tr, code); }
</script>

<template>
    <Teleport to="#overlayRoot">
      <div class="cf-overlay" :hidden="!editor" @click.self="closeEditor()">
        <!-- ⚠️ 必须 v-if="editor"：模态内容里有 v-model="editor.main[..]" / editor.tr[..]，
             而外层只有 :hidden（:hidden 只是 CSS 隐藏，子表达式仍会被求值）。
             若不加 v-if，editor 初始为 null 时 editor.main 即 null.main → 渲染抛 TypeError，
             整块 ContentPanel 直接渲染成空注释节点（弹层与 /admin 都变成空白）。 -->
        <div v-if="editor" ref="panelEl" class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cfModalTitle">
          <el-button class="cf-close" size="small" circle :aria-label="tc('cClose')" @click="closeEditor()">✕</el-button>
          <h3 id="cfModalTitle" class="cf-modal-title">
            {{ currentModule ? t(currentModule.labelKey) : '' }} · {{ editor && editor.id ? t('cfEdit') : t('cfNew') }}
          </h3>

          <!-- 与语言无关的字段：只填一次 -->
          <div v-if="currentFields.main.length" class="cf-block">
            <div v-for="f in currentFields.main" :key="f.key" class="cf-field">
              <label class="cf-label">{{ t(f.labelKey) }}</label>
              <select v-if="f.type === 'select'" v-model="editor.main[f.key]" class="cf-input">
                <!-- 选项可指定命名空间（第三元素）；不指定就按 admin 取 -->
                <option v-for="o in f.options" :key="o[0]" :value="o[0]">{{ o[2] === 'common' ? tc(o[1]) : t(o[1]) }}</option>
              </select>
              <input v-else-if="f.type === 'date'" v-model="editor.main[f.key]" type="date" class="cf-input" />
              <template v-else-if="f.type === 'image' || f.type === 'images' || f.type === 'file' || f.type === 'files'">
                <div class="cf-upload-row">
                  <el-button size="small" :disabled="busy" @click="pickFile(f)">{{ tc('cUpload') }}</el-button>
                  <span class="cf-hint cf-ellipsis">{{ f.type === 'files'
                    ? (filesList(f).length ? tc('cFilesCount').replace('{n}', filesList(f).length) : tc('cEmpty'))
                    : (editor.main[f.key] || tc('cEmpty')) }}</span>
                </div>
                <template v-if="f.type === 'files'">
                  <div v-for="(it, i) in filesList(f)" :key="it.ref" class="cf-file-row">
                    <span class="cf-hint cf-ellipsis">📄 {{ it.name }}</span>
                    <el-button size="small" text :disabled="busy" @click="removeFileAt(f, i)">✕</el-button>
                  </div>
                </template>
                <img v-if="imgPreview(f)" class="cf-thumb" :src="imgPreview(f)" alt="" loading="lazy" width="72" height="72" />
              </template>
              <input
                v-else-if="f.type === 'switch'"
                v-model="editor.main[f.key]"
                type="checkbox" class="cf-check"
              />
              <input
                v-else-if="f.type === 'number'"
                v-model.number="editor.main[f.key]"
                type="number" class="cf-input cf-input--num"
              />
              <input v-else v-model="editor.main[f.key]" class="cf-input" />
            </div>
          </div>

          <!-- 子集合：社交链接挂在「关于我」下，图集挂在「项目作品」下 -->
          <SocialLinksEditor v-if="activeMod === 'about'" :lang="editLang" />
          <ProjectImagesEditor v-if="activeMod === 'projects'" :project-id="editor.id" />

          <!-- 语言切换器（仅后台编辑用，不影响前台语言）。
               tr 为空的模块（简历）没有翻译概念，整块隐藏。 -->
          <div v-if="currentFields.tr.length" class="cf-langs">
            <button
              v-for="l in LANGS" :key="l.code" type="button"
              class="cf-lang" :class="{ on: editLang === l.code }"
              @click="editLang = l.code"
            >
              <span class="cf-lang-name">{{ l.name }}</span>
              <em class="cf-lang-state" :class="{ filled: langFilled(l.code) }">
                {{ langFilled(l.code) ? t('cfTranslated') : t('cfUntranslated') }}
              </em>
            </button>
          </div>

          <!-- 机器翻译：以默认语言为源，翻到当前编辑语言；结果只填表单、不落库 -->
          <div v-if="currentFields.tr.length" class="cf-translate-row">
            <el-button
              size="small" :loading="translating"
              :disabled="editLang === LANGS[0].code"
              @click="machineTranslate()"
            >{{ t('cfTranslate') }}</el-button>
            <span v-if="draftLang === editLang" class="cf-draft">{{ t('cfTranslateDraft') }}</span>
          </div>

          <div v-if="currentFields.tr.length" class="cf-block">
            <div v-for="f in currentFields.tr" :key="f.key" class="cf-field">
              <label class="cf-label">{{ t(f.labelKey) }}</label>
              <textarea
                v-if="f.type === 'textarea' || f.type === 'csv' || f.type === 'exp'"
                v-model="editor.tr[editLang][f.key]"
                class="cf-input cf-textarea" :rows="f.rows || 3"
              ></textarea>
              <input v-else v-model="editor.tr[editLang][f.key]" class="cf-input" />
            </div>
          </div>

          <p v-if="msg" class="cf-msg">{{ msg }}</p>
          <div class="cf-modal-actions">
            <el-button size="small" @click="closeEditor()">{{ tc('cCancel') }}</el-button>
            <el-button size="small" type="primary" :loading="busy" @click="save()">{{ tc('cSave') }}</el-button>
          </div>
        </div>
      </div>
    </Teleport>
</template>

<style scoped>
.cf-hint { font-size: 0.75rem; opacity: 0.55; }
.cf-msg { margin: 0; font-size: 0.8125rem; opacity: 0.8; }
/* 开关（可见 / 置顶）：库里存 0/1，表单里是布尔 */
.cf-check { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
.cf-input--num { max-width: 120px; }
.cf-overlay {
  position: fixed; inset: 0; z-index: 1000; padding: 20px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(2, 8, 6, 0.55); backdrop-filter: blur(8px);
}
.cf-overlay[hidden] { display: none; }
.cf-modal {
  position: relative; width: min(620px, 94vw); max-height: 88%; overflow: auto;
  padding: 18px; border-radius: 18px;
  background: var(--surface, #0a1c1a); border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.cf-close { position: absolute; top: 10px; right: 10px; }
.cf-modal-title { margin: 0 0 12px; padding-right: 32px; font-size: 1.05rem; }
/* 字段块：缩短上下间距（避免「日志」编辑时一大片空白）。
   main 块（开关/日期/下拉）和 tr 块（标题/正文）都用同一套样式。 */
.cf-block { display: grid; gap: 8px; margin-bottom: 10px; }
.cf-field { display: grid; gap: 3px; }
/* 「可见 / 置顶」之类的开关字段：把 checkbox 与 label 放到同一行，节省纵向空间。
   用 > 直接子选择器，不影响其它 .cf-field。 */
.cf-field:has(> .cf-check) { display: flex; align-items: center; gap: 8px; }
.cf-field:has(> .cf-check) > .cf-label { margin: 0; }
.cf-label { font-size: 0.75rem; opacity: 0.7; }
.cf-input {
  width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 9px; font-size: 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: inherit; font-family: inherit;
}
/* 原生 <select> 展开后 option 用浏览器默认色 —— 深色主题下选中项文字几乎看不见，
   显式给浅底深字，保证两个选项都清晰（2026-09-26 截图反馈）。 */
.cf-input option { color: #1c1c1c; background: #f5f5f5; }
.cf-textarea { resize: vertical; line-height: 1.6; min-height: 80px; }
.cf-upload-row { display: flex; align-items: center; gap: 8px; }
.cf-file-row { display: flex; align-items: center; gap: 4px; margin: 2px 0 0 2px; }
.cf-ellipsis { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; }
.cf-langs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.cf-translate-row { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; }
.cf-draft { font-size: 0.6875rem; color: #ffb236; }
.cf-lang {
  display: grid; gap: 1px; padding: 4px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14); background: none; color: inherit; font-family: inherit;
}
.cf-lang.on { border-color: var(--accent); color: var(--accent); }
.cf-lang-name { font-size: 0.8125rem; }
.cf-lang-state { font-size: 0.625rem; font-style: normal; opacity: 0.45; }
.cf-lang-state.filled { opacity: 0.8; }
.cf-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
