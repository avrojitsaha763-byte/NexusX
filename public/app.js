/* ============================================================
   NexusX — app.js  (Complete Frontend Logic)
   Author: NexusX Team
   ============================================================ */

// ─── State ───────────────────────────────────────────────────
let token = localStorage.getItem('nx_token') || null;
let currentUser = JSON.parse(localStorage.getItem('nx_user') || 'null');
let activeView = 'feed';
let feedFilter = 'all';
let activeCommentPostId = null;
let reactionPickerPostId = null;
let reactionPickerTimer = null;
let searchDebounceTimer = null;
let currentProfileId = null;
let testimonialTimer = null;
let testimonialIndex = 0;

// ─── Audio Engine ─────────────────────────────────────────────
const AudioFX = {
  ctx: null,
  getCtx() {
    if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return this.ctx;
  },
  play(type) {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      const types = {
        click: () => { osc.type='sine'; osc.frequency.setValueAtTime(600,now); osc.frequency.exponentialRampToValueAtTime(200,now+0.06); gain.gain.setValueAtTime(0.03,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.06); osc.start(now); osc.stop(now+0.06); },
        like: () => {
          const o2 = ctx.createOscillator(); o2.connect(gain);
          osc.type='sine'; o2.type='triangle';
          osc.frequency.setValueAtTime(280,now); osc.frequency.exponentialRampToValueAtTime(720,now+0.15);
          o2.frequency.setValueAtTime(420,now); o2.frequency.exponentialRampToValueAtTime(1080,now+0.15);
          gain.gain.setValueAtTime(0.04,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.15);
          osc.start(now); o2.start(now); osc.stop(now+0.15); o2.stop(now+0.15);
        },
        success: () => {
          [261.63,329.63,392,523.25].forEach((f,i)=>{
            const o=ctx.createOscillator(),g=ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type='sine'; o.frequency.setValueAtTime(f,now+i*0.08);
            g.gain.setValueAtTime(0.05,now+i*0.08); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.08+0.25);
            o.start(now+i*0.08); o.stop(now+i*0.08+0.25);
          });
        },
        notif: () => { osc.type='sine'; osc.frequency.setValueAtTime(880,now); osc.frequency.setValueAtTime(1100,now+0.1); gain.gain.setValueAtTime(0.03,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.22); osc.start(now); osc.stop(now+0.25); }
      };
      if (types[type]) types[type]();
    } catch {}
  }
};

// ─── Particle Canvas ──────────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < 60; i++) {
    particles.push({ x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight, r: Math.random()*1.5+0.3, vx: (Math.random()-0.5)*0.15, vy: (Math.random()-0.5)*0.15, o: Math.random()*0.4+0.1 });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108,71,255,${p.o})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ─── Testimonial Rotator ──────────────────────────────────────
function startTestimonials() {
  const items = document.querySelectorAll('.testimonial');
  if (!items.length) return;
  testimonialTimer = setInterval(() => {
    items[testimonialIndex].classList.remove('active');
    testimonialIndex = (testimonialIndex + 1) % items.length;
    items[testimonialIndex].classList.add('active');
  }, 4000);
}
startTestimonials();

// ─── Utilities ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const escHtml = s => String(s).replace(/[&<>"']/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]));

function toast(msg, isError = false) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast${isError ? ' error' : ''}`;
  t.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${escHtml(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 604800) return `${Math.floor(s/86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

function parseContent(text) {
  return escHtml(text)
    .replace(/(#\w+)/g, '<span class="hashtag">$1</span>')
    .replace(/(@\w+)/g, '<span class="mention">$1</span>');
}

function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) return;
  const steps = 30;
  let i = 0;
  const timer = setInterval(() => {
    i++;
    el.textContent = Math.round(start + diff * (i / steps));
    if (i >= steps) { el.textContent = target; clearInterval(timer); }
  }, 16);
}

// ─── API Layer ────────────────────────────────────────────────
async function api(endpoint, method = 'GET', body = null, isMultipart = false) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let opts = { method, headers };
  if (body) {
    if (isMultipart) { opts.body = body; }
    else { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(endpoint, opts);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) logout();
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────
function togglePwd(inputId, btn) {
  const inp = $(inputId);
  if (!inp) return;
  const isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  btn.querySelector('i').className = `fa-regular fa-eye${isPass ? '-slash' : ''}`;
}
window.togglePwd = togglePwd;

// Password strength
const regPwdInput = $('reg-password');
if (regPwdInput) {
  regPwdInput.addEventListener('input', () => {
    const v = regPwdInput.value;
    const fill = $('strength-fill');
    const label = $('strength-label');
    let score = 0;
    if (v.length >= 6) score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    const levels = [{w:'20%',c:'#ff4757',l:'Weak'},{w:'40%',c:'#ff6b35',l:'Fair'},{w:'60%',c:'#ffd700',l:'Good'},{w:'80%',c:'#00d4ff',l:'Strong'},{w:'100%',c:'#00e676',l:'Very Strong'}];
    const lv = levels[Math.min(score, 4)];
    fill.style.width = lv.w;
    fill.style.backgroundColor = lv.c;
    label.textContent = lv.l;
    label.style.color = lv.c;
  });
}

$('show-register-link')?.addEventListener('click', e => { e.preventDefault(); $('login-form').classList.remove('active'); $('register-form').classList.add('active'); });
$('show-login-link')?.addEventListener('click', e => { e.preventDefault(); $('register-form').classList.remove('active'); $('login-form').classList.add('active'); });

$('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-submit-btn');
  btn.classList.add('loading');
  btn.querySelector('span').textContent = 'Signing in...';
  try {
    const data = await api('/api/auth/login', 'POST', { username: $('login-username').value, password: $('login-password').value });
    setSession(data.token, data.user);
    initApp();
    AudioFX.play('success');
  } catch (err) { toast(err.message, true); }
  finally { btn.classList.remove('loading'); btn.querySelector('span').textContent = 'Sign In'; }
});

$('register-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('register-submit-btn');
  btn.classList.add('loading');
  btn.querySelector('span').textContent = 'Creating...';
  try {
    await api('/api/auth/register', 'POST', { username: $('reg-username').value, display_name: $('reg-display-name').value, password: $('reg-password').value });
    toast('Account created! Sign in now 🎉');
    $('register-form').classList.remove('active');
    $('login-form').classList.add('active');
  } catch (err) { toast(err.message, true); }
  finally { btn.classList.remove('loading'); btn.querySelector('span').textContent = 'Create Account'; }
});

