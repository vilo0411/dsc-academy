/* DSC Academy — client behaviour (demo: auth + progress are simulated in localStorage) */
(function () {
  'use strict';

  var BASE = document.body.getAttribute('data-base') || '';
  var KEY = 'dsc-academy-v1';
  var RANK = { guest: 0, free: 0, acct: 1, ekyc: 2 };
  var TIER_NAME = { guest: 'Khách', acct: 'Đã mở TK', ekyc: 'Đã eKYC' };

  // ---------- storage ----------
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    s = s || {};
    s.tier = s.tier || 'guest';
    s.done = s.done || {};
    s.quiz = s.quiz || {};
    s.certs = s.certs || {};
    s.days = s.days || [];          // ngày có học (YYYY-MM-DD)
    s.terms = s.terms || {};        // thuật ngữ đã tra
    s.explore = s.explore || {};    // {articleSlug: {chain, sim, sort}}
    s.quizFirst = s.quizFirst || {};// {articleSlug: true} đúng hết ngay lần đầu
    s.flags = s.flags || {};
    s.examPerfect = s.examPerfect || {};
    s.badges = s.badges || {};      // huy hiệu đã nhận (thành viên)
    s.pending = s.pending || {};    // huy hiệu tạm của khách
    s.guestDone = s.guestDone || {};// {module: {slug: true}} bài khách đã làm đúng quiz
    return s;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  function isMember() { return S.tier !== 'guest'; }
  function rank() { return RANK[S.tier] || 0; }
  function doneMap(mod) { S.done[mod] = S.done[mod] || {}; return S.done[mod]; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function json(id) { var el = document.getElementById(id); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { return null; } }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $('[data-toast]'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }
  try {
    var pending = sessionStorage.getItem(KEY + '-toast');
    if (pending) { sessionStorage.removeItem(KEY + '-toast'); setTimeout(function () { toast(pending); }, 200); }
  } catch (e) { /* ignore */ }
  function toastNext(msg) { try { sessionStorage.setItem(KEY + '-toast', msg); } catch (e) { /* ignore */ } }

  // ---------- auth / tier UI ----------
  function applyAuth() {
    $$('[data-show]').forEach(function (el) {
      var v = el.getAttribute('data-show'), show;
      if (v === 'guest') show = !isMember();
      else if (v === 'member') show = isMember();
      else if (v === 'acct') show = S.tier === 'acct';
      else if (v === 'ekyc') show = S.tier === 'ekyc';
      else if (v === 'not-ekyc') show = S.tier !== 'ekyc';
      el.hidden = !show;
    });
    var name = S.name || 'Nguyễn Văn A';
    $$('[data-user-name]').forEach(function (el) { el.textContent = name; });
    $$('[data-user-initial]').forEach(function (el) { el.textContent = name.trim().split(/\s+/).pop().charAt(0).toUpperCase(); });
    $$('[data-tier-badge]').forEach(function (el) {
      el.textContent = S.tier === 'ekyc' ? 'Đã eKYC' : 'Chưa eKYC';
      el.classList.toggle('is-ekyc', S.tier === 'ekyc');
    });
    var label = $('[data-demo-label]'); if (label) label.textContent = TIER_NAME[S.tier];
    $$('[data-set-tier]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-set-tier') === S.tier ? 'true' : 'false'); });
    var here = location.pathname + location.hash;
    if (!/\/dang-nhap\/?$/.test(location.pathname)) {
      $$('[data-login-link]').forEach(function (a) { a.href = BASE + '/dang-nhap/?next=' + encodeURIComponent(here); });
    }
  }

  function claimPending() {
    var n = 0;
    Object.keys(S.pending).forEach(function (id) { if (!S.badges[id]) { S.badges[id] = { date: S.pending[id] }; n++; } });
    S.pending = {};
    Object.keys(S.guestDone).forEach(function (m) { var dm = doneMap(m); Object.keys(S.guestDone[m]).forEach(function (s) { dm[s] = true; }); });
    S.guestDone = {};
    if (n) toastNext('Đã nhận ' + n + ' huy hiệu đang chờ. Tiến độ học đã được lưu.');
  }
  function setTier(t) {
    S.tier = t;
    if (t !== 'guest' && !S.name) { S.name = 'Nguyễn Văn A'; S.account = '085C123456'; }
    if (t !== 'guest') claimPending();
    save();
    location.reload();
  }

  // ---------- badges ----------
  var BADGES = json('badge-data') || [];
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function recordDay() { var t = today(); if (S.days.indexOf(t) < 0) { S.days.push(t); S.days.sort(); save(); } }
  function streaks() {
    var days = S.days.map(function (d) { return Date.parse(d + 'T00:00:00'); }), best = 0, run = 0, prev = null;
    days.forEach(function (t) { run = (prev !== null && t - prev === 864e5) ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    var cur = 0;
    if (days.length) {
      var last = days[days.length - 1], now = Date.parse(today() + 'T00:00:00');
      if (now - last <= 864e5) { cur = 1; for (var i = days.length - 1; i > 0 && days[i] - days[i - 1] === 864e5; i--) cur++; }
    }
    return { best: best, cur: cur };
  }
  function doneSource() { return isMember() ? S.done : S.guestDone; }
  function countDone(mod) {
    var src = doneSource(), n = 0;
    Object.keys(src).forEach(function (m) { if (!mod || m === mod) n += Object.keys(src[m]).length; });
    return n;
  }
  function progressOf(b) {
    var r = b.rule || {};
    if (r.articles) return [countDone(), r.articles];
    if (r.module) return [countDone(r.module), b.total || 1];
    if (r.quiz_first) return [Object.keys(S.quizFirst).length, r.quiz_first];
    if (r.exam_perfect) return [S.examPerfect[r.exam_perfect] ? 1 : 0, 1];
    if (r.streak) return [streaks().best, r.streak];
    if (r.terms) return [Object.keys(S.terms).length, r.terms];
    if (r.explore) {
      var mx = 0; Object.keys(S.explore).forEach(function (k) { mx = Math.max(mx, Object.keys(S.explore[k]).length); });
      return [mx, r.explore];
    }
    if (r.night_owl) return [S.flags.nightOwl ? 1 : 0, 1];
    return [0, 1];
  }
  function owned(id) { return S.badges[id] || null; }
  var queue = [];
  function award() {
    BADGES.forEach(function (b) {
      var p = progressOf(b);
      if (p[0] < p[1]) return;
      if (isMember()) { if (!S.badges[b.id]) { S.badges[b.id] = { date: today() }; queue.push(b); } }
      else if (!S.badges[b.id] && !S.pending[b.id]) { S.pending[b.id] = today(); queue.push(b); }
    });
    save();
    showNextBadge();
  }
  var bm = $('[data-badge-modal]');
  function showNextBadge() {
    if (!bm || !bm.hidden || !queue.length) return;
    var b = queue.shift();
    $('[data-bm-img]', bm).src = b.img; $('[data-bm-img]', bm).alt = 'Huy hiệu ' + b.name;
    $('[data-bm-name]', bm).textContent = b.name;
    $('[data-bm-desc]', bm).textContent = b.desc;
    $('[data-bm-points]', bm).textContent = '+' + b.points + ' điểm';
    $('[data-bm-kicker]', bm).textContent = isMember() ? 'Huy hiệu mới!' : 'Bạn vừa đạt huy hiệu';
    var sh = $('[data-bm-share]', bm); if (sh) sh.href = b.url;
    bm.hidden = false;
    $('[data-bm-close]', bm).focus();
  }
  if (bm) {
    $('[data-bm-close]', bm).addEventListener('click', function () { bm.hidden = true; showNextBadge(); });
    bm.addEventListener('click', function (e) { if (e.target === bm) { bm.hidden = true; showNextBadge(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bm.hidden) { bm.hidden = true; showNextBadge(); } });
  }
  function points() {
    var p = countDone() * 10 + Object.keys(S.quizFirst).length * 5;
    BADGES.forEach(function (b) { if (S.badges[b.id]) p += b.points; });
    return isMember() ? p : 0;
  }
  function renderShelf(root) {
    var groups = [];
    BADGES.forEach(function (b) { if (groups.indexOf(b.group) < 0) groups.push(b.group); });
    root.innerHTML = groups.map(function (g) {
      return '<section class="shelf-group"><h3 class="shelf-title">' + esc(g) + '</h3><ul class="shelf">' +
        BADGES.filter(function (b) { return b.group === g; }).map(function (b) {
          var own = owned(b.id), pend = !own && S.pending[b.id], p = progressOf(b), secret = b.hidden && !own && !pend;
          var pct = Math.min(100, Math.round(p[0] / p[1] * 100));
          var status = own ? 'Đã nhận ' + own.date.split('-').reverse().join('/') : pend ? 'Đang chờ nhận · đăng nhập để lưu' : secret ? 'Tiếp tục học để khám phá' : Math.min(p[0], p[1]) + '/' + p[1];
          var inner = '<img class="badge-art' + (own || pend ? '' : ' is-locked') + (secret ? ' is-secret' : '') + '" src="' + b.img + '" alt="" width="96" height="96">' +
            '<span class="shelf-name">' + (secret ? 'Huy hiệu bí mật' : esc(b.name)) + (b.tier ? ' <span class="tag tag-outline tag-sm">' + esc(b.tier) + '</span>' : '') + '</span>' +
            '<span class="shelf-desc">' + (secret ? '???' : esc(b.desc)) + '</span>' +
            (own || secret ? '' : '<span class="bar bar-thin" aria-hidden="true"><span style="width:' + pct + '%"></span></span>') +
            '<span class="xsmall ' + (own ? 'strong' : 'muted') + '">' + status + '</span>';
          return '<li class="shelf-item' + (own ? ' is-owned' : '') + '">' + (own ? '<a href="' + b.url + '">' + inner + '</a>' : '<div>' + inner + '</div>') + '</li>';
        }).join('') + '</ul></section>';
    }).join('');
  }

  // demo panel
  var dToggle = $('[data-demo-toggle]'), dBody = $('[data-demo-body]');
  if (dToggle) {
    dToggle.addEventListener('click', function () {
      var open = dBody.hidden;
      dBody.hidden = !open;
      dToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dBody.hidden) { dBody.hidden = true; dToggle.setAttribute('aria-expanded', 'false'); } });
  }
  $$('[data-set-tier]').forEach(function (b) { b.addEventListener('click', function () { setTier(b.getAttribute('data-set-tier')); }); });
  $$('[data-reset]').forEach(function (b) {
    b.addEventListener('click', function () { S.done = {}; S.quiz = {}; S.certs = {}; save(); toastNext('Đã xoá tiến độ học.'); location.reload(); });
  });
  $$('[data-logout]').forEach(function (b) { b.addEventListener('click', function () { S.tier = 'guest'; save(); location.href = BASE + '/'; }); });

  applyAuth();

  // ---------- home filters ----------
  var fGroup = $('[data-filter-group]');
  function applyFilter(level) {
    $$('[data-filter]', fGroup).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filter') === level ? 'true' : 'false'); });
    $$('.module-card').forEach(function (c) { c.classList.toggle('is-filtered', level !== 'all' && c.getAttribute('data-level') !== level); });
  }
  if (fGroup) {
    $$('[data-filter]', fGroup).forEach(function (b) { b.addEventListener('click', function () { applyFilter(b.getAttribute('data-filter')); }); });
    $$('[data-filter-link]').forEach(function (a) { a.addEventListener('click', function () { applyFilter(a.getAttribute('data-filter-link')); }); });
  }
  $$('[data-module-progress]').forEach(function (el) {
    var m = el.getAttribute('data-module-progress'), total = +el.getAttribute('data-total');
    if (!isMember()) { el.textContent = 'Miễn phí'; return; }
    var n = Object.keys(doneMap(m)).length;
    el.textContent = n ? (n + '/' + total + ' đã đọc') : 'Chưa bắt đầu';
  });

  // ---------- module + article: progress & locks ----------
  var MOD = json('module-data');
  function refreshProgress() {
    if (!MOD) return;
    var dm = doneMap(MOD.slug), total = MOD.articles.length;
    var n = MOD.articles.filter(function (a) { return dm[a.slug]; }).length;
    var pct = Math.round(n / total * 100);
    $$('[data-done-count]').forEach(function (el) { el.textContent = n; });
    $$('[data-done-pct]').forEach(function (el) { el.textContent = pct + '%'; });
    $$('[data-progress-fill]').forEach(function (el) { el.style.width = pct + '%'; });
    $$('[data-progressbar]').forEach(function (el) { el.setAttribute('aria-valuenow', n); });
    $$('[data-slug]').forEach(function (row) {
      var slug = row.getAttribute('data-slug'), tier = row.getAttribute('data-tier') || 'free';
      var locked = rank() < RANK[tier];
      var done = isMember() && !!dm[slug];
      row.classList.toggle('is-locked', locked);
      row.classList.toggle('is-done', done && !locked);
      var sr = $('[data-row-state]', row);
      if (sr) sr.textContent = locked ? ' (đã khoá)' : done ? ' (đã đọc)' : '';
    });
    var cont = $('[data-continue-link]');
    if (cont) {
      var next = null;
      for (var i = 0; i < MOD.articles.length; i++) {
        var a = MOD.articles[i];
        if (!dm[a.slug] && rank() >= RANK[a.tier]) { next = a; break; }
      }
      if (isMember() && n > 0 && next) { cont.href = next.url; cont.firstChild.textContent = 'Tiếp tục: Bài ' + next.num + ' '; }
      else if (isMember() && n === total) { cont.firstChild.textContent = 'Đã hoàn thành · Đọc lại '; }
    }
  }
  refreshProgress();

  $$('[data-pdf]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (rank() < RANK.acct) { location.href = BASE + '/quyen-loi/#mo-tai-khoan'; return; }
      toast('Bản demo: tải PDF sẽ có ở bản chính thức.');
    });
  });

  // ---------- article ----------
  var articleSlug = document.body.getAttribute('data-article');
  if (articleSlug && MOD) initArticle();

  function initArticle() {
    var required = document.body.getAttribute('data-tier-required') || 'free';
    var locked = rank() < RANK[required];
    var dm = doneMap(MOD.slug);

    // reading progress
    var fill = $('[data-reading-fill]'), art = $('.article');
    function onScroll() {
      if (!fill || !art) return;
      var r = art.getBoundingClientRect(), h = art.offsetHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, -r.top / h)) : 1;
      fill.style.width = (p * 100) + '%';
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // TOC highlight
    var links = $$('[data-toc-link]');
    if ('IntersectionObserver' in window && links.length) {
      var map = {};
      links.forEach(function (l) { map[l.getAttribute('href').slice(1)] = l; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            links.forEach(function (l) { l.classList.remove('is-active'); });
            var l = map[en.target.id]; if (l) l.classList.add('is-active');
          }
        });
      }, { rootMargin: '0px 0px -70% 0px' });
      Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
    }

    // paywall
    if (locked) {
      document.body.classList.add('is-locked-page');
      var pw = $('[data-paywall]'); pw.hidden = false;
      var needEkyc = required === 'ekyc';
      var steps = [];
      if (!isMember()) {
        steps.push(['now', '1', 'Mở tài khoản DSC · miễn phí']);
        if (needEkyc) steps.push(['todo', '2', 'Xác thực eKYC · khoảng 3 phút']);
        $('[data-pw-title]').textContent = needEkyc ? 'Mở tài khoản và xác thực eKYC để đọc tiếp' : 'Mở tài khoản DSC để đọc tiếp bài viết này';
        $('[data-pw-cta]').textContent = 'Mở tài khoản';
      } else {
        steps.push(['done', '✓', 'Mở tài khoản DSC']);
        steps.push(['now', '2', 'Xác thực eKYC · khoảng 3 phút']);
        $('[data-pw-title]').textContent = 'Còn một bước: xác thực eKYC để mở khoá';
        $('[data-pw-cta]').textContent = 'Xác thực eKYC ngay';
      }
      $('[data-pw-steps]').innerHTML = steps.map(function (s) {
        return '<li class="is-' + s[0] + '"><span class="n" aria-hidden="true">' + s[1] + '</span><span>' + s[2] + '</span></li>';
      }).join('');
    }

    // quiz
    var Q = json('quiz-data');
    var quiz = $('[data-quiz]');
    var right = {};
    var total = Q ? Q.answers.length : 0;
    var nextLink = $('[data-next-link]');
    var nextKicker = $('[data-next-kicker]');
    var kickerOrig = nextKicker ? nextKicker.textContent : '';
    var already = isMember() && !!dm[articleSlug];

    var anyWrong = false;
    function allRight() { return total > 0 && Object.keys(right).length === total; }
    function noteCompletion() {
      if (!anyWrong) S.quizFirst[articleSlug] = true;
      var h = new Date().getHours(); if (h >= 23 || h < 4) S.flags.nightOwl = true;
      save();
    }
    recordDay();
    // badge hint for the module badge
    var mb = BADGES.filter(function (b) { return b.rule && b.rule.module === MOD.slug; })[0], hint = $('[data-badge-hint]');
    if (mb && hint && isMember() && !owned(mb.id)) {
      var left = MOD.articles.length - countDone(MOD.slug);
      if (left > 0) { hint.hidden = false; hint.textContent = 'Còn ' + left + ' bài viết nữa để nhận huy hiệu "' + mb.name + '".'; }
    }
    function refreshQuiz() {
      var n = Object.keys(right).length;
      var bar = $('[data-quiz-bar]');
      if (bar) {
        $('[data-quiz-score]').textContent = n + '/' + total + ' câu đúng';
        var msg = $('[data-quiz-msg]');
        if (already) { bar.classList.add('is-done'); msg.textContent = 'Bạn đã hoàn thành bài viết này.'; }
        else if (allRight()) { bar.classList.add('is-done'); msg.textContent = isMember() ? 'Tuyệt vời! Chuyển sang bài tiếp theo để hoàn thành bài này.' : 'Tuyệt vời! Đăng nhập để lưu hoàn thành bài viết.'; }
        else { bar.classList.remove('is-done'); msg.textContent = 'Trả lời đúng tất cả để hoàn thành bài viết.'; }
      }
      if (nextLink) {
        var complete = allRight() && !already;
        nextLink.classList.toggle('is-complete', complete);
        if (nextKicker) nextKicker.textContent = complete ? 'Hoàn thành & ' + kickerOrig.charAt(0).toLowerCase() + kickerOrig.slice(1) : kickerOrig;
      }
      var note = $('[data-next-note]');
      if (note) note.hidden = !(isMember() && !already && !allRight() && !locked && total > 0);
    }
    if (quiz && Q) {
      $$('.quiz-q', quiz).forEach(function (qel) {
        var qi = +qel.getAttribute('data-q');
        var fb = $('.quiz-fb', qel);
        $$('.quiz-opt', qel).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var oi = +btn.getAttribute('data-opt');
            $$('.quiz-opt', qel).forEach(function (b) { b.classList.remove('is-right', 'is-wrong'); b.setAttribute('aria-checked', 'false'); });
            btn.setAttribute('aria-checked', 'true');
            fb.hidden = false;
            if (oi === Q.answers[qi]) {
              btn.classList.add('is-right'); qel.classList.add('is-right'); right[qi] = true;
              fb.innerHTML = '<strong>Chính xác.</strong> ' + esc(Q.explains[qi] || '');
            } else {
              btn.classList.add('is-wrong'); qel.classList.remove('is-right'); delete right[qi];
              fb.innerHTML = '<strong>Chưa đúng, thử lại nhé.</strong>';
              anyWrong = true;
            }
            refreshQuiz();
            if (allRight() && !isMember() && !locked) {
              S.guestDone[MOD.slug] = S.guestDone[MOD.slug] || {};
              S.guestDone[MOD.slug][articleSlug] = true;
              noteCompletion();
              award();
            }
          });
        });
      });
    }
    refreshQuiz();

    if (nextLink) {
      nextLink.addEventListener('click', function (e) {
        if (!allRight() || already) return;
        if (!isMember()) { e.preventDefault(); $('[data-modal]').hidden = false; $('[data-modal] .btn').focus(); return; }
        dm[articleSlug] = true; S.quiz[MOD.slug + '/' + articleSlug] = true; noteCompletion();
        var idx = MOD.articles.map(function (a) { return a.slug; }).indexOf(articleSlug);
        toastNext('Đã hoàn thành bài ' + MOD.articles[idx].num + '. Tiến độ đã được cập nhật.');
      });
    }
    var modal = $('[data-modal]');
    if (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') modal.hidden = true; });
    }

    $$('[data-feedback]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-feedback]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        toast('Cảm ơn bạn đã góp ý!');
      });
    });

    initTerms();
    $$('[data-component]').forEach(mountComponent);
  }

  // ---------- glossary popovers ----------
  var GL = null, pop = null, popBtn = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } if (popBtn) { popBtn.setAttribute('aria-expanded', 'false'); popBtn = null; } }
  function initTerms() {
    var terms = $$('.term');
    if (!terms.length) return;
    function show(btn) {
      var key = btn.getAttribute('data-term'), g = GL && GL[key];
      closePop();
      if (!g) return;
      pop = document.createElement('div');
      pop.className = 'term-pop'; pop.setAttribute('role', 'note');
      pop.innerHTML = '<strong>' + esc(g.term) + '</strong>' + esc(g.def) + '<br><a href="' + BASE + '/thuat-ngu/#' + key + '">Xem trong Thuật ngữ</a>';
      document.body.appendChild(pop);
      var r = btn.getBoundingClientRect();
      var left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 16);
      pop.style.left = Math.max(16, left) + 'px';
      pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
      popBtn = btn; btn.setAttribute('aria-expanded', 'true');
      if (!S.terms[key]) { S.terms[key] = true; save(); award(); }
    }
    terms.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (popBtn === btn) { closePop(); return; }
        if (GL) { show(btn); return; }
        fetch(BASE + '/data/glossary.json').then(function (r) { return r.json(); }).then(function (d) { GL = d; show(btn); }).catch(function () { /* offline */ });
      });
    });
    document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target)) closePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
    window.addEventListener('resize', closePop);
  }

  // ---------- interactive components ----------
  function explored(kind) {
    var slug = document.body.getAttribute('data-article') || 'x';
    S.explore[slug] = S.explore[slug] || {};
    if (S.explore[slug][kind]) return;
    S.explore[slug][kind] = true; save(); award();
  }
  function mountComponent(el) {
    var type = el.getAttribute('data-component');
    if (type === 'chain') return chain(el);
    if (type === 'rate-sim') return rateSim(el);
    if (type === 'sector-sort') return sectorSort(el);
    if (type === 'live-rate') return liveRate(el);
  }

  function chain(el) {
    var D = {
      up: { labels: ['Lãi suất điều hành tăng', 'Lãi suất cho vay và huy động tăng', 'Chi phí vốn doanh nghiệp tăng', 'Định giá P/E chịu áp lực', 'Dòng tiền chuyển sang tiết kiệm'],
        ex: ['NHNN nâng lãi suất tái cấp vốn, tái chiết khấu hoặc hút tiền qua OMO để kiềm chế lạm phát hay giữ ổn định tỷ giá.',
          'Ngân hàng phải trả lãi cao hơn để huy động, nên cũng nâng lãi suất cho vay. Quá trình này thường có độ trễ vài tuần đến vài tháng.',
          'Doanh nghiệp vay nợ nhiều trả lãi cao hơn, lợi nhuận bị thu hẹp. Ngành dùng đòn bẩy cao như bất động sản chịu ảnh hưởng rõ nhất.',
          'Tỷ suất chiết khấu tăng làm giá trị hiện tại của dòng tiền tương lai giảm, nên mức P/E hợp lý đi xuống.',
          'Lãi tiết kiệm hấp dẫn hơn nên một phần dòng tiền rời chứng khoán, thanh khoản thị trường thường giảm.'] },
      down: { labels: ['Lãi suất điều hành giảm', 'Lãi suất cho vay và huy động giảm', 'Chi phí vốn doanh nghiệp giảm', 'Định giá P/E được hỗ trợ', 'Dòng tiền quay lại chứng khoán'],
        ex: ['NHNN hạ lãi suất điều hành hoặc bơm tiền qua OMO để hỗ trợ tăng trưởng khi lạm phát trong tầm kiểm soát.',
          'Mặt bằng lãi suất huy động và cho vay giảm dần theo, thường có độ trễ.',
          'Chi phí lãi vay giảm giúp cải thiện lợi nhuận, nhất là với doanh nghiệp nợ vay lớn.',
          'Tỷ suất chiết khấu giảm làm giá trị hiện tại của dòng tiền tương lai tăng, hỗ trợ mức P/E cao hơn.',
          'Kênh tiết kiệm kém hấp dẫn hơn nên dòng tiền có xu hướng tìm đến cổ phiếu, thanh khoản thường cải thiện.'] }
    };
    var dir = 'up', step = 0;
    el.className = 'cmp';
    el.setAttribute('aria-label', 'Sơ đồ truyền dẫn lãi suất');
    function render() {
      var d = D[dir];
      el.innerHTML =
        '<h3>Sơ đồ: lãi suất lan vào thị trường ra sao?</h3>' +
        '<p class="hint">Chọn chiều thay đổi, rồi bấm "Bước tiếp" để xem từng mắt xích.</p>' +
        '<div class="btn-row" style="margin-top:16px"><span class="strong small">NHNN</span>' +
        '<button type="button" class="chip" data-dir="up" aria-pressed="' + (dir === 'up') + '">Tăng lãi suất</button>' +
        '<button type="button" class="chip" data-dir="down" aria-pressed="' + (dir === 'down') + '">Giảm lãi suất</button></div>' +
        '<ol class="chain-nodes">' + d.labels.map(function (l, i) {
          return '<li class="' + (i <= step ? 'is-on ' : '') + (i === step ? 'is-cur' : '') + '"><span>BƯỚC ' + (i + 1) + '</span><span>' + l + '</span></li>';
        }).join('') + '</ol>' +
        '<p class="chain-explain" aria-live="polite">Bước ' + (step + 1) + ': ' + d.ex[step] + '</p>' +
        '<div class="btn-row" style="margin-top:16px"><button type="button" class="btn btn-dark btn-sm" data-step ' + (step >= 4 ? 'disabled' : '') + '>' + (step >= 4 ? 'Đã đi hết chuỗi tác động' : 'Bước tiếp') + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-reset-chain>Xem lại từ đầu</button></div>';
      $$('[data-dir]', el).forEach(function (b) { b.addEventListener('click', function () { dir = b.getAttribute('data-dir'); step = 0; render(); }); });
      $('[data-step]', el).addEventListener('click', function () { if (step < 4) { step++; render(); $('[data-step]', el).focus(); if (step === 4) explored('chain'); } });
      $('[data-reset-chain]', el).addEventListener('click', function () { step = 0; render(); });
    }
    render();
  }

  function rateSim(el) {
    var debt = +(el.getAttribute('data-debt') || 4000), base = +(el.getAttribute('data-rate') || 10), ebt0 = +(el.getAttribute('data-ebt') || 800);
    el.className = 'cmp cmp-dark';
    var fmt = function (v, d) { return v.toLocaleString('vi-VN', { maximumFractionDigits: d || 0 }); };
    el.innerHTML =
      '<h3>Thử nghiệm: kéo lãi suất, xem lợi nhuận thay đổi</h3>' +
      '<p class="hint mint">Doanh nghiệp bất động sản giả định · số liệu minh hoạ: dư nợ vay ' + fmt(debt) + ' tỷ, lãi suất vay ' + base + '%/năm, lợi nhuận trước thuế ' + fmt(ebt0) + ' tỷ</p>' +
      '<label class="sim-head" for="sim-rate"><span>Thay đổi lãi suất vay</span><span class="sim-val" data-v="dr">0</span></label>' +
      '<input id="sim-rate" type="range" min="-3" max="3" step="0.5" value="0">' +
      '<div class="sim-scale"><span>−3 điểm %</span><span>0</span><span>+3 điểm %</span></div>' +
      '<dl class="sim-stats">' +
      '<div><dt>Lãi suất vay mới</dt><dd data-v="rate"></dd></div>' +
      '<div><dt>Chi phí lãi / năm</dt><dd data-v="int"></dd></div>' +
      '<div><dt>Lợi nhuận trước thuế</dt><dd data-v="ebt"></dd></div>' +
      '<div><dt>So với hiện tại</dt><dd data-v="chg"></dd></div></dl>' +
      '<div class="sim-bars" aria-hidden="true"><div><span>Chi phí lãi</span><span class="track"><span class="fill" data-b="int" style="background:#8cffcc"></span></span></div>' +
      '<div><span>Lợi nhuận</span><span class="track"><span class="fill" data-b="ebt" style="background:#2ad03d"></span></span></div></div>';
    var input = $('input', el);
    function upd() {
      var dr = parseFloat(input.value), rate = base + dr, interest = debt * rate / 100, ebt = ebt0 - debt * dr / 100, chg = (ebt - ebt0) / ebt0 * 100;
      var sign = function (v) { return v > 0 ? '+' : v < 0 ? '−' : ''; };
      $('[data-v=dr]', el).textContent = sign(dr) + fmt(Math.abs(dr), 1) + ' điểm %';
      $('[data-v=rate]', el).textContent = fmt(rate, 1) + '%';
      $('[data-v=int]', el).textContent = fmt(interest) + ' tỷ';
      $('[data-v=ebt]', el).textContent = fmt(ebt) + ' tỷ';
      var c = $('[data-v=chg]', el); c.textContent = sign(chg) + fmt(Math.abs(chg), 1) + '%'; c.style.color = chg > 0 ? '#2ad03d' : '#ffffff';
      var max = Math.max(debt * (base + 3) / 100, ebt0 + debt * 3 / 100);
      $('[data-b=int]', el).style.width = (interest / max * 100) + '%';
      $('[data-b=ebt]', el).style.width = (Math.max(0, ebt) / max * 100) + '%';
      input.setAttribute('aria-valuetext', sign(dr) + Math.abs(dr) + ' điểm phần trăm');
    }
    input.addEventListener('input', upd); upd();
    input.addEventListener('change', function () { explored('sim'); });
  }

  function sectorSort(el) {
    var items = [
      ['Bất động sản', 'down', 'Chi phí vốn của chủ đầu tư tăng và người mua nhà khó vay hơn.'],
      ['Công ty chứng khoán', 'down', 'Thanh khoản thị trường thường giảm, chi phí vốn cho vay ký quỹ tăng.'],
      ['Bảo hiểm', 'up', 'Danh mục đầu tư chủ yếu là tiền gửi và trái phiếu, lợi suất cao hơn giúp tăng thu nhập đầu tư.'],
      ['Doanh nghiệp có nhiều tiền mặt ròng', 'up', 'Thu lãi tiền gửi nhiều hơn trong khi gần như không phải trả lãi vay.'],
      ['Điện, hạ tầng vay nợ lớn', 'down', 'Dư nợ dài hạn lớn khiến chi phí lãi vay tăng mạnh.']
    ];
    var ans = {}, checked = false;
    el.className = 'cmp';
    function render() {
      var right = 0;
      el.innerHTML = '<h3>Bài tập: khi lãi suất tăng, ngành nào hưởng lợi, ngành nào bất lợi?</h3><p class="hint">Chọn cho từng ngành, rồi bấm Kiểm tra.</p>' +
        '<ul class="sort-list">' + items.map(function (it, i) {
          var a = ans[i], ok = a === it[1]; if (ok) right++;
          return '<li><div class="sort-row"><span>' + it[0] + '</span><div class="chips" role="group" aria-label="' + it[0] + '">' +
            '<button type="button" class="chip" data-i="' + i + '" data-a="up" aria-pressed="' + (a === 'up') + '">Hưởng lợi</button>' +
            '<button type="button" class="chip" data-i="' + i + '" data-a="down" aria-pressed="' + (a === 'down') + '">Bất lợi</button></div></div>' +
            (checked && a ? '<p class="sort-fb"><strong>' + (ok ? 'Đúng.' : 'Chưa đúng.') + '</strong> ' + it[2] + '</p>' : '') + '</li>';
        }).join('') + '</ul>' +
        '<div class="sort-foot"><button type="button" class="btn btn-dark btn-sm" data-check>Kiểm tra</button><span class="strong" aria-live="polite">' +
        (checked ? ((Object.keys(ans).length < items.length ? 'Còn ' + (items.length - Object.keys(ans).length) + ' ngành chưa chọn. ' : '') + 'Đúng ' + right + '/' + items.length + '.') : '') + '</span></div>';
      $$('[data-i]', el).forEach(function (b) {
        b.addEventListener('click', function () { ans[+b.getAttribute('data-i')] = b.getAttribute('data-a'); checked = false; render(); el.querySelector('[data-i="' + b.getAttribute('data-i') + '"][data-a="' + b.getAttribute('data-a') + '"]').focus(); });
      });
      $('[data-check]', el).addEventListener('click', function () { checked = true; render(); $('[data-check]', el).focus(); if (Object.keys(ans).length === items.length) explored('sort'); });
    }
    render();
  }

  function liveRate(el) {
    var lockedHere = rank() < RANK.ekyc;
    el.className = 'cmp live-wrap' + (lockedHere ? ' is-blurred' : '');
    var pts = [150, 140, 150, 120, 95, 110, 70, 85, 60, 90, 105, 80, 88];
    var poly = pts.map(function (y, i) { return (i * 700 / (pts.length - 1)).toFixed(0) + ',' + y; }).join(' ');
    el.innerHTML = '<div class="live-inner"><div class="space-between" style="flex-wrap:wrap"><h3>Lãi suất liên ngân hàng qua đêm</h3><span class="xsmall muted">Cập nhật hằng ngày · nguồn dữ liệu DSC</span></div>' +
      '<svg viewBox="0 0 700 200" role="img" aria-label="Biểu đồ minh hoạ lãi suất liên ngân hàng" style="width:100%;height:auto;margin-top:16px">' +
      '<line x1="0" y1="190" x2="700" y2="190" stroke="#272d2b"/><line x1="0" y1="120" x2="700" y2="120" stroke="#8cffcc"/><line x1="0" y1="50" x2="700" y2="50" stroke="#8cffcc"/>' +
      '<polyline points="' + poly + '" fill="none" stroke="#1d4130" stroke-width="3" stroke-linejoin="round"/><circle cx="700" cy="88" r="5" fill="#2ad03d" stroke="#272d2b" stroke-width="2"/></svg>' +
      '<p class="xsmall muted">Bản demo: đường minh hoạ, bản chính thức nối dữ liệu thật.</p></div>' +
      (lockedHere ? '<div class="live-lock"><div><strong>Dữ liệu thị trường dành cho khách hàng đã eKYC</strong><a class="btn btn-primary" href="' + BASE + '/quyen-loi/#mo-tai-khoan">' + (isMember() ? 'Xác thực eKYC' : 'Mở tài khoản') + '</a></div></div>' : '');
  }

  // ---------- glossary page ----------
  var glSearch = $('[data-gl-search]');
  if (glSearch) {
    var items = $$('.gl-item'), letter = 'all';
    var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); };
    items.forEach(function (it) { it._s = norm(it.getAttribute('data-search')); });
    function filter() {
      var q = norm(glSearch.value.trim()), n = 0;
      items.forEach(function (it) {
        var ok = (letter === 'all' || it.getAttribute('data-letter') === letter) && (!q || it._s.indexOf(q) > -1);
        it.classList.toggle('is-hidden', !ok); if (ok) n++;
      });
      $('[data-gl-count]').textContent = n + ' thuật ngữ';
      $('[data-gl-empty]').hidden = n > 0;
    }
    glSearch.addEventListener('input', filter);
    function seen(id) { if (id && !S.terms[id]) { S.terms[id] = true; save(); award(); } }
    items.forEach(function (it) { it.addEventListener('click', function () { seen(it.id); }); });
    if (location.hash) seen(location.hash.slice(1));
    $$('[data-letter]', $('[data-letters]')).forEach(function (b) {
      b.addEventListener('click', function () {
        letter = b.getAttribute('data-letter');
        $$('[data-letter]', $('[data-letters]')).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        filter();
      });
    });
    $$('[data-related]').forEach(function (a) {
      a.addEventListener('click', function () { glSearch.value = ''; letter = 'all'; $$('[data-letter]').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-letter') === 'all' ? 'true' : 'false'); }); filter(); });
    });
  }

  // ---------- login ----------
  var form = $('[data-login-form]');
  if (form) {
    var pwBtn = $('[data-pw-toggle]'), pw = $('[data-pw]');
    pwBtn.addEventListener('click', function () {
      var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
      pwBtn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      S.tier = form.tier.value; S.account = form.account.value; S.name = S.name || 'Nguyễn Văn A';
      var next = new URLSearchParams(location.search).get('next');
      toastNext('Đăng nhập thành công. Xin chào ' + S.name + '!');
      claimPending(); save();
      location.href = next && next.charAt(0) === '/' ? next : BASE + '/hoc-tap/';
    });
  }

  // ---------- learning page ----------
  if (document.body.getAttribute('data-page') === 'learning' && isMember()) {
    var mods = $$('[data-module-json]').map(function (s) { return JSON.parse(s.textContent); });
    var read = 0, modsDone = 0, certs = 0, contTarget = null;
    var list = $('[data-my-modules]');
    list.innerHTML = mods.map(function (m) {
      var dm = doneMap(m.slug), n = m.articles.filter(function (s) { return dm[s]; }).length;
      read += n; if (n === m.articles.length) modsDone++;
      if (!contTarget && n < m.articles.length) {
        var i = m.articles.findIndex(function (s) { return !dm[s]; });
        contTarget = { url: m.urls[i], title: m.titles[i], mod: m, n: n, i: i };
      }
      var badge = n === m.articles.length ? '<span class="tag" style="background:#2ad03d">Hoàn thành</span>' : n ? '<span class="tag tag-dark">Đang học</span>' : '<span class="tag tag-outline">Chưa bắt đầu</span>';
      return '<li><span class="mm-num">' + m.num + '</span><span class="mm-body"><a href="' + m.url + '">' + esc(m.title) + '</a><span class="bar"><span style="width:' + Math.round(n / m.articles.length * 100) + '%"></span></span></span><span class="small">' + n + '/' + m.articles.length + ' bài viết</span>' + badge + '</li>';
    }).join('');
    var certHtml = Object.keys(S.certs).map(function (k) {
      var c = S.certs[k], m = mods.filter(function (x) { return x.slug === k; })[0]; if (!m) return ''; certs++;
      return '<a class="cert-mini" href="' + m.exam + '#ket-qua"><span class="ico" aria-hidden="true"></span><span><strong>' + esc(m.title) + '</strong><br><span class="xsmall muted">Cấp ' + c.date + ' · ' + c.pct + '%</span></span></a>';
    }).join('');
    if (certHtml) $('[data-certs]').innerHTML = certHtml;
    $('[data-stat=read]').textContent = read;
    $('[data-stat=points]').textContent = points().toLocaleString('vi-VN');
    $('[data-stat=streak]').textContent = streaks().cur + ' ngày';
    $('[data-stat=badges]').textContent = Object.keys(S.badges).length + '/' + BADGES.length;
    var cc = $('[data-continue]');
    if (contTarget) {
      cc.href = contTarget.url;
      $('[data-continue-title]').textContent = contTarget.title;
      cc.firstElementChild.textContent = (contTarget.n ? 'Tiếp tục học' : 'Bắt đầu học') + ' · ' + contTarget.mod.title + ' · Bài ' + pad(contTarget.i + 1);
      $('[data-continue-fill]').style.width = Math.round(contTarget.n / contTarget.mod.articles.length * 100) + '%';
      $('[data-continue-count]').textContent = contTarget.n + '/' + contTarget.mod.articles.length + ' bài viết';
    } else {
      $('[data-continue-title]').textContent = 'Bạn đã đọc hết các bài viết hiện có';
      cc.href = BASE + '/#khoa-hoc';
    }
  }

  // ---------- badge surfaces ----------
  $$('[data-badge-shelf]').forEach(renderShelf);
  var bc = $('[data-badge-count]'); if (bc) bc.textContent = Object.keys(S.badges).length + '/' + BADGES.length + ' đã nhận';
  $$('[data-module-badge]').forEach(function (card) {
    var b = BADGES.filter(function (x) { return x.id === card.getAttribute('data-module-badge'); })[0]; if (!b) return;
    var st = $('[data-module-badge-status]', card), own = owned(b.id), p = progressOf(b);
    if (own) { st.textContent = 'Đã nhận ngày ' + own.date.split('-').reverse().join('/') + '.'; card.classList.add('is-owned'); }
    else if (isMember()) st.textContent = p[0] + '/' + p[1] + ' bài viết · còn ' + (p[1] - p[0]) + ' bài để nhận.';
    else st.textContent = 'Đăng nhập và hoàn thành ' + p[1] + ' bài viết để nhận.';
    $('img', card).classList.toggle('is-locked', !own);
  });
  var ownedEl = $('[data-owned]');
  if (ownedEl) {
    var o = owned(document.body.getAttribute('data-badge'));
    if (o) { ownedEl.hidden = false; ownedEl.textContent = 'Bạn đã nhận huy hiệu này ngày ' + o.date.split('-').reverse().join('/') + '.'; }
  }
  $$('[data-copy-url]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy-url');
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Đã sao chép liên kết.'); }, function () { toast(url); });
    });
  });
  award();

  // ---------- exam ----------
  var EX = json('exam-data');
  if (EX) initExam();
  function initExam() {
    var qs = $$('[data-exam-q]'), N = qs.length, cur = 0, ans = {}, flags = {}, timer = null, left = EX.minutes * 60, started = 0;
    var shell = $('[data-exam-shell]'), intro = $('[data-exam-intro]'), result = $('[data-exam-result]');
    function show(i) {
      cur = i;
      qs.forEach(function (q, k) { q.hidden = k !== i; });
      $$('[data-goto]').forEach(function (b, k) {
        b.classList.toggle('is-cur', k === i); b.classList.toggle('is-done', ans[k] != null); b.classList.toggle('is-flag', !!flags[k]);
        b.setAttribute('aria-current', k === i ? 'step' : 'false');
      });
      var f = $('[data-flag]'); f.setAttribute('aria-pressed', flags[i] ? 'true' : 'false'); f.textContent = flags[i] ? 'Bỏ đánh dấu' : 'Đánh dấu xem lại';
      $('[data-answered]').textContent = Object.keys(ans).length;
      $('[data-prev]').disabled = i === 0;
      $('[data-next]').textContent = i === N - 1 ? 'Về câu 1' : 'Câu tiếp';
    }
    qs.forEach(function (q, k) {
      $$('.exam-opt', q).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('.exam-opt', q).forEach(function (x) { x.setAttribute('aria-checked', 'false'); });
          b.setAttribute('aria-checked', 'true'); ans[k] = +b.getAttribute('data-opt'); show(k);
        });
      });
    });
    $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { show(+b.getAttribute('data-goto')); }); });
    $('[data-prev]').addEventListener('click', function () { if (cur > 0) show(cur - 1); });
    $('[data-next]').addEventListener('click', function () { show(cur < N - 1 ? cur + 1 : 0); });
    $('[data-flag]').addEventListener('click', function () { flags[cur] = !flags[cur]; show(cur); });
    function tick() {
      left--; var t = $('[data-timer]');
      t.textContent = Math.floor(left / 60) + ':' + pad(left % 60);
      t.classList.toggle('is-low', left < 120);
      if (left <= 0) submit(true);
    }
    $('[data-exam-start]').addEventListener('click', function () {
      intro.hidden = true; shell.hidden = false; started = Date.now(); timer = setInterval(tick, 1000); show(0); window.scrollTo(0, 0);
    });
    $('[data-submit]').addEventListener('click', function () {
      var miss = N - Object.keys(ans).length;
      if (miss > 0 && !confirm('Bạn còn ' + miss + ' câu chưa làm. Vẫn nộp bài?')) return;
      submit(false);
    });
    function submit(auto) {
      clearInterval(timer);
      var score = 0, byTopic = {};
      for (var k = 0; k < N; k++) {
        var tp = EX.topics[k]; byTopic[tp] = byTopic[tp] || [0, 0]; byTopic[tp][1]++;
        if (ans[k] === EX.answers[k]) { score++; byTopic[tp][0]++; }
      }
      var pct = Math.round(score / N * 100), pass = pct >= EX.pass, secs = Math.round((Date.now() - started) / 1000);
      if (pct === 100) { S.examPerfect[EX.module] = true; save(); setTimeout(award, 600); }
      shell.hidden = true; result.hidden = false; result.id = 'ket-qua'; window.scrollTo(0, 0);
      $('[data-result-title]').textContent = pass ? 'Chúc mừng, bạn đã đạt!' : (auto ? 'Hết giờ. Bạn chưa đạt lần này' : 'Bạn chưa đạt lần này');
      $('[data-r-score]').textContent = score + '/' + N;
      $('[data-r-pct]').textContent = pct + '%';
      $('[data-r-time]').textContent = Math.floor(secs / 60) + ':' + pad(secs % 60);
      $('[data-topics]').innerHTML = Object.keys(byTopic).map(function (t) {
        var v = byTopic[t];
        return '<li><div class="space-between small"><span>' + esc(t) + '</span><strong>' + v[0] + '/' + v[1] + '</strong></div><div class="bar"><span style="width:' + Math.round(v[0] / v[1] * 100) + '%"></span></div></li>';
      }).join('');
      $('[data-fail]').hidden = pass;
      if (pass && S.tier === 'ekyc') {
        var d = new Date(), date = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
        var code = 'DSCA-' + EX.module.slice(0, 3).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        S.certs[EX.module] = { date: date, code: code, pct: pct, name: S.name }; save();
        renderCert(S.certs[EX.module]);
      } else if (pass) {
        $('[data-cert-locked]').hidden = false;
      }
    }
    function renderCert(c) {
      $('[data-cert]').hidden = false; $('[data-cert-actions]').hidden = false;
      $('[data-cert-name]').textContent = (c.name || 'Nguyễn Văn A').toUpperCase();
      $('[data-cert-date]').textContent = c.date; $('[data-cert-code]').textContent = c.code; $('[data-cert-score]').textContent = c.pct + '%';
    }
    $('[data-retry]').addEventListener('click', function () { location.reload(); });
    $('[data-print]').addEventListener('click', function () { window.print(); });
    $('[data-copy-link]').addEventListener('click', function () {
      var url = location.href.split('#')[0];
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Đã sao chép liên kết.'); }, function () { toast(url); });
    });
    if (location.hash === '#ket-qua' && S.certs[EX.module] && S.tier === 'ekyc') {
      var c = S.certs[EX.module];
      intro.hidden = true; result.hidden = false;
      $('[data-result-title]').textContent = 'Chứng chỉ của bạn';
      $('[data-r-pct]').textContent = c.pct + '%'; $('[data-r-score]').textContent = Math.round(c.pct * N / 100) + '/' + N; $('[data-r-time]').textContent = '—';
      renderCert(c);
    }
  }
})();
