// ===================================================================
// moderation.js — 审核日志记录（P2-22）
// 极薄的写入封装：所有管理动作（删留言 / 删反馈 / 删回复 / 回复反馈 /
// 踢下线 / 冻结 / 重置密码）调用本函数落一条审计记录。
//
// 设计要点：
//   · 写入失败**绝不**抛错到调用方——删除 / 回复等主流程不能被审计日志拖垮；
//     失败时仅 console.error 一行。
//   · 因此即使 moderation_log 表尚未创建（迁移未执行），调用方业务也照常工作。
// ===================================================================

/**
 * 记一条审核日志。
 * @param {{ DB: any }} env   Workers 环境（含 env.DB 绑定）
 * @param {number} actorId    操作者用户 id
 * @param {string} actorName  操作者用户名
 * @param {string} action     动作类型（见 migration 注释中的取值）
 * @param {string} targetType 对象类型：message / feedback / reply / user
 * @param {number|null} targetId 对象 id；用户类动作传被操作者 id
 * @param {string} [note]     可选备注
 */
export async function logModeration(env, actorId, actorName, action, targetType, targetId, note) {
  try {
    await env.DB
      .prepare(
        'INSERT INTO moderation_log (actor_id, actor_username, action, target_type, target_id, note, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        Number(actorId),
        String(actorName || ''),
        String(action),
        String(targetType),
        targetId == null ? null : Number(targetId),
        note ? String(note) : null,
        Date.now()
      )
      .run();
  } catch (e) {
    // 审计日志写入失败不能影响主流程；也兼容 moderation_log 表尚未创建的过渡期。
    console.error('[moderation] log failed:', e && (e.message || e));
  }
}