function setSession(t, u) {
  token = t; currentUser = u;
  localStorage.setItem('nx_token', t);
  localStorage.setItem('nx_user', JSON.stringify(u));
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('nx_token');
  localStorage.removeItem('nx_user');
  $('app-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  $('login-form').classList.add('active');
  $('register-form').classList.remove('active');
  $('login-username').value = '';
  $('login-password').value = '';
  clearInterval(testimonialTimer);
  startTestimonials();
  document.documentElement.setAttribute('data-theme', 'dark');
}

$('logout-btn')?.addEventListener('click', logout);

// ─── App Init ─────────────────────────────────────────────────
function initApp() {
  if (!token || !currentUser) {
    $('auth-view').classList.remove('hidden');
    $('app-view').classList.add('hidden');
    return;
  }
  $('auth-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  updateGlobalUI();
  switchView('feed');
  loadRightSidebar();
  loadNotifCount();
}

function updateGlobalUI() {
  const av = currentUser.avatar_url || '/uploads/default-avatar.png';
  const updateAvatar = (id) => { const el = $(id); if (el) el.src = av; };
  ['sidebar-avatar','composer-avatar','modal-composer-avatar','comment-avatar','mob-avatar'].forEach(updateAvatar);
  const nameEl = $('sidebar-user-name');
  const handleEl = $('sidebar-user-handle');
  if (nameEl) nameEl.textContent = currentUser.display_name || currentUser.username;
  if (handleEl) handleEl.textContent = `@${currentUser.username}`;
  const pulseEl = $('sidebar-pulse-score');
  if (pulseEl) animateNumber(pulseEl, currentUser.pulse_score || 0);
  const pulseBar = $('pulse-bar');
  if (pulseBar) { setTimeout(() => { pulseBar.style.width = Math.min((currentUser.pulse_score || 0) / 10, 100) + '%'; }, 200); }
  const rankEl = $('pulse-rank-text');
  if (rankEl) {
    const score = currentUser.pulse_score || 0;
    let rank = score > 500 ? '🏆 Top Creator' : score > 200 ? '⚡ Rising Star' : score > 50 ? '🌱 Growing' : '🔥 Just Started';
    rankEl.innerHTML = `Rank: <strong>${rank}</strong>`;
  }
}

// ─── Theme Toggle ─────────────────────────────────────────────
$('theme-toggle-btn')?.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const lbl = document.querySelector('.theme-label');
  if (lbl) lbl.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  AudioFX.play('click');
});

// ─── View Switcher ────────────────────────────────────────────
function switchView(name, param = null) {
  activeView = name;
  document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  const view = $(`view-${name}`);
  if (view) view.classList.remove('hidden');
  const navBtn = $(`nav-${name}`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll(`.mob-nav-btn[data-view="${name}"]`).forEach(b => b.classList.add('active'));
  document.querySelector('.sidebar-left')?.classList.remove('open');
  if (name === 'feed') loadFeed();
  else if (name === 'explore') loadExplore();
  else if (name === 'notifications') loadNotifications();
  else if (name === 'bookmarks') loadBookmarks();
  else if (name === 'profile') { currentProfileId = param || currentUser?.id; loadProfile(currentProfileId); }
}

// Nav buttons
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => { AudioFX.play('click'); switchView(btn.dataset.view); });
});
document.querySelectorAll('.mob-nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => { AudioFX.play('click'); switchView(btn.dataset.view); });
});

// Mobile sidebar
$('mobile-menu-btn')?.addEventListener('click', () => {
  document.querySelector('.sidebar-left').classList.toggle('open');
});

// Compose buttons
['compose-btn-sidebar','mobile-compose-btn','mobile-compose-center'].forEach(id => {
  $(id)?.addEventListener('click', () => openModal('compose-modal'));
});

// ─── Modal System ─────────────────────────────────────────────
function openModal(id) {
  const m = $(id);
  if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const m = $(id);
  if (m) { m.classList.add('hidden'); document.body.style.overflow = ''; }
}
document.querySelectorAll('.modal-close-btn, [data-close]').forEach(btn => {
  const target = btn.dataset.close;
  if (target) btn.addEventListener('click', () => closeModal(target));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id)); });

// ─── Composer (Feed) ──────────────────────────────────────────
const composerText = $('composer-text');
const charRingFill = $('char-ring-fill');
const charCount = $('char-count');
const MAX_CHARS = 500;

