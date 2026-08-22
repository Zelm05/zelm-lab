/* ===================================================================
 * community.js — 留言板 + 反馈建议（主站 section 渲染）
 * 权限：
 *   留言：所有人可见；登录可发表/点赞；仅管理员可删除
 *   反馈/建议：仅普通用户可提交；本人可看自己的记录（含管理员回复）
 *   管理员：查看全部反馈/建议并回复、删除
 * 依赖：window.__zelmUser（index.html 登录态脚本）、window.AuthPanel
 * =================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function getUser() { return window.__zelmUser || null; }

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

  function loadMessages() {
    fetch('/api/messages', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(renderMessages)
      .catch(function () {
        var list = $('msgList');
        if (list) list.innerHTML = '<p class="fb-empty">留言加载失败，请稍后重试</p>';
      });
  }

  function renderMessages(data) {
    var u = getUser();
    var postBox = $('msgPostBox');
    if (postBox) {
      if (u) {
        postBox.innerHTML =
          '<div class="msg-post">' +
            '<input class="msg-input" id="msgInput" maxlength="500" placeholder="写下你的留言…（500 字以内）">' +
            '<button class="msg-btn" id="msgSend" type="button">发表</button>' +
          '</div>';
        var send = $('msgSend');
        var input = $('msgInput');
        function doSend() {
          var content = input.value.trim();
          if (!content) return;
          send.disabled = true;
          postJSON('/api/messages', { content: content }).then(function (res) {
            if (res.ok) { input.value = ''; loadMessages(); }
            else { alert(res.data.error || '发表失败'); send.disabled = false; }
          }).catch(function () { alert('网络错误，请重试'); send.disabled = false; });
        }
        send.addEventListener('click', doSend);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        });
      } else {
        postBox.innerHTML = '<p class="msg-tip">🔒 登录后可发表留言、点赞</p>';
      }
    }

    var list = $('msgList');
    if (!list) return;
    if (!data.messages || !data.messages.length) {
      list.innerHTML = '<p class="fb-empty">还没有留言，来做第一个留言的人吧</p>';
      return;
    }
    list.innerHTML = data.messages.map(function (m) {
      var actions =
        '<button class="like-btn' + (m.liked ? ' liked' : '') + '" data-like="' + m.id + '" type="button">' +
          (m.liked ? '👍 已赞 ' : '👍 点赞 ') + m.likes +
        '</button>';
      if (data.can_delete) {
        actions += '<button class="del-btn" data-delmsg="' + m.id + '" type="button">删除</button>';
      }
      return (
        '<div class="msg-item">' +
          '<div class="msg-meta">' +
            '<span class="msg-author">' + esc(m.username) + '</span>' +
            '<span class="msg-time">' + fmtTime(m.created_at) + '</span>' +
          '</div>' +
          '<p class="msg-content">' + esc(m.content) + '</p>' +
          '<div class="msg-actions">' + actions + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function toggleLike(id, btn) {
    if (!requireLogin()) return;
    btn.disabled = true;
    postJSON('/api/messages/' + id + '/like', {}).then(function (res) {
      btn.disabled = false;
      if (!res.ok) { alert(res.data.error || '操作失败'); return; }
      btn.classList.toggle('liked', res.data.liked);
      btn.innerHTML = (res.data.liked ? '👍 已赞 ' : '👍 点赞 ') + res.data.likes;
    }).catch(function () { btn.disabled = false; alert('网络错误，请重试'); });
  }

  function deleteMsg(id) {
    if (!confirm('确定删除这条留言吗？')) return;
    fetch('/api/messages/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) loadMessages();
        else alert(res.data.error || '删除失败');
      })
      .catch(function () { alert('网络错误，请重试'); });
  }

  /* ================= 反馈 / 建议 ================= */

  function renderFeedbackBox() {
    var box = $('fbBox');
    if (!box) return;
    var u = getUser();
    if (!u) {
      box.innerHTML = '<p class="msg-tip">🔒 登录后（普通用户）可提交反馈与建议，管理员会在这里回复</p>';
      return;
    }
    if (u.role === 'admin') {
      box.innerHTML =
        '<div class="fb-stats" id="fbStats"></div>' +
        '<div class="fb-tabs">' +
          '<button class="fb-tab active" data-fbkind="all" type="button">全部</button>' +
          '<button class="fb-tab" data-fbkind="feedback" type="button">反馈</button>' +
          '<button class="fb-tab" data-fbkind="suggestion" type="button">建议</button>' +
        '</div>' +
        '<div id="fbAdminList"></div>';
      bindFbTabs();
      loadAdminFeedbacks('all');
    } else {
      box.innerHTML =
        '<form class="fb-form" id="fbForm">' +
          '<textarea class="fb-textarea" id="fbContent" maxlength="1000" placeholder="写下你的反馈或建议…（1000 字以内）"></textarea>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="msg-btn" type="submit" data-kind="feedback">提交反馈</button>' +
            '<button class="msg-btn" type="submit" data-kind="suggestion">提交建议</button>' +
          '</div>' +
        '</form>' +
        '<div id="fbMyList"></div>';
      bindFbForm();
      loadMyFeedbacks();
    }
  }

  function bindFbForm() {
    var form = $('fbForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter;
      if (!btn || !btn.dataset.kind) return;
      var kind = btn.dataset.kind;
      var content = $('fbContent').value.trim();
      if (!content) { alert('内容不能为空'); return; }
      btn.disabled = true;
      postJSON('/api/feedbacks', { kind: kind, content: content }).then(function (res) {
        if (res.ok) {
          $('fbContent').value = '';
          loadMyFeedbacks();
        } else {
          alert(res.data.error || '提交失败');
          btn.disabled = false;
        }
      }).catch(function () { alert('网络错误，请重试'); btn.disabled = false; });
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
          el.innerHTML = '<p class="fb-empty">你还没有提交过反馈或建议</p>';
          return;
        }
        el.innerHTML = data.items.map(function (f) {
          var badge = f.kind === 'feedback'
            ? '<span class="fb-badge feedback">反馈</span>'
            : '<span class="fb-badge suggestion">建议</span>';
          var replyHtml = f.reply
            ? '<div class="fb-reply"><b>管理员回复：</b>' + esc(f.reply) + '<div style="opacity:.55;margin-top:4px;font-size:.75rem">' + fmtTime(f.replied_at) + '</div></div>'
            : '<p class="fb-reply-empty">⏳ 等待管理员回复…</p>';
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
        if (el) el.innerHTML = '<p class="fb-empty">加载失败，请稍后重试</p>';
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
          stats.innerHTML = '共 <b>' + data.stats.total + '</b> 条 · 待回复 <b>' + data.stats.pending + '</b> 条';
        }
        if (!el) return;
        if (!data.items || !data.items.length) {
          el.innerHTML = '<p class="fb-empty">暂无记录</p>';
          return;
        }
        el.innerHTML = data.items.map(function (f) {
          var badge = f.kind === 'feedback'
            ? '<span class="fb-badge feedback">反馈</span>'
            : '<span class="fb-badge suggestion">建议</span>';
          var replyHtml = f.reply
            ? '<div class="fb-reply"><b>已回复：</b>' + esc(f.reply) + '<div style="opacity:.55;margin-top:4px;font-size:.75rem">' + fmtTime(f.replied_at) + '</div></div>' +
              '<div class="fb-reply-form"><input id="fbReply' + f.id + '" placeholder="修改回复…"><button class="like-btn" data-reply="' + f.id + '" type="button">更新回复</button></div>'
            : '<div class="fb-reply-form"><input id="fbReply' + f.id + '" placeholder="输入回复…"><button class="like-btn" data-reply="' + f.id + '" type="button">回复</button></div>';
          return (
            '<div class="fb-item">' +
              '<div class="fb-meta">' + badge +
                '<span class="msg-author">' + esc(f.username) + '</span>' +
                '<span class="msg-time">' + fmtTime(f.created_at) + '</span>' +
              '</div>' +
              '<p class="fb-content">' + esc(f.content) + '</p>' + replyHtml +
              '<div class="msg-actions" style="margin-top:8px">' +
                '<button class="del-btn" data-fbdel="' + f.id + '" type="button">删除</button>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      })
      .catch(function () {
        var el = $('fbAdminList');
        if (el) el.innerHTML = '<p class="fb-empty">加载失败，请稍后重试</p>';
      });
  }

  function replyFeedback(id) {
    var input = $('fbReply' + id);
    if (!input) return;
    var reply = input.value.trim();
    if (!reply) { alert('回复内容不能为空'); return; }
    postJSON('/api/admin/feedbacks/' + id + '/reply', { reply: reply }).then(function (res) {
      if (res.ok) {
        var active = document.querySelector('.fb-tab.active');
        loadAdminFeedbacks(active ? active.dataset.fbkind : 'all');
      } else alert(res.data.error || '回复失败');
    }).catch(function () { alert('网络错误，请重试'); });
  }

  function deleteFeedback(id) {
    if (!confirm('确定删除这条记录吗？')) return;
    fetch('/api/admin/feedbacks/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok) {
          var active = document.querySelector('.fb-tab.active');
          loadAdminFeedbacks(active ? active.dataset.fbkind : 'all');
        } else alert(res.data.error || '删除失败');
      })
      .catch(function () { alert('网络错误，请重试'); });
  }

  /* ================= 事件委托 + 初始化 ================= */

  document.addEventListener('click', function (e) {
    var likeBtn = e.target.closest && e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(likeBtn.dataset.like, likeBtn); return; }
    var delMsgBtn = e.target.closest && e.target.closest('[data-delmsg]');
    if (delMsgBtn) { deleteMsg(delMsgBtn.dataset.delmsg); return; }
    var replyBtn = e.target.closest && e.target.closest('[data-reply]');
    if (replyBtn) { replyFeedback(replyBtn.dataset.reply); return; }
    var delFbBtn = e.target.closest && e.target.closest('[data-fbdel]');
    if (delFbBtn) { deleteFeedback(delFbBtn.dataset.fbdel); return; }
  });

  // 等待主站登录态（window.__zelmUser）就绪后初始化
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

  function start() {
    loadMessages();
    renderFeedbackBox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
