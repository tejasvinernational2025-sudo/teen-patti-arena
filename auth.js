
(() => {
  const AUTH_STYLE_ID = 'tpa-auth-styles';

  function addStyles() {
    if (document.getElementById(AUTH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = AUTH_STYLE_ID;
    style.textContent = `
      .tpa-auth-overlay{
        position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
        padding:20px;background:
        radial-gradient(circle at 18% 10%,rgba(221,74,186,.28),transparent 32%),
        radial-gradient(circle at 85% 22%,rgba(255,190,70,.14),transparent 30%),
        linear-gradient(160deg,#120711,#251022 52%,#0d0710);
        color:#fff;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif
      }
      .tpa-auth-overlay.hidden{display:none}
      .tpa-auth-box{
        width:min(92vw,420px);border:1px solid rgba(255,255,255,.12);
        border-radius:26px;padding:24px;background:rgba(34,15,33,.94);
        box-shadow:0 26px 70px rgba(0,0,0,.46);backdrop-filter:blur(18px)
      }
      .tpa-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}
      .tpa-auth-logo{
        width:54px;height:54px;border-radius:17px;display:grid;place-items:center;
        background:linear-gradient(145deg,#ffd47b,#df8a36);color:#281408;
        font-size:28px;box-shadow:0 10px 28px rgba(234,166,75,.25)
      }
      .tpa-auth-brand small{display:block;color:#d9a8cf;font-size:10px;font-weight:900;letter-spacing:1.5px}
      .tpa-auth-brand b{display:block;font-size:20px;letter-spacing:.4px}
      .tpa-auth-title{font-size:28px;line-height:1.05;margin:4px 0 8px}
      .tpa-auth-sub{margin:0 0 18px;color:#c6aebe;font-size:13px;line-height:1.45}
      .tpa-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#1a0d19;padding:5px;border-radius:14px;margin-bottom:16px}
      .tpa-auth-tab{border:0;border-radius:10px;padding:11px;background:transparent;color:#b99aaa;font-weight:900;cursor:pointer}
      .tpa-auth-tab.active{background:linear-gradient(180deg,#f7c96f,#d99735);color:#2a1707}
      .tpa-auth-field{display:grid;gap:6px;margin:11px 0}
      .tpa-auth-field label{font-size:11px;color:#cdb2c3;font-weight:800;letter-spacing:.6px}
      .tpa-auth-field input{
        width:100%;border:1px solid rgba(255,255,255,.12);border-radius:13px;
        padding:13px 14px;background:#160c16;color:#fff;outline:none;font-size:14px
      }
      .tpa-auth-field input:focus{border-color:#dca954;box-shadow:0 0 0 3px rgba(220,169,84,.12)}
      .tpa-auth-main{
        width:100%;margin-top:10px;border:0;border-radius:14px;padding:14px;
        background:linear-gradient(180deg,#ffd776,#df9b37);color:#281707;
        font-weight:1000;letter-spacing:.4px;cursor:pointer
      }
      .tpa-auth-main:disabled{opacity:.55;cursor:wait}
      .tpa-auth-or{
        display:flex;align-items:center;gap:10px;margin:15px 0 12px;
        color:#836d7c;font-size:9px;font-weight:900;letter-spacing:1.2px
      }
      .tpa-auth-or:before,.tpa-auth-or:after{
        content:"";height:1px;flex:1;background:rgba(255,255,255,.10)
      }
      .tpa-auth-social{
        display:grid;gap:9px
      }
      .tpa-auth-facebook,.tpa-auth-guest{
        width:100%;border-radius:14px;padding:13px 14px;
        font-weight:1000;letter-spacing:.2px;cursor:pointer;
        border:1px solid rgba(255,255,255,.12)
      }
      .tpa-auth-facebook{
        background:#1877f2;color:white;border-color:#2c86f5
      }
      .tpa-auth-facebook:hover{filter:brightness(1.06)}
      .tpa-auth-guest{
        background:rgba(255,255,255,.07);color:#ffe1a0;
        border-color:rgba(255,216,118,.24)
      }
      .tpa-auth-facebook:disabled,.tpa-auth-guest:disabled{opacity:.55;cursor:wait}
      .tpa-auth-guest-note{
        margin-top:8px;color:#8f7787;text-align:center;
        font-size:9px;line-height:1.4
      }
      .tpa-auth-user .guest-tag{
        color:#ffd176;font-size:8px;border:1px solid rgba(255,209,118,.35);
        border-radius:999px;padding:2px 5px
      }
      .tpa-auth-msg{min-height:20px;margin:10px 2px 0;font-size:12px;color:#ffb4bd}
      .tpa-auth-msg.ok{color:#8ef0b0}
      .tpa-auth-note{margin-top:14px;text-align:center;color:#8f7787;font-size:10px;line-height:1.35}
      .tpa-auth-user{
        display:flex;align-items:center;gap:8px;margin-left:4px;
        background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
        border-radius:999px;padding:7px 10px;color:#fff;font-size:11px;font-weight:900
      }
      .tpa-auth-user i{width:8px;height:8px;border-radius:50%;background:#31d181;display:block}
      .tpa-auth-user button{border:0;background:transparent;color:#ffd176;padding:0 0 0 3px;font-size:10px;font-weight:900;cursor:pointer}
      @media(max-width:420px){
        .tpa-auth-box{padding:20px}.tpa-auth-title{font-size:25px}
      }
    `;
    document.head.appendChild(style);
  }

  function addAuthUI() {
    if (document.getElementById('tpaAuthOverlay')) return;

    const wrap = document.createElement('div');
    wrap.id = 'tpaAuthOverlay';
    wrap.className = 'tpa-auth-overlay';
    wrap.innerHTML = `
      <div class="tpa-auth-box">
        <div class="tpa-auth-brand">
          <div class="tpa-auth-logo">♠</div>
          <div><small>ONLINE CARD ROOM</small><b>TEEN PATTI ARENA</b></div>
        </div>

        <h2 class="tpa-auth-title" id="tpaAuthTitle">Welcome back</h2>
        <p class="tpa-auth-sub" id="tpaAuthSub">Sign in to enter live rooms and keep your player profile.</p>

        <div class="tpa-auth-tabs">
          <button class="tpa-auth-tab active" id="tpaLoginTab">LOGIN</button>
          <button class="tpa-auth-tab" id="tpaSignupTab">SIGN UP</button>
        </div>

        <div class="tpa-auth-field hidden" id="tpaUsernameField">
          <label>PLAYER NAME</label>
          <input id="tpaUsername" maxlength="20" placeholder="e.g. Gaurav" autocomplete="nickname">
        </div>

        <div class="tpa-auth-field">
          <label>EMAIL</label>
          <input id="tpaEmail" type="email" placeholder="name@example.com" autocomplete="email">
        </div>

        <div class="tpa-auth-field">
          <label>PASSWORD</label>
          <input id="tpaPassword" type="password" minlength="6" placeholder="Minimum 6 characters" autocomplete="current-password">
        </div>

        <button class="tpa-auth-main" id="tpaAuthSubmit">LOGIN</button>

        <div class="tpa-auth-or"><span>OR CONTINUE WITH</span></div>

        <div class="tpa-auth-social">
          <button class="tpa-auth-facebook" id="tpaFacebookLogin" type="button">
            f&nbsp;&nbsp; CONTINUE WITH FACEBOOK
          </button>
          <button class="tpa-auth-guest" id="tpaGuestLogin" type="button">
            ♠&nbsp;&nbsp; PLAY AS GUEST
          </button>
        </div>

        <div class="tpa-auth-guest-note">
          Guest progress stays with this guest account on this device. Sign out or clear app/browser data and the guest account may not be recoverable.
        </div>

        <div class="tpa-auth-msg" id="tpaAuthMsg"></div>
        <div class="tpa-auth-note">Virtual chips only • No cash withdrawal</div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function el(id){ return document.getElementById(id); }
  let mode = 'login';

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    el('tpaLoginTab').classList.toggle('active', !signup);
    el('tpaSignupTab').classList.toggle('active', signup);
    el('tpaUsernameField').classList.toggle('hidden', !signup);
    el('tpaAuthSubmit').textContent = signup ? 'CREATE ACCOUNT' : 'LOGIN';
    el('tpaAuthTitle').textContent = signup ? 'Create your player' : 'Welcome back';
    el('tpaAuthSub').textContent = signup
      ? 'Create an account and receive your starter virtual-chip profile.'
      : 'Sign in to enter live rooms and keep your player profile.';
    el('tpaPassword').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    showMsg('');
  }

  function showMsg(text, ok=false) {
    const m = el('tpaAuthMsg');
    m.textContent = text || '';
    m.classList.toggle('ok', !!ok);
  }

  function showOverlay(show) {
    el('tpaAuthOverlay').classList.toggle('hidden', !show);
  }

  async function readProfile(user) {
    if (!user) return null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db
        .from('profiles')
        .select('id,username,chips,games_played,games_won')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data) return data;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  function makeGuestName(user) {
    const raw = String(user?.id || '').replace(/-/g,'').slice(-6).toUpperCase();
    return `Guest${raw || Math.floor(1000 + Math.random()*9000)}`;
  }

  function preferredUserName(user) {
    const meta = user?.user_metadata || {};
    return String(
      meta.username ||
      meta.full_name ||
      meta.name ||
      user?.email?.split('@')[0] ||
      (user?.is_anonymous ? makeGuestName(user) : 'Player')
    ).trim().slice(0,20);
  }

  async function ensureProfile(user) {
    if (!user) return null;

    let profile = await readProfile(user);
    if (profile) return profile;

    // Fallback for OAuth/anonymous users in case the normal auth-user trigger
    // has not created a profile yet.
    const username = preferredUserName(user);
    try {
      const { data, error } = await db
        .from('profiles')
        .upsert(
          { id: user.id, username },
          { onConflict: 'id' }
        )
        .select('id,username,chips,games_played,games_won')
        .maybeSingle();

      if (!error && data) return data;
    } catch (_) {}

    // Give an existing database trigger a short moment to finish.
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 250));
      profile = await readProfile(user);
      if (profile) return profile;
    }
    return null;
  }

  async function signInWithFacebook() {
    const btn = el('tpaFacebookLogin');
    if (!btn) return;

    btn.disabled = true;
    showMsg('Opening Facebook…');

    try {
      const redirectTo = window.location.href.split('#')[0].split('?')[0];
      const { error } = await db.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo }
      });
      if (error) throw error;
      // Browser will redirect to Facebook.
    } catch (err) {
      showMsg(err?.message || 'Facebook login failed.');
      btn.disabled = false;
    }
  }

  async function signInAsGuest() {
    const btn = el('tpaGuestLogin');
    if (!btn) return;

    btn.disabled = true;
    showMsg('Creating guest player…');

    try {
      const tempName = `Guest${Math.floor(1000 + Math.random()*9000)}`;
      const { data, error } = await db.auth.signInAnonymously({
        options: {
          data: {
            username: tempName,
            guest: true
          }
        }
      });
      if (error) throw error;

      showMsg('Guest login successful.', true);
      await applySession(data.session);
    } catch (err) {
      showMsg(err?.message || 'Guest login failed.');
    } finally {
      btn.disabled = false;
    }
  }

  function installUserPill(profile, user) {
    const header = document.querySelector('.header-actions');
    if (!header) return;

    let pill = document.getElementById('tpaAuthUserPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'tpaAuthUserPill';
      pill.className = 'tpa-auth-user';
      header.prepend(pill);
    }

    const name = profile?.username || preferredUserName(user);
    const guestTag = user?.is_anonymous ? '<em class="guest-tag">GUEST</em>' : '';
    pill.innerHTML = `<i></i><span>${name}</span>${guestTag}<button id="tpaLogoutBtn">LOGOUT</button>`;

    const meName = document.querySelector('#me .pname');
    const meAvatar = document.querySelector('#me .avatar');
    if (meName) meName.textContent = name;
    if (meAvatar) meAvatar.textContent = name.slice(0,2).toUpperCase();

    document.getElementById('tpaLogoutBtn').onclick = async () => {
      await db.auth.signOut();
    };
  }

  async function applySession(session) {
    if (!session?.user) {
      showOverlay(true);
      const pill = document.getElementById('tpaAuthUserPill');
      if (pill) pill.remove();
      return;
    }

    const profile = await ensureProfile(session.user);
    installUserPill(profile, session.user);
    showOverlay(false);
  }

  async function submitAuth() {
    const email = el('tpaEmail').value.trim();
    const password = el('tpaPassword').value;
    const username = el('tpaUsername').value.trim();
    const btn = el('tpaAuthSubmit');

    if (!email || !password) {
      showMsg('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      showMsg('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && username.length < 2) {
      showMsg('Enter a player name.');
      return;
    }

    btn.disabled = true;
    showMsg(mode === 'signup' ? 'Creating account…' : 'Signing in…');

    try {
      if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: { data: { username } }
        });
        if (error) throw error;

        if (data.session) {
          showMsg('Account created successfully.', true);
          await applySession(data.session);
        } else {
          showMsg('Account created. Check your email if confirmation is enabled.', true);
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showMsg('Login successful.', true);
        await applySession(data.session);
      }
    } catch (err) {
      showMsg(err?.message || 'Authentication failed.');
    } finally {
      btn.disabled = false;
    }
  }

  async function initAuth() {
    addStyles();
    addAuthUI();

    el('tpaLoginTab').onclick = () => setMode('login');
    el('tpaSignupTab').onclick = () => setMode('signup');
    el('tpaAuthSubmit').onclick = submitAuth;
    el('tpaFacebookLogin').onclick = signInWithFacebook;
    el('tpaGuestLogin').onclick = signInAsGuest;
    el('tpaPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') submitAuth();
    });

    setMode('login');

    const { data, error } = await db.auth.getSession();
    if (error) {
      showMsg('Supabase connection error: ' + error.message);
      showOverlay(true);
    } else {
      await applySession(data.session);
    }

    db.auth.onAuthStateChange(async (_event, session) => {
      await applySession(session);
    });
  }

  initAuth().catch(err => {
    console.error('Auth init failed:', err);
  });
})();