function updateCharRing(len, fillEl, countEl) {
  if (!fillEl) return;
  const pct = (len / MAX_CHARS) * 100;
  const circ = 2 * Math.PI * 15.9;
  fillEl.style.strokeDasharray = `${(pct / 100) * circ} ${circ}`;
  fillEl.style.stroke = pct > 90 ? '#ff4757' : pct > 70 ? '#ffd700' : 'var(--nx-accent)';
  if (countEl) { countEl.style.display = pct > 60 ? 'block' : 'none'; countEl.textContent = MAX_CHARS - len; }
}

composerText?.addEventListener('input', () => {
  const len = composerText.value.length;
  updateCharRing(len, charRingFill, charCount);
  composerText.style.height = 'auto';
  composerText.style.height = composerText.scrollHeight + 'px';
});

// Image preview
function setupImagePreview(inputId, previewBoxId, previewImgId, removeBtnId) {
  const inp = $(inputId), box = $(previewBoxId), img = $(previewImgId), rem = $(removeBtnId);
  if (!inp) return;
  inp.addEventListener('change', () => {
    if (!inp.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; box.classList.remove('hidden'); };
    reader.readAsDataURL(inp.files[0]);
  });
  rem?.addEventListener('click', () => { inp.value = ''; img.src = ''; box.classList.add('hidden'); });
}
setupImagePreview('composer-img-input','composer-img-preview','composer-preview-img','remove-img-btn');
setupImagePreview('modal-img-input','modal-img-preview','modal-preview-img','modal-remove-img-btn');

// Emoji quick panel
document.querySelectorAll('.quick-emoji').forEach(btn => {
  btn.addEventListener('click', () => {
    if (composerText) { composerText.value += btn.dataset.emoji; composerText.dispatchEvent(new Event('input')); composerText.focus(); }
    if ($('modal-composer-text')) $('modal-composer-text').value += btn.dataset.emoji;
    AudioFX.play('click');
  });
});

// Submit from feed composer
$('submit-vibe-btn')?.addEventListener('click', () => submitPost(composerText, $('composer-img-input'), 'submit-vibe-btn'));

// Submit from modal composer
$('modal-submit-vibe-btn')?.addEventListener('click', () => {
  submitPost($('modal-composer-text'), $('modal-img-input'), 'modal-submit-vibe-btn', () => closeModal('compose-modal'));
});

async function submitPost(textEl, imgEl, btnId, afterCb) {
  if (!textEl) return;
  const content = textEl.value.trim();
  if (!content) return toast('Write something first!', true);
  const btn = $(btnId);
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Posting...'; }
  const fd = new FormData();
  fd.append('content', content);
  if (imgEl?.files[0]) fd.append('image', imgEl.files[0]);
  try {
    await api('/api/posts', 'POST', fd, true);
    textEl.value = '';
    if (imgEl) imgEl.value = '';
    textEl.style.height = 'auto';
    updateCharRing(0, charRingFill, charCount);
    if (composerText) { composerText.value = ''; composerText.style.height='auto'; updateCharRing(0, charRingFill, charCount); }
    document.querySelectorAll('.composer-img-preview').forEach(b => b.classList.add('hidden'));
    AudioFX.play('success');
    toast('Vibe posted! ✨');
    if (afterCb) afterCb();
    loadFeed();
  } catch (err) { toast(err.message, true); }
  finally { if (btn) { btn.disabled = false; btn.querySelector('span').textContent = btnId.includes('modal') ? 'Post Vibe' : 'Vibe'; } }
}

