-- ==========================================================================
-- migration-029-ai-usage.sql — AI 对话 Neuron 用量表（2026-09-28）
--
-- 背景：Cloudflare 没有提供「Workers AI 剩余额度」API，免费档按天计
--   （约 10,000 Neurons / 天，00:00 UTC 重置）。本站通过估算/读取
--   Workers AI 返回的 token usage 换算成 Neuron 并逐日累计，
--   前端在 AI 聊天窗展示「今日剩余额度」。
--
-- 定价（@cf/meta/llama-3.3-70b-instruct-fp8-fast，Neurons / M tokens）：
--   输入 26,668 · 输出 204,805（换算逻辑在 worker/ai-chat.js neuronsFor）。
--
-- 设计：
--   · 一天一行（day = UTC 日期 'YYYY-MM-DD'），主键去重；
--   · 累计写入走 UPSERT（ON CONFLICT DO UPDATE），并发安全；
--   · 不记用户维度 —— 额度是站点级的（站长视角），与限流表（按用户）互补。
-- ==========================================================================

CREATE TABLE IF NOT EXISTS ai_usage (
  day        TEXT PRIMARY KEY,           -- UTC 日期 'YYYY-MM-DD'（00:00 UTC 重置）
  neurons    INTEGER NOT NULL DEFAULT 0, -- 当天累计消耗（Workers AI Neurons）
  updated_at INTEGER NOT NULL DEFAULT 0  -- 最近一次累计的时间戳（ms）
);
