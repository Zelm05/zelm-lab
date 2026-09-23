<script setup>
/* ==========================================================================
 * SiteSettingsPanel.vue —— 站点设置（站长可改，管理员只读）
 *
 * 原实现：8 个开关各自 addEventListener('change')，改完再调 renderCfg()
 * 反过来把整面板 DOM 刷一遍（值 + 状态文案 + 分段高亮 + 只读禁用全挤在一个函数里），
 * 只读态靠遍历 `panel.querySelectorAll('input, button')` 逐个 disabled。
 * 现在：开关直接反映 siteCfg 状态，状态文案是计算属性，只读态用 :disabled 派生，
 * 不存在"改完再回头刷界面"这一步。
 * ========================================================================== */
import { useAdminStore } from '@/stores/admin';
import { useI18n } from '@/core/i18n';

const a = useAdminStore();
const { t } = useI18n('admin');
</script>

<template>
  <div id="apwPanel" class="panel" :class="{ 'cfg-readonly': a.cfgReadOnly }">
    <div class="panel-head">
      <span class="panel-title">{{ t('panelApw') }}</span>
      <span id="apwNote" class="panel-title-note">{{ a.cfgReadOnly ? t('apwNoteReadonly') : t('apwNote') }}</span>
    </div>
    <div style="padding:16px 20px">
      <!-- 管理员只读提示（站长本人不显示） -->
      <div id="cfgReadonlyNote" class="cfg-readonly-note" :hidden="!a.cfgReadOnly">{{ t('apwReadonlyTip') }}</div>

      <!-- ① 关于页访问密码 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgPwTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgPwDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="apwState" :type="a.siteCfg.about_password_enabled ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.about_password_enabled, 'pw') }}</el-tag>
          <el-button id="apwChangeBtn" size="small" :disabled="a.cfgReadOnly" @click="a.openApwModal()">{{ t('apwChange') }}</el-button>
          <el-button id="apwResetBtn" size="small" type="warning" :disabled="a.cfgReadOnly" @click="a.apwReset()">{{ t('apwResetBtn') }}</el-button>
          <el-button id="apwClearBtn" size="small" type="danger" :disabled="a.cfgReadOnly" @click="a.apwClear()">{{ t('apwClearBtn') }}</el-button>
        </div>
      </div>

      <!-- ② 欢迎页进入后的落地页 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgEntryTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgEntryDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <!-- 改用原生 button 分段控件（el-radio-button 的原生圆点+文字挤在一起，样式差） -->
          <div id="entrySeg" class="seg-group" role="radiogroup" :aria-disabled="a.cfgReadOnly">
            <button
              type="button"
              class="seg-btn"
              role="radio"
              :aria-checked="a.siteCfg.entry_page !== 'about'"
              :class="{ active: a.siteCfg.entry_page !== 'about' }"
              :disabled="a.cfgReadOnly"
              @click="a.setEntry('index')"
            >{{ t('cfgEntryIndex') }}</button>
            <button
              type="button"
              class="seg-btn"
              role="radio"
              :aria-checked="a.siteCfg.entry_page === 'about'"
              :class="{ active: a.siteCfg.entry_page === 'about' }"
              :disabled="a.cfgReadOnly"
              @click="a.setEntry('about')"
            >{{ t('cfgEntryAbout') }}</button>
          </div>
        </div>
      </div>

      <!-- ③ 留言需要登录 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgMsgTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgMsgDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="msgLoginState" :type="a.siteCfg.message_login_required ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.message_login_required, 'login') }}</el-tag>
          <el-switch
            id="msgLoginSwitch"
            :aria-label="t('cfgMsgTitle')"
            :model-value="a.siteCfg.message_login_required"
            :disabled="a.cfgReadOnly"
            @change="a.toggleCfg('message_login_required', $event)"
          />
        </div>
      </div>

      <!-- ③b 点赞需要登录 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgLikeTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgLikeDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="likeLoginState" :type="a.siteCfg.like_login_required ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.like_login_required, 'login') }}</el-tag>
          <el-switch
            id="likeLoginSwitch"
            :aria-label="t('cfgLikeTitle')"
            :model-value="a.siteCfg.like_login_required"
            :disabled="a.cfgReadOnly"
            @change="a.toggleCfg('like_login_required', $event)"
          />
        </div>
      </div>

      <!-- ④ 关于页是否需要登录 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgAboutTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgAboutDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="aboutLoginState" :type="a.siteCfg.about_login_required ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.about_login_required, 'login') }}</el-tag>
          <el-switch
            id="aboutLoginSwitch"
            :aria-label="t('cfgAboutTitle')"
            :model-value="a.siteCfg.about_login_required"
            :disabled="a.cfgReadOnly"
            @change="a.toggleCfg('about_login_required', $event)"
          />
        </div>
      </div>

      <!-- ⑤ 关于页照片墙 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgPhotoTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgPhotoDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="photoWallState" :type="a.siteCfg.photo_wall_enabled ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.photo_wall_enabled, 'show') }}</el-tag>
          <el-switch
            id="photoWallSwitch"
            :aria-label="t('cfgPhotoTitle')"
            :model-value="a.siteCfg.photo_wall_enabled"
            :disabled="a.cfgReadOnly"
            @change="a.toggleCfg('photo_wall_enabled', $event)"
          />
        </div>
      </div>

      <!-- ⑥ 主站「关于我」板块 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgHomeAboutTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgHomeAboutDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-tag id="homeAboutState" :type="a.siteCfg.home_about_enabled ? 'success' : 'info'" size="small" effect="plain">{{ a.statusText(a.siteCfg.home_about_enabled, 'show') }}</el-tag>
          <el-switch
            id="homeAboutSwitch"
            :aria-label="t('cfgHomeAboutTitle')"
            :model-value="a.siteCfg.home_about_enabled"
            :disabled="a.cfgReadOnly"
            @change="a.toggleCfg('home_about_enabled', $event)"
          />
        </div>
      </div>

      <!-- ⑧ 清除本地缓存 -->
      <div class="cfg-row">
        <div>
          <div class="cfg-label">{{ t('cfgClearCacheTitle') }}</div>
          <div class="cfg-desc">{{ t('cfgClearCacheDesc') }}</div>
        </div>
        <div class="cfg-actions">
          <el-button id="clearCacheBtn" size="small" type="warning" :disabled="a.cfgReadOnly" @click="a.clearCache()">{{ t('cfgClearCacheBtn') }}</el-button>
        </div>
      </div>

      <div id="apwMsg" style="margin-top:10px;font-size:.8rem;opacity:.8">{{ a.apwMsg }}</div>
    </div>
  </div>
</template>