// ─── Post Rendering ───────────────────────────────────────────
function createPostCard(post, index = 0) {
  const av = post.avatar_url || '/uploads/default-avatar.png';
  const isOwner = post.user_id === currentUser?.id;
  const verifiedBadge = post.verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';
  const reactionEmoji = post.user_reaction || '❤️';
  const reacted = !!post.user_reaction;
  const reposted = !!post.is_reposted;
  const bookmarked = !!post.is_bookmarked;

  const imageHtml = post.image_url
    ? `<div class="post-image" onclick="openLightbox('${escHtml(post.image_url)}')"><img src="${escHtml(post.image_url)}" alt="Post image" loading="lazy"></div>`
    : '';

  const repostLabel = post.post_type === 'repost'
    ? `<div class="repost-label"><i class="fa-solid fa-retweet"></i> Reposted</div>`
    : '';

  const deleteBtn = isOwner
    ? `<button class="post-action-btn delete-btn" onclick="deletePost(${post.id})" title="Delete"><i class="fa-regular fa-trash-can"></i></button>`
    : '';

  return `
    <article class="post-card animate-in" id="post-${post.id}" style="animation-delay:${index * 0.05}s">
      <div class="post-left">
        <img src="${escHtml(av)}" alt="Avatar" class="post-avatar" onclick="navigateToProfile(${post.user_id})">
      </div>
      <div class="post-right">
        ${repostLabel}
        <div class="post-header">
          <div class="post-author">
            <span class="author-name" onclick="navigateToProfile(${post.user_id})">${escHtml(post.display_name || post.username)}</span>
            ${verifiedBadge}
            <span class="author-handle">@${escHtml(post.username)}</span>
            <span class="post-dot">·</span>
            <span class="post-time">${timeAgo(post.created_at)}</span>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            ${deleteBtn}
            <button class="post-menu-btn"><i class="fa-solid fa-ellipsis"></i></button>
          </div>
        </div>
        <div class="post-content">${parseContent(post.content)}</div>
        ${imageHtml}
        <div class="post-actions">
          <button class="post-action-btn react-btn ${reacted ? 'reacted' : ''}"
            data-post-id="${post.id}"
            data-reacted="${reacted}"
            data-emoji="${escHtml(reactionEmoji)}"
            onmouseenter="showReactionPicker(${post.id}, this)"
            onmouseleave="hideReactionPickerDelayed()"
            onclick="quickReact(${post.id}, '${escHtml(reactionEmoji)}', this)">
            <span class="btn-emoji">${reacted ? reactionEmoji : '🤍'}</span>
            <span class="post-action-count reaction-count-${post.id}">${post.reactions_count || 0}</span>
          </button>
          <button class="post-action-btn comment-btn" onclick="openComments(${post.id})">
            <i class="fa-regular fa-comment"></i>
            <span class="post-action-count">${post.comments_count || 0}</span>
          </button>
          <button class="post-action-btn repost-btn ${reposted ? 'reposted' : ''}" onclick="toggleRepost(${post.id}, this)" data-reposted="${reposted}">
            <i class="fa-solid fa-retweet"></i>
            <span class="post-action-count">${post.reposts_count || 0}</span>
          </button>
          <button class="post-action-btn bookmark-btn ${bookmarked ? 'bookmarked' : ''}" onclick="toggleBookmark(${post.id}, this)" data-bookmarked="${bookmarked}">
            <i class="${bookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderPosts(container, posts, emptyMsg = 'No vibes here yet.') {
  if (!container) return;
  if (!posts || posts.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-regular fa-face-smile-wink"></i><h3>${emptyMsg}</h3><p>Be the first to share something!</p></div>`;
    return;
  }
  container.innerHTML = posts.map((p, i) => createPostCard(p, i)).join('');
}

