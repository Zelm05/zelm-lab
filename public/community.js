/* ===================================================================
 * community.js — 留言板 + 反馈建议（主站 section 渲染）
 * 权限：
 *   留言：所有人可见且可直接输入；游客点「发表」时弹登录框；登录可发表/点赞；仅管理员可删除
 *   反馈/建议：所有访问者可直接输入；游客点「提交」时弹登录框；仅普通用户可成功提交；
 *             本人可看自己的记录（含管理员回复）；管理员查看全部并回复、删除
 * 依赖：window.__zelmUser（index.html 登录态脚本）、window.AuthPanel
 * i18n：文案随 zelm_settings.lang 切换（script.js applyLang 末尾调用 __communityRefresh）
 * =================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function getUser() { return window.__zelmUser || null; }

  /* ---------------- i18n ---------------- */
  var LOC = {
    zh: {
      msgPlaceholder: '写下你的留言…（500 字以内）',
      post: '发表',
      like: '👍 点赞',
      liked: '👍 已赞',
      del: '删除',
      delMsg: '确定删除这条留言吗？',
      emptyMsg: '还没有留言，来做第一个留言的人吧',
      loadFailMsg: '留言加载失败，请稍后重试',
      fbTextarea: '写下你的反馈或建议…（1000 字以内）',
      submitFeedback: '提交反馈',
      submitSuggestion: '提交建议',
      mySubmits: '我的提交',
      noFb: '你还没有提交过反馈或建议',
      waitReply: '⏳ 等待管理员回复…',
      adminReply: '管理员回复：',
      replied: '已回复：',
      replyPh: '输入回复…',
      replyBtn: '回复',
      updateReply: '更新回复',
      all: '全部',
      feedback: '反馈',
      suggestion: '建议',
      stats: '共 {total} 条 · 待回复 {pending} 条',
      noRecords: '暂无记录',
      loadFail: '加载失败，请稍后重试',
      delFb: '确定删除这条记录吗？',
      emptyReply: '回复内容不能为空',
      emptyContent: '内容不能为空',
      reply: '回复',
      replySend: '发送',
      replyPh: '写下你的回复…（500 字以内）',
      replyTo: '回复 @{name}',
      delReply: '删除回复',
      delReplyConfirm: '确定删除这条回复吗？'
    },
    en: {
      msgPlaceholder: 'Write a message... (max 500)',
      post: 'Post',
      like: '👍 Like',
      liked: '👍 Liked',
      del: 'Delete',
      delMsg: 'Delete this message?',
      emptyMsg: 'No messages yet. Be the first!',
      loadFailMsg: 'Failed to load messages. Please retry.',
      fbTextarea: 'Share your feedback or idea... (max 1000)',
      submitFeedback: 'Submit Feedback',
      submitSuggestion: 'Submit Idea',
      mySubmits: 'My Submissions',
      noFb: 'You have not submitted anything yet.',
      waitReply: '⏳ Waiting for admin reply...',
      adminReply: 'Admin reply: ',
      replied: 'Replied: ',
      replyPh: 'Type reply...',
      replyBtn: 'Reply',
      updateReply: 'Update',
      all: 'All',
      feedback: 'Feedback',
      suggestion: 'Ideas',
      stats: '{total} total · {pending} pending',
      noRecords: 'No records',
      loadFail: 'Failed to load. Please retry.',
      delFb: 'Delete this record?',
      emptyReply: 'Reply cannot be empty',
      emptyContent: 'Content cannot be empty',
      reply: 'Reply',
      replySend: 'Send',
      replyPh: 'Write a reply... (max 500)',
      replyTo: 'Reply to @{name}',
      delReply: 'Delete reply',
      delReplyConfirm: 'Delete this reply?'
    }
  };

  function lang() {
    try {
      var s = JSON.parse(localStorage.getItem('zelm_settings') || '{}');
      return s.lang === 'en' ? 'en' : 'zh';
    } catch (e) { return 'zh'; }
  }
  function t(k) {
    var L = lang() === 'en' ? LOC.en : LOC.zh;
    return L[k] != null ? L[k] : k;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function requireLogin() {
    if (!getUser()) {
      if (window.AuthPanel) AuthPanel.open('login');
      return false;
    }
    return true;
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
  }

  /* ================= 留言板 ================= */

  // 留言输入框：与列表加载解耦，游客/登录均直接可输入（游客点发表时弹登录框）
  function renderMsgPostBox() {
    var postBox = $('msgPostBox');
    if (!postBox) return;
    postBox.innerHTML =
      '<div class="msg-post">' +
        '<input class="msg-input" id="msgInput" maxlength="500" placeholder="' + esc(t('msgPlaceholder')) + '">' +
        '<button class="msg-btn" id="msgSend" type="button">' + esc(t('post')) + '</button>' +
      '</div>';
    var send = $('msgSend');
    var input = $('msgInput');
    function doSend() {
      var content = input.value.trim();
      if (!content) return;
      if (!requireLogin()) return;   // 游客：弹登录框
      send.disabled = true;
      postJSON('/api/messages', { content: content }).then(function (res) {
        if (res.ok) { input.value = ''; loadMessages(); }
        else { alert(res.data.error || t('loadFail')); send.disabled = false; }
      }).catch(function () { alert(t('loadFail')); send.disabled = false; });
    }
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
  }

  function loadMessages() {
    fetch('/api/messages', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(renderMessages)
      .catch(function () {
        var list = $('msgList');
        if (list) list.innerHTML = '<p class="fb-empty">' + t('loadFailMsg') + '</p>';
      });
  }

  function renderMessages(data) {
    var list = $('msgList');
    if (!list) return;
    if (!data.messages || !data.messages.length) {
      list.innerHTML = '<p class="fb-empty">' + t('emptyMsg') + '</p>';
      return;
    }
    list.innerHTML = data.messages.map(function (m) {
      var actions =
        '<button class="like-btn' + (m.liked ? ' liked' : '') + '" data-like="' + m.id + '" type="button">' +
          (m.liked ? t('liked') : t('like')) + ' ' + m.likes +
        '</button>' +
        '<button class="reply-btn" data-reply-toggle="' + m.id + '" type="button">💬 ' + (m.reply_count || 0) + '</button>';
      if (data.can_delete) {
        actions += '<button class="del-btn" data-delmsg="' + m.id + '" type="button">' + t('del') + '</button>';
      }
      return (
        '<div class="msg-item">' +
          '<div class="msg-meta">' +
            '<span class="msg-author">' + esc(m.nickname || m.username) + '</span>' +
            '<span class="msg-time">' + fmtTime(m.created_at) + '</span>' +
          '</div>' +
          '<p class="msg-content">' + esc(m.content) + '</p>' +
          '<div class="msg-actions">' + actions + '</div>' +
          '<div class="msg-replies" id="msgReplies' + m.id + '" hidden>' +
            renderRepliesArea(m, data) +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  // 渲染回复区：顶部回复输入框 + 回复列表（子回复缩进）
  function renderRepliesArea(m, data) {
    var replies = (m.replies || []).map(function (r) {
      var actions =
        '<button class="reply-link" data-reply-target="' + r.id + '" data-reply-msg="' + m.id +
          '" data-reply-name="' + esc(r.username) + '" type="button">' + t('reply') + '</button>';
      if (r.is_mine || data.can_delete) {
        actions += '<button class="reply-link danger" data-reply-del="' + r.id + '" data-reply-msg="' + m.id + '" type="button">' + t('delReply') + '</button>';
      }
      return (
        '<div class="reply-item' + (r.parent_reply_id ? ' reply-sub' : '') + '">' +
          '<div class="reply-meta">' +
            '<span class="reply-author">' + esc(r.nickname || r.username) + '</span>' +
            '<span class="reply-time">' + fmtTime(r.created_at) + '</span>' +
          '</div>' +
          '<p class="reply-content">' + esc(r.content) + '</p>' +
          '<div class="reply-actions">' + actions + '</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="reply-form">' +
        '<input id="msgReplyInput' + m.id + '" maxlength="500" placeholder="' + esc(t('replyPh')) + '">' +
        '<button class="msg-btn reply-send" data-reply-send="' + m.id + '" type="button">' + esc(t('replySend')) + '</button>' +
      '</div>' +
      (replies ? '<div class="reply-list">' + replies + '</div>' : '')
    );
  }

  function toggleReplies(id) {
    var box = $('msgReplies' + id);
    if (box) box.hidden = !box.hidden;
  }

  // 发送回复（parentReplyId 为空则回复留言本身）
  function doPostReply(id) {
    if (!requireLogin()) return;
    var input = $('msgReplyInput' + id);
    if (!input) return;
    var content = input.value.trim();
    if (!content) { alert(t('emptyContent')); return; }
    var btn = document.querySelector('[data-reply-send="' + id + '"]');
    if (btn) btn.disabled = true;
    postJSON('/api/messages/' + id + '/replies', {
      content: content,
      parent_reply_id: input.dataset.parentReply ? Number(input.dataset.parentReply) : null
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.ok) loadMessages();
      else alert(res.data.error || t('loadFail'));
    }).catch(function () { if (btn) btn.disabled = false; alert(t('loadFail')); });
  }

  // 点击「回复 @xxx」：把留言的输入框切换为回复指定楼层
  function setReplyTarget(btn) {
    var msgId = btn.dataset.replyMsg;
    var input = $('msgReplyInput' + msgId);
    if (!input) return;
    input.dataset.parentReply = btn.dataset.replyTarget;
    input.placeholder = t('replyTo').replace('{name}', btn.dataset.replyName || '');
    input.focus();
  }

  function doDeleteReply(replyId, msgId) {
    if (!confirm(t('delReplyConfirm'))) return;
    fetch('/api/messages/' + msgId + '/replies/' + replyId, { method: 'DELETE', credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) loadMessages();
        else alert(res.data.error || t('loadFail'));
      })
      .catch(function () { alert(t('loadFail')); });
  }

  function toggleLike(id, btn) {
    if (!requireLogin()) return;
    btn.disabled = true;
    postJSON('/api/messages/' + id + '/like', {}).then(function (res) {
      btn.disabled = false;
      if (!res.ok) { alert(res.data.error || t('loadFail')); return; }
      btn.classList.toggle('liked', res.data.liked);
      btn.innerHTML = (res.data.liked ? t('liked') : t('like')) + ' ' + res.data.likes;
    }).catch(function () { btn.disabled = false; alert(t('loadFail')); });
  }

  function deleteMsg(id) {
    if (!confirm(t('delMsg'))) return;
    fetch('/api/messages/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) loadMessages();
        else alert(res.data.error || t('loadFail'));
      })
      .catch(function () { alert(t('loadFail')); });
  }

  /* ================= 反馈 / 建议 ================= */

  function renderFeedbackBox() {
    var box = $('fbBox');
    if (!box) return;
    var u = getUser();
    if (u && (u.role === 'admin' || u.role === 'owner')) {
      box.innerHTML =
        '<div class="fb-stats" id="fbStats"></div>' +
        '<div class="fb-tabs">' +
          '<button class="fb-tab active" data-fbkind="all" type="button">' + t('all') + '</button>' +
          '<button class="fb-tab" data-fbkind="feedback" type="button">' + t('feedback') + '</button>' +
          '<button class="fb-tab" data-fbkind="suggestion" type="button">' + t('suggestion') + '</button>' +
        '</div>' +
        '<div id="fbAdminList"></div>';
      bindFbTabs();
      loadAdminFeedbacks('all');
      return;
    }

    // 普通用户 / 游客：均可直接输入，游客点「提交」时弹登录框
    var submitBtnLabel = u && u.role === 'user' ? t('submitFeedback') : t('submitFeedback');
    box.innerHTML =
      '<form class="fb-form" id="fbForm">' +
        '<textarea class="fb-textarea" id="fbContent" maxlength="1000" placeholder="' + esc(t('fbTextarea')) + '"></textarea>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="msg-btn" type="submit" data-kind="feedback">' + esc(submitBtnLabel) + '</button>' +
          '<button class="msg-btn" type="submit" data-kind="suggestion">' + esc(t('submitSuggestion')) + '</button>' +
        '</div>' +
      '</form>' +
      (u ? '<div id="fbMyList"></div>' : '');
    bindFbForm();
    if (u) loadMyFeedbacks();
  }

  function bindFbForm() {
    var form = $('fbForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter;
      if (!btn || !btn.dataset.kind) return;
      if (!requireLogin()) return;   // 游客：弹登录框
      var kind = btn.dataset.kind;
      var content = $('fbContent').value.trim();
      if (!content) { alert(t('emptyContent')); return; }
      btn.disabled = true;
      postJSON('/api/feedbacks', { kind: kind, content: content }).then(function (res) {
        if (res.ok) {
          $('fbContent').value = '';
          loadMyFeedbacks();
        } else {
          alert(res.data.error || t('loadFail'));
          btn.disabled = false;
        }
      }).catch(function () { alert(t('loadFail')); btn.disabled = false; });
    });
  }

  function bindFbTabs() {
    document.querySelectorAll('.fb-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.fb-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        loadAdminFeedbacks(tab.dataset.fbkind);
      });
    });
  }

  function loadMyFeedbacks() {
    fetch('/api/feedbacks/my', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el = $('fbMyList');
        if (!el) return;
        if (!data.items || !data.items.length) {
          el.innerHTML = '<p class="fb-empty">' + t('noFb') + '</p>';
          return;
        }
        el.innerHTML = data.items.map(function (f) {
          var badge = f.kind === 'feedback'
            ? '<span class="fb-badge feedback">' + t('feedback') + '</span>'
            : '<span class="fb-badge suggestion">' + t('suggestion') + '</span>';
          var replyHtml = f.reply
            ? '<div class="fb-reply"><b>' + t('adminReply') + '</b>' + esc(f.reply) + '<div style="opacity:.55;margin-top:4px;font-size:.75rem">' + fmtTime(f.replied_at) + '</div></div>'
            : '<p class="fb-reply-empty">' + t('waitReply') + '</p>';
          return (
            '<div class="fb-item">' +
              '<div class="fb-meta">' + badge + '<span class="msg-time">' + fmtTime(f.created_at) + '</span></div>' +
              '<p class="fb-content">' + esc(f.content) + '</p>' + replyHtml +
            '</div>'
          );
        }).join('');
      })
      .catch(function () {
        var el = $('fbMyList');
        if (el) el.innerHTML = '<p class="fb-empty">' + t('loadFail') + '</p>';
      });
  }

  function loadAdminFeedbacks(kind) {
    var url = '/api/admin/feedbacks' + (kind && kind !== 'all' ? '?kind=' + kind : '');
    fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el = $('fbAdminList');
        var stats = $('fbStats');
        if (stats && data.stats) {
          stats.innerHTML = t('stats')
            .replace('{total}', data.stats.total || 0)
            .replace('{pending}', data.stats.pending || 0);
        }
        if (!el) return;
        if (!data.items || !data.items.length) {
          el.innerHTML = '<p class="fb-empty">' + t('noRecords') + '</p>';
          return;
        }
        el.innerHTML = data.items.map(function (f) {
          var badge = f.kind === 'feedback'
            ? '<span class="fb-badge feedback">' + t('feedback') + '</span>'
            : '<span class="fb-badge suggestion">' + t('suggestion') + '</span>';
          var replyHtml = f.reply
            ? '<div class="fb-reply"><b>' + t('replied') + '</b>' + esc(f.reply) + '<div style="opacity:.55;margin-top:4px;font-size:.75rem">' + fmtTime(f.replied_at) + '</div></div>' +
              '<div class="fb-reply-form"><input id="fbReply' + f.id + '" placeholder="' + esc(t('replyPh')) + '"><button class="like-btn" data-reply="' + f.id + '" type="button">' + t('updateReply') + '</button></div>'
            : '<div class="fb-reply-form"><input id="fbReply' + f.id + '" placeholder="' + esc(t('replyPh')) + '"><button class="like-btn" data-reply="' + f.id + '" type="button">' + t('replyBtn') + '</button></div>';
          return (
            '<div class="fb-item">' +
              '<div class="fb-meta">' + badge +
                '<span class="msg-author">' + esc(f.nickname || f.username) + '</span>' +
                '<span class="msg-time">' + fmtTime(f.created_at) + '</span>' +
              '</div>' +
              '<p class="fb-content">' + esc(f.content) + '</p>' + replyHtml +
              '<div class="msg-actions" style="margin-top:8px">' +
                '<button class="del-btn" data-fbdel="' + f.id + '" type="button">' + t('del') + '</button>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      })
      .catch(function () {
        var el = $('fbAdminList');
        if (el) el.innerHTML = '<p class="fb-empty">' + t('loadFail') + '</p>';
      });
  }

  function replyFeedback(id) {
    var input = $('fbReply' + id);
    if (!input) return;
    var reply = input.value.trim();
    if (!reply) { alert(t('emptyReply')); return; }
    postJSON('/api/admin/feedbacks/' + id + '/reply', { reply: reply }).then(function (res) {
      if (res.ok) {
        var active = document.querySelector('.fb-tab.active');
        loadAdminFeedbacks(active ? active.dataset.fbkind : 'all');
      } else alert(res.data.error || t('loadFail'));
    }).catch(function () { alert(t('loadFail')); });
  }

  function deleteFeedback(id) {
    if (!confirm(t('delFb'))) return;
    fetch('/api/admin/feedbacks/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          var active = document.querySelector('.fb-tab.active');
          loadAdminFeedbacks(active ? active.dataset.fbkind : 'all');
        } else alert(res.data.error || t('loadFail'));
      })
      .catch(function () { alert(t('loadFail')); });
  }

  /* ================= 事件委托 + 初始化 ================= */

  document.addEventListener('click', function (e) {
    var likeBtn = e.target.closest && e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(likeBtn.dataset.like, likeBtn); return; }
    var delMsgBtn = e.target.closest && e.target.closest('[data-delmsg]');
    if (delMsgBtn) { deleteMsg(delMsgBtn.dataset.delmsg); return; }
    var replyToggle = e.target.closest && e.target.closest('[data-reply-toggle]');
    if (replyToggle) { toggleReplies(replyToggle.dataset.replyToggle); return; }
    var replySend = e.target.closest && e.target.closest('[data-reply-send]');
    if (replySend) { doPostReply(replySend.dataset.replySend); return; }
    var replyTarget = e.target.closest && e.target.closest('[data-reply-target]');
    if (replyTarget) { setReplyTarget(replyTarget); return; }
    var replyDel = e.target.closest && e.target.closest('[data-reply-del]');
    if (replyDel) { doDeleteReply(replyDel.dataset.replyDel, replyDel.dataset.replyMsg); return; }
    var replyBtn = e.target.closest && e.target.closest('[data-reply]');
    if (replyBtn) { replyFeedback(replyBtn.dataset.reply); return; }
    var delFbBtn = e.target.closest && e.target.closest('[data-fbdel]');
    if (delFbBtn) { deleteFeedback(delFbBtn.dataset.fbdel); return; }
  });

  function start() {
    renderMsgPostBox();
    loadMessages();
    renderFeedbackBox();
  }

  function init() {
    if (!$('messages')) return; // 非主站页面不初始化
    if (window.__zelmUser === undefined) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (window.__zelmUser !== undefined || tries > 30) {
          clearInterval(timer);
          start();
        }
      }, 100);
    } else {
      start();
    }
  }

  // 语言切换时由 script.js applyLang 调用；跨标签页由 storage 事件触发
  window.__communityRefresh = start;
  window.addEventListener('storage', function (e) {
    if (e.key === 'zelm_settings') start();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