// ─── Feed ─────────────────────────────────────────────────────
async function loadFeed() {
  const container = $('feed-posts');
  if (!container) return;
  container.innerHTML = `<div class="skeleton-loader">${Array(4).fill('<div class="skeleton-post"><div class="sk-avatar"></div><div class="sk-lines"><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line med"></div></div></div>').join('')}</div>`;
  try {
    const url = feedFilter === 'following' ? '/api/posts?feed=following' : '/api/posts';
    const posts = await api(url);
    renderPosts(container, posts, 'Your feed is empty.');
  } catch (err) { container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load feed</h3></div>`; }
}

// Feed tabs
$('tab-all')?.addEventListener('click', () => { feedFilter = 'all'; $('tab-all').classList.add('active'); $('tab-following').classList.remove('active'); loadFeed(); AudioFX.play('click'); });
$('tab-following')?.addEventListener('click', () => { feedFilter = 'following'; $('tab-following').classList.add('active'); $('tab-all').classList.remove('active'); loadFeed(); AudioFX.play('click'); });

// ─── Reactions ────────────────────────────────────────────────
const reactionPicker = $('reaction-picker');

function showReactionPicker(postId, anchorEl) {
  clearTimeout(reactionPickerTimer);
  reactionPickerPostId = postId;
  const rect = anchorEl.getBoundingClientRect();
  reactionPicker.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  reactionPicker.style.left = rect.left + 'px';
  reactionPicker.classList.remove('hidden');
  reactionPicker.onmouseenter = () => clearTimeout(reactionPickerTimer);
  reactionPicker.onmouseleave = () => hideReactionPickerDelayed();
}
function hideReactionPickerDelayed() {
  reactionPickerTimer = setTimeout(() => reactionPicker.classList.add('hidden'), 300);
}
window.showReactionPicker = showReactionPicker;
window.hideReactionPickerDelayed = hideReactionPickerDelayed;

document.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!reactionPickerPostId) return;
    await doReaction(reactionPickerPostId, btn.dataset.emoji);
    reactionPicker.classList.add('hidden');
  });
});

async function doReaction(postId, emoji) {
  AudioFX.play('like');
  const reactBtn = document.querySelector(`.react-btn[data-post-id="${postId}"]`);
  try {
    const data = await api(`/api/posts/${postId}/react`, 'POST', { emoji });
    if (reactBtn) {
      const isNowReacted = data.user_reaction !== null;
      const emojiSpan = reactBtn.querySelector('.btn-emoji');
      const countSpan = reactBtn.querySelector(`.reaction-count-${postId}`);
      reactBtn.dataset.reacted = isNowReacted;
      reactBtn.dataset.emoji = data.user_reaction || '❤️';
      reactBtn.classList.toggle('reacted', isNowReacted);
      if (emojiSpan) emojiSpan.textContent = isNowReacted ? (data.user_reaction || '❤️') : '🤍';
      if (countSpan) {
        const current = parseInt(countSpan.textContent);
        countSpan.textContent = isNowReacted ? current + 1 : Math.max(0, current - 1);
        countSpan.style.animation = 'none';
        setTimeout(() => { countSpan.style.animation = 'countUp 0.3s ease'; }, 10);
      }
      // burst animation
      const burst = document.createElement('div');
      burst.className = 'reaction-burst';
      burst.textContent = emoji;
      reactBtn.style.position = 'relative';
      reactBtn.appendChild(burst);
      setTimeout(() => burst.remove(), 600);
    }
  } catch (err) { toast(err.message, true); }
}

async function quickReact(postId, currentEmoji, btnEl) {
  const reacted = btnEl.dataset.reacted === 'true';
  const emoji = reacted ? currentEmoji : '❤️';
  await doReaction(postId, emoji);
}
window.quickReact = quickReact;

// ─── Comments ─────────────────────────────────────────────────
async function openComments(postId) {
  activeCommentPostId = postId;
  AudioFX.play('click');
  openModal('comments-modal');
  const body = $('modal-original-post');
  const list = $('comments-list');
  if (body) body.innerHTML = '<div class="loading-state small"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
  if (list) list.innerHTML = '';
  try {
    const posts = await api(`/api/posts?userId=${postId}`);
    const allPosts = await api('/api/posts');
    const post = allPosts.find(p => p.id === postId);
    if (post && body) {
      const av = post.avatar_url || '/uploads/default-avatar.png';
      body.innerHTML = `
        <div class="post-card" style="border:none;padding:0;background:transparent;">
          <div class="post-left"><img src="${escHtml(av)}" alt="" class="post-avatar"></div>
          <div class="post-right">
            <div class="post-header"><div class="post-author"><span class="author-name">${escHtml(post.display_name||post.username)}</span><span class="author-handle">@${escHtml(post.username)}</span><span class="post-dot">·</span><span class="post-time">${timeAgo(post.created_at)}</span></div></div>
            <div class="post-content">${parseContent(post.content)}</div>
            ${post.image_url ? `<div class="post-image"><img src="${escHtml(post.image_url)}" alt="Post image"></div>` : ''}
          </div>
        </div>`;
    }
    const comments = await api(`/api/posts/${postId}/comments`);
    if (!list) return;
    if (!comments.length) { list.innerHTML = '<div class="loading-state small" style="color:var(--text-muted)"><i class="fa-regular fa-comment"></i> No replies yet</div>'; return; }
    list.innerHTML = comments.map(c => {
      const cav = c.avatar_url || '/uploads/default-avatar.png';
      return `<div class="comment-item"><img src="${escHtml(cav)}" alt="" class="comment-avatar"><div class="comment-body"><div class="comment-author">${escHtml(c.display_name||c.username)} ${c.verified?'<i class="fa-solid fa-circle-check verified-badge"></i>':''} <span class="post-time" style="font-weight:400;color:var(--text-muted)">${timeAgo(c.created_at)}</span></div><div class="comment-text">${parseContent(c.content)}</div></div></div>`;
    }).join('');
  } catch (err) { toast(err.message, true); closeModal('comments-modal'); }
}
window.openComments = openComments;

$('comment-send-btn')?.addEventListener('click', async () => {
  const inp = $('comment-input');
  if (!inp || !inp.value.trim() || !activeCommentPostId) return;
  try {
    await api(`/api/posts/${activeCommentPostId}/comments`, 'POST', { content: inp.value.trim() });
    AudioFX.play('click');
    inp.value = '';
    openComments(activeCommentPostId);
  } catch (err) { toast(err.message, true); }
});
$('comment-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('comment-send-btn').click(); } });

// ─── Repost / Bookmark / Delete ───────────────────────────────
async function toggleRepost(postId, btn) {
  try {
    const data = await api(`/api/posts/${postId}/repost`, 'POST', {});
    const isNow = data.is_reposted;
    btn.classList.toggle('reposted', isNow);
    btn.dataset.reposted = isNow;
    const cnt = btn.querySelector('.post-action-count');
    if (cnt) cnt.textContent = parseInt(cnt.textContent) + (isNow ? 1 : -1);
    AudioFX.play(isNow ? 'like' : 'click');
    toast(isNow ? 'Reposted to your profile! 🔁' : 'Repost removed');
  } catch (err) { toast(err.message, true); }
}
window.toggleRepost = toggleRepost;

async function toggleBookmark(postId, btn) {
  try {
    const data = await api(`/api/posts/${postId}/bookmark`, 'POST', {});
    const isNow = data.is_bookmarked;
    btn.classList.toggle('bookmarked', isNow);
    btn.dataset.bookmarked = isNow;
    btn.querySelector('i').className = `${isNow ? 'fa-solid' : 'fa-regular'} fa-bookmark`;
    AudioFX.play('click');
    toast(isNow ? 'Saved to bookmarks ✨' : 'Bookmark removed');
  } catch (err) { toast(err.message, true); }
}
window.toggleBookmark = toggleBookmark;

async function deletePost(postId) {
  if (!confirm('Delete this vibe?')) return;
  try {
    await api(`/api/posts/${postId}`, 'DELETE');
    const card = $(`post-${postId}`);
    if (card) { card.style.opacity = '0'; card.style.transform = 'scale(0.95)'; card.style.transition = 'all 0.3s ease'; setTimeout(() => card.remove(), 300); }
    AudioFX.play('click');
    toast('Vibe deleted');
  } catch (err) { toast(err.message, true); }
}
window.deletePost = deletePost;

// ─── Lightbox ─────────────────────────────────────────────────
function openLightbox(src) {
  const lb = $('lightbox');
  const img = $('lightbox-img');
  if (!lb || !img) return;
  img.src = src;
  lb.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
window.openLightbox = openLightbox;
$('lightbox-close')?.addEventListener('click', () => { $('lightbox').classList.add('hidden'); document.body.style.overflow = ''; });
$('lightbox')?.addEventListener('click', e => { if (e.target === $('lightbox')) { $('lightbox').classList.add('hidden'); document.body.style.overflow = ''; } });

// ─── Explore ──────────────────────────────────────────────────
async function loadExplore() {
  loadExplorePeople();
  loadExplorePosts();
  loadTrendingChips();
}

async function loadExplorePeople() {
  const container = $('explore-people');
  if (!container) return;
  container.innerHTML = '<div class="loading-state small"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
  try {
    const users = await api('/api/users/suggestions');
    if (!users.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users"></i><h3>No suggestions</h3></div>'; return; }
    container.innerHTML = users.map(u => {
      const av = u.avatar_url || '/uploads/default-avatar.png';
      return `<div class="people-card" onclick="navigateToProfile(${u.id})">
        <img src="${escHtml(av)}" alt="${escHtml(u.username)}" class="people-card-avatar">
        <div class="people-card-name">${escHtml(u.display_name||u.username)}</div>
        <div class="people-card-handle">@${escHtml(u.username)}</div>
        ${u.bio ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${escHtml(u.bio.slice(0,50))}...</div>` : ''}
        <button class="people-card-btn" onclick="event.stopPropagation();followFromExplore(${u.id}, this)">${u.is_following ? 'Following' : 'Follow'}</button>
      </div>`;
    }).join('');
  } catch {}
}

async function loadExplorePosts() {
  const container = $('explore-posts');
  if (!container) return;
  container.innerHTML = `<div class="skeleton-loader">${Array(3).fill('<div class="skeleton-post"><div class="sk-avatar"></div><div class="sk-lines"><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line med"></div></div></div>').join('')}</div>`;
  try {
    const posts = await api('/api/posts?feed=explore');
    renderPosts(container, posts, 'No global vibes yet.');
  } catch {}
}

async function loadTrendingChips() {
  const container = $('trending-chips');
  if (!container) return;
  try {
    const trending = await api('/api/trending');
    container.innerHTML = trending.map(t => `<div class="trending-chip" onclick="filterByTag('${escHtml(t.tag)}')">${escHtml(t.tag)}</div>`).join('');
  } catch {}
}

window.followFromExplore = async (userId, btn) => {
  const isFollowing = btn.textContent.trim() === 'Following';
  try {
    if (isFollowing) { await api(`/api/users/${userId}/follow`, 'DELETE'); btn.textContent = 'Follow'; btn.classList.remove('following'); }
    else { await api(`/api/users/${userId}/follow`, 'POST', {}); btn.textContent = 'Following'; btn.classList.add('following'); }
    AudioFX.play('click');
  } catch (err) { toast(err.message, true); }
};

function filterByTag(tag) {
  const searchEl = $('explore-search');
  if (searchEl) { searchEl.value = tag; searchEl.dispatchEvent(new Event('input')); }
}
window.filterByTag = filterByTag;

// Explore search
let exploreSearchTimer;
$('explore-search')?.addEventListener('input', e => {
  clearTimeout(exploreSearchTimer);
  exploreSearchTimer = setTimeout(() => runSearch(e.target.value.trim(), 'search-dropdown', $('explore-posts')), 300);
});

async function runSearch(q, dropdownId, postsContainer) {
  const dropdown = $(dropdownId);
  if (!q) { if (dropdown) dropdown.classList.remove('open'); return; }
  try {
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (dropdown) {
      if (!users.length) { dropdown.classList.remove('open'); return; }
      dropdown.innerHTML = users.map(u => {
        const av = u.avatar_url || '/uploads/default-avatar.png';
        return `<div class="search-result-item" onclick="navigateToProfile(${u.id})"><img src="${escHtml(av)}" alt=""><div><div class="search-result-name">${escHtml(u.display_name||u.username)}</div><div class="search-result-handle">@${escHtml(u.username)}</div></div></div>`;
      }).join('');
      dropdown.classList.add('open');
    }
  } catch {}
}

// Right sidebar search
$('right-search-input')?.addEventListener('input', e => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => runSearch(e.target.value.trim(), 'right-search-dropdown', null), 300);
});
document.addEventListener('click', e => {
  if (!e.target.closest('.explore-search-bar') && !e.target.closest('.right-search-bar')) {
    document.querySelectorAll('.search-results-dropdown').forEach(d => d.classList.remove('open'));
  }
});

// ─── Notifications ────────────────────────────────────────────
async function loadNotifCount() {
  try {
    const notifs = await api('/api/notifications');
    const unread = notifs.filter(n => !n.read).length;
    const badge = $('notif-badge');
    const dot = $('mob-notif-dot');
    if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
    if (dot) dot.classList.toggle('hidden', unread === 0);
  } catch {}
}

async function loadNotifications() {
  const container = $('notifications-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
  try {
    const notifs = await api('/api/notifications');
    if (!notifs.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><h3>No notifications yet</h3><p>Activity will appear here</p></div>'; return; }
    container.innerHTML = notifs.map(n => {
      const av = n.avatar_url || '/uploads/default-avatar.png';
      const icons = { reaction:'fa-heart notif-icon-reaction', follow:'fa-user-plus notif-icon-follow', comment:'fa-comment notif-icon-comment' };
      const msgs = { reaction:`<strong>${escHtml(n.display_name||n.username)}</strong> reacted to your vibe`, follow:`<strong>${escHtml(n.display_name||n.username)}</strong> started following you`, comment:`<strong>${escHtml(n.display_name||n.username)}</strong> replied to your vibe` };
      return `<div class="notif-item ${n.read ? '' : 'unread'}" onclick="navigateToProfile(${n.actor_id})">
        <div class="notif-icon-wrap ${(icons[n.type]||'').split(' ')[1]||''}"><i class="fa-solid ${(icons[n.type]||'').split(' ')[0]||'fa-bell'}"></i></div>
        <div class="notif-body"><div class="notif-text">${msgs[n.type]||'New activity'}</div><div class="notif-time">${timeAgo(n.created_at)}</div></div>
        ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
      </div>`;
    }).join('');
    // mark as read
    api('/api/notifications/read', 'PUT', {}).catch(()=>{});
    const badge = $('notif-badge'); const dot = $('mob-notif-dot');
    if (badge) badge.classList.add('hidden');
    if (dot) dot.classList.add('hidden');
  } catch {}
}

$('mark-read-btn')?.addEventListener('click', async () => {
  await api('/api/notifications/read', 'PUT', {}).catch(()=>{});
  loadNotifications();
  AudioFX.play('click');
});

// ─── Bookmarks ────────────────────────────────────────────────
async function loadBookmarks() {
  const container = $('bookmarks-posts');
  if (!container) return;
  container.innerHTML = `<div class="skeleton-loader">${Array(3).fill('<div class="skeleton-post"><div class="sk-avatar"></div><div class="sk-lines"><div class="sk-line short"></div><div class="sk-line"></div><div class="sk-line med"></div></div></div>').join('')}</div>`;
  try {
    const posts = await api('/api/bookmarks');
    renderPosts(container, posts, 'No saved vibes yet. Bookmark posts to save them here.');
  } catch {}
}

// ─── Right Sidebar ────────────────────────────────────────────
async function loadRightSidebar() {
  loadTrending();
  loadWhoToFollow();
}

async function loadTrending() {
  const container = $('trending-list');
  if (!container) return;
  try {
    const trending = await api('/api/trending');
    const maxCount = trending[0]?.count || 1;
    container.innerHTML = trending.map((t, i) => `
      <div class="trending-item" onclick="switchView('explore')">
        <span class="trend-category">Trending ${i + 1}</span>
        <span class="trend-name">${escHtml(t.tag)}</span>
        <div class="trend-bar-wrap"><div class="trend-bar" style="width:${Math.round((t.count/maxCount)*100)}%"></div></div>
        <span class="trend-count">${t.count.toLocaleString()} vibes</span>
      </div>`).join('');
  } catch {}
}

async function loadWhoToFollow() {
  const container = $('who-to-follow-list');
  if (!container) return;
  try {
    const users = await api('/api/users/suggestions');
    container.innerHTML = users.slice(0,5).map(u => {
      const av = u.avatar_url || '/uploads/default-avatar.png';
      return `<div class="follow-item">
        <img src="${escHtml(av)}" alt="" class="follow-item-avatar" onclick="navigateToProfile(${u.id})">
        <div class="follow-item-info" onclick="navigateToProfile(${u.id})">
          <div class="follow-item-name">${escHtml(u.display_name||u.username)} ${u.verified?'<i class="fa-solid fa-circle-check verified-badge"></i>':''}</div>
          <div class="follow-item-handle">@${escHtml(u.username)}</div>
        </div>
        <button class="follow-btn" data-uid="${u.id}" onclick="toggleFollowSidebar(${u.id}, this)">${u.is_following?'Following':'Follow'}</button>
      </div>`;
    }).join('');
  } catch {}
}

window.toggleFollowSidebar = async (userId, btn) => {
  const isFollowing = btn.textContent.trim() === 'Following';
  try {
    if (isFollowing) { await api(`/api/users/${userId}/follow`, 'DELETE'); btn.textContent = 'Follow'; btn.classList.remove('following-state'); }
    else { await api(`/api/users/${userId}/follow`, 'POST', {}); btn.textContent = 'Following'; btn.classList.add('following-state'); }
    AudioFX.play('click');
  } catch (err) { toast(err.message, true); }
};

// ─── Profile ──────────────────────────────────────────────────
function navigateToProfile(userId) {
  switchView('profile', userId);
}
window.navigateToProfile = navigateToProfile;

async function loadProfile(userId) {
  const wrapper = $('profile-wrapper');
  if (!wrapper) return;
  wrapper.innerHTML = `<div class="loading-state" style="padding:80px"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading profile...</div>`;
  try {
    const [profileData, posts] = await Promise.all([
      api(`/api/users/${userId}`),
      api(`/api/posts?userId=${userId}`)
    ]);
    const { profile, stats, is_following } = profileData;
    const isOwn = profile.id === currentUser?.id;
    const av = profile.avatar_url || '/uploads/default-avatar.png';
    const verifiedBadge = profile.verified ? '<i class="fa-solid fa-circle-check verified-badge" style="font-size:1.1rem"></i>' : '';
    const bannerStyle = profile.banner_url ? `background-image:url('${escHtml(profile.banner_url)}');background-size:cover;background-position:center` : '';

    wrapper.innerHTML = `
      <div class="profile-banner" style="${bannerStyle}"><div class="profile-banner-overlay"></div></div>
      <div class="profile-info-section">
        <div class="profile-avatar-row">
          <img src="${escHtml(av)}" alt="${escHtml(profile.display_name||profile.username)}" class="profile-avatar-large" onclick="openLightbox('${escHtml(av)}')">
          <div class="profile-actions">
            ${isOwn ? `<button class="btn-edit-profile" onclick="openEditProfile()"><i class="fa-solid fa-pencil"></i> Edit Profile</button>`
                    : `<button class="btn-follow ${is_following?'following':''}" id="follow-toggle-btn" onclick="toggleProfileFollow(${profile.id}, this)">${is_following?'Following':'Follow'}</button>`}
          </div>
        </div>
        <div class="profile-display-name">${escHtml(profile.display_name||profile.username)} ${verifiedBadge}</div>
        <div class="profile-handle">@${escHtml(profile.username)}</div>
        ${profile.bio ? `<div class="profile-bio">${escHtml(profile.bio)}</div>` : ''}
        <div class="profile-meta">
          ${profile.location ? `<div class="profile-meta-item"><i class="fa-solid fa-location-dot"></i> ${escHtml(profile.location)}</div>` : ''}
          ${profile.website ? `<div class="profile-meta-item"><i class="fa-solid fa-link"></i> <a href="${escHtml(profile.website)}" target="_blank" rel="noopener">${escHtml(profile.website)}</a></div>` : ''}
          <div class="profile-meta-item"><i class="fa-regular fa-calendar"></i> Joined ${new Date(profile.created_at).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div>
        </div>
        <div class="profile-stats">
          <div class="profile-stat"><strong>${stats.posts.toLocaleString()}</strong><span>Vibes</span></div>
          <div class="profile-stat"><strong id="profile-followers-count">${stats.followers.toLocaleString()}</strong><span>Followers</span></div>
          <div class="profile-stat"><strong>${stats.following.toLocaleString()}</strong><span>Following</span></div>
          <div class="profile-stat"><strong>${stats.reactions_received.toLocaleString()}</strong><span>Reactions</span></div>
        </div>
      </div>
      <div class="pulse-score-card">
        <div class="pulse-flame">⚡</div>
        <div class="pulse-info"><h4>Pulse Score</h4><p>${profile.role === 'member' ? 'Community Member' : escHtml(profile.role)}</p></div>
        <div class="pulse-big">${(profile.pulse_score||0).toLocaleString()}</div>
      </div>
      <div class="profile-tabs">
        <button class="profile-tab active">Vibes</button>
      </div>
      <div class="posts-container" id="profile-posts-container"></div>
    `;
    renderPosts($('profile-posts-container'), posts, `${escHtml(profile.display_name||profile.username)} hasn't posted yet.`);
  } catch (err) { wrapper.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-xmark"></i><h3>Profile not found</h3></div>`; }
}

window.toggleProfileFollow = async (userId, btn) => {
  const isFollowing = btn.classList.contains('following');
  try {
    if (isFollowing) { await api(`/api/users/${userId}/follow`, 'DELETE'); btn.textContent = 'Follow'; btn.classList.remove('following'); }
    else { await api(`/api/users/${userId}/follow`, 'POST', {}); btn.textContent = 'Following'; btn.classList.add('following'); }
    AudioFX.play('click');
    const fc = $('profile-followers-count');
    if (fc) fc.textContent = parseInt(fc.textContent) + (isFollowing ? -1 : 1);
    loadWhoToFollow();
  } catch (err) { toast(err.message, true); }
};

// ─── Edit Profile ─────────────────────────────────────────────
function openEditProfile() {
  $('edit-display-name').value = currentUser.display_name || '';
  $('edit-bio').value = currentUser.bio || '';
  $('edit-location').value = currentUser.location || '';
  $('edit-website').value = currentUser.website || '';
  $('edit-avatar-preview').src = currentUser.avatar_url || '/uploads/default-avatar.png';
  const editBanner = $('edit-banner-preview');
  if (editBanner && currentUser.banner_url) {
    editBanner.style.backgroundImage = `url('${currentUser.banner_url}')`;
    editBanner.style.backgroundSize = 'cover';
  }
  openModal('edit-profile-modal');
}
window.openEditProfile = openEditProfile;

// Avatar preview in edit modal
$('edit-avatar-input')?.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => { $('edit-avatar-preview').src = ev.target.result; };
  reader.readAsDataURL(f);
});
$('edit-banner-input')?.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const el = $('edit-banner-preview');
    el.style.backgroundImage = `url('${ev.target.result}')`;
    el.style.backgroundSize = 'cover';
  };
  reader.readAsDataURL(f);
});

$('edit-profile-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('display_name', $('edit-display-name').value);
  fd.append('bio', $('edit-bio').value);
  fd.append('location', $('edit-location').value);
  fd.append('website', $('edit-website').value);
  const avatarFile = $('edit-avatar-input').files[0];
  const bannerFile = $('edit-banner-input').files[0];
  if (avatarFile) fd.append('avatar', avatarFile);
  if (bannerFile) fd.append('banner', bannerFile);
  try {
    const data = await api('/api/users/me', 'PUT', fd, true);
    currentUser = { ...currentUser, ...data.user };
    localStorage.setItem('nx_user', JSON.stringify(currentUser));
    updateGlobalUI();
    closeModal('edit-profile-modal');
    AudioFX.play('success');
    toast('Profile updated! ✨');
    loadProfile(currentUser.id);
  } catch (err) { toast(err.message, true); }
});

// ─── Boot ─────────────────────────────────────────────────────
initApp();
