
(() => {
  // ==========================================================
  // NECTAR™ FINAL 25-SECOND OPENING SPLASH
  // Uses the selected Nectar / Teen Patti Arena artwork.
  // Game logic remains the stable V9 build.
  // ==========================================================
  function showNectarFinalSplash() {
    if (document.getElementById('nectarFinalSplash')) return;

    const style = document.createElement('style');
    style.id = 'nectarFinalSplashStyle';
    style.textContent = `
      #nectarFinalSplash{
        position:fixed;
        inset:0;
        z-index:2147483647;
        background:#070307;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        transition:opacity .8s ease, visibility .8s ease;
      }
      #nectarFinalSplash.nectar-hide{
        opacity:0;
        visibility:hidden;
        pointer-events:none;
      }
      #nectarFinalSplash .nectar-splash-art{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
        object-position:center;
        user-select:none;
        -webkit-user-drag:none;
      }
      #nectarFinalSplash .nectar-dark-edge{
        position:absolute;
        inset:0;
        pointer-events:none;
        box-shadow:inset 0 0 80px rgba(0,0,0,.55);
      }
      #nectarFinalSplash .nectar-real-progress{
        position:absolute;
        left:12%;
        right:12%;
        bottom:2.4%;
        height:3px;
        border-radius:99px;
        overflow:hidden;
        background:rgba(255,255,255,.12);
        box-shadow:0 0 12px rgba(255,203,82,.16);
      }
      #nectarFinalSplash .nectar-real-progress span{
        display:block;
        width:0%;
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg,#9b5e10,#ffe185,#fff1ad);
        animation:nectarProgress25 25s linear forwards;
      }
      @keyframes nectarProgress25{
        from{width:0%}
        to{width:100%}
      }

      /* Keep full artwork visible on wider desktop previews. */
      @media (min-aspect-ratio: 4/5){
        #nectarFinalSplash{
          background:
            radial-gradient(circle at 50% 45%, #2a0b32 0%, #110612 55%, #040204 100%);
        }
        #nectarFinalSplash .nectar-splash-art{
          object-fit:contain;
        }
      }
    `;
    document.head.appendChild(style);

    const splash = document.createElement('div');
    splash.id = 'nectarFinalSplash';
    splash.innerHTML = `
      <img class="nectar-splash-art" src="./nectar-splash.png" alt="Nectar Teen Patti Arena">
      <div class="nectar-dark-edge"></div>
      <div class="nectar-real-progress"><span></span></div>
    `;
    document.body.appendChild(splash);

    // Fixed premium opening duration: 25 seconds.
    setTimeout(() => splash.classList.add('nectar-hide'), 25000);
    setTimeout(() => splash.remove(), 26000);
  }

  showNectarFinalSplash();

  const online = {
    roomId: null,
    roomCode: null,
    boot: 100,
    roomName: '',
    mode: 'classic',
    selectedMode: 'classic',
    subscription: null,
    user: null,
    players: [],
    currentRound: null,
    myHand: null,
    actions: [],
    arrangement321: [1,2,3,4,5,6],
    sitgoTournamentId: null,
    sitgoState: null,
    refreshTimer: null,
    timerInterval: null,
    deadlineMs: null
  };
  window.TPAOnline = online;
  window.TPAReconnect = () => reconnectExistingRoom();
  window.TPAOpenTables = (mode='classic') => openArenaTableLobby(mode);

  const $q = q => document.querySelector(q);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getUser() {
    const { data } = await db.auth.getSession();
    online.user = data?.session?.user || null;
    return online.user;
  }

  function roomMessage(text) {
    if (typeof msg === 'function') msg(text);
  }

  function showError(title, error) {
    const text = error?.message || String(error || 'Unknown error');
    if (typeof modal === 'function') modal(title, text);
    else alert(title + ': ' + text);
  }

  function modeTitle(mode) {
    return ({
      classic:'Classic',
      muflis:'Muflis',
      ak47:'AK47',
      joker:'Joker',
      '999':'999',
      hukam:'Hukam',
      '4xboot':'4X Boot',
      '6patti':'6 Patti',
      '321':'321',
      sitgo:'Sit & Go'
    })[mode] || 'Classic';
  }

  function variantText() {
    const r = online.currentRound;
    if (!r) return modeTitle(online.mode);
    if (online.mode === 'joker') {
      const label = r.variant_data?.joker_label || '?';
      return `Joker • ${label} is WILD`;
    }
    if (online.mode === 'ak47') return 'AK47 • A K 4 7 are WILD';
    if (online.mode === 'muflis') return 'Muflis • LOWEST HAND WINS';
    if (online.mode === '999') return '999 • CLOSEST TO 999 WINS';
    if (online.mode === 'hukam') return 'HUKAM • 1 JOKER EACH';
    if (online.mode === '4xboot') return `4X BOOT • BOOT ${Number(online.boot || 0).toLocaleString()}`;
    if (online.mode === '6patti') return '6 PATTI • 6 CARDS • 5X STAKES';
    if (online.mode === '321') {
      const tr = r.variant_data?.tournament_round || 1;
      return `321 • ROUND ${tr}/5 • SET 3-2-1`;
    }
    return 'Classic 3 Patti';
  }



  async function setPresence(isOnline) {
    if (!online.roomId || !online.user?.id) return;
    try {
      await db.rpc('set_room_presence', {
        p_room_id: online.roomId,
        p_is_online: !!isOnline
      });
    } catch (e) {
      console.warn('Presence update failed:', e);
    }
  }

  async function forceTimeoutIfNeeded() {
    const r = online.currentRound;
    if (!r || r.status !== 'playing' || !r.turn_deadline) return;

    const deadline = new Date(r.turn_deadline).getTime();
    if (!Number.isFinite(deadline) || Date.now() < deadline) return;

    try {
      const { error } = await db.rpc('force_timeout_pack', {
        p_round_id: r.id
      });
      if (error) {
        const m = String(error.message || '').toLowerCase();
        if (!m.includes('not expired') && !m.includes('round is not active')) {
          console.warn('Timeout pack:', error.message);
        }
      }
    } catch (e) {
      console.warn('Timeout pack failed:', e);
    }
  }

  function startTimerLoop() {
    clearInterval(online.timerInterval);
    online.timerInterval = setInterval(async () => {
      if (!online.roomId) return;
      renderTurnTimer();
      await forceTimeoutIfNeeded();
    }, 1000);
  }

  function stopTimerLoop() {
    clearInterval(online.timerInterval);
    online.timerInterval = null;
  }

  function renderTurnTimer() {
    const r = online.currentRound;
    if (!r || r.status !== 'playing' || !r.turn_deadline) return;

    const left = Math.max(0, Math.ceil((new Date(r.turn_deadline).getTime() - Date.now()) / 1000));
    const myTurn = r.current_turn === online.user?.id;
    const label = $q('#roundLabel');
    if (label) {
      const prefix = online.mode === 'joker'
        ? `JOKER ${r.variant_data?.joker_label || '?'}`
        : online.mode === 'hukam'
          ? 'HUKAM • JOKER'
          : online.mode === '999'
            ? '999'
            : online.mode === '4xboot'
              ? '4X BOOT'
              : online.mode === '6patti'
                ? '6 PATTI'
                : modeTitle(online.mode).toUpperCase();
      label.textContent = myTurn
        ? `${prefix} • YOUR TURN • ${left}s`
        : `${prefix} • ${online.players.length}/5 • ${left}s`;
    }
  }

  async function reconnectExistingRoom(requestedMode = null, requestedBoot = null) {
    const user = await getUser();
    if (!user) return false;

    // If already inside a room, only reuse it when it matches
    // the mode/stake the player is asking for.
    if (online.roomId) {
      const sameMode = !requestedMode || online.mode === requestedMode;
      const sameBoot = !requestedBoot || Number(online.boot) === Number(requestedBoot);
      if (sameMode && sameBoot) return true;
      return false;
    }

    const { data: memberships, error: membershipError } = await db
      .from('room_players')
      .select('room_id,seat_no,joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (membershipError || !memberships?.length) return false;

    const roomIds = [...new Set(memberships.map(m => m.room_id))];
    const { data: rooms, error: roomError } = await db
      .from('rooms')
      .select('id,room_code,room_name,boot_amount,status,is_private,game_mode,updated_at')
      .in('id', roomIds)
      .in('status', ['playing','waiting'])
      .order('updated_at', { ascending: false });

    if (roomError || !rooms?.length) return false;

    // IMPORTANT: reconnect only to the SAME requested mode/stake.
    // This prevents Muflis/AK47/Joker buttons from reopening an old Classic table.
    const eligible = rooms.filter(r => {
      const roomMode = r.game_mode || 'classic';
      const modeOk = !requestedMode || roomMode === requestedMode;
      const bootOk = !requestedBoot || Number(r.boot_amount) === Number(requestedBoot);
      return modeOk && bootOk;
    });

    if (!eligible.length) return false;

    // Prefer an actively playing matching room, otherwise newest matching waiting room.
    const room = eligible.find(r => r.status === 'playing') || eligible[0];
    const membership = memberships.find(m => m.room_id === room.id);
    if (!membership) return false;

    await enterOnlineRoom(room, membership.seat_no);
    roomMessage(
      room.status === 'playing'
        ? `Reconnected to ${modeTitle(room.game_mode || 'classic')} room ${room.room_code}`
        : `Reconnected to ${modeTitle(room.game_mode || 'classic')} room ${room.room_code}`
    );
    return true;
  }

  async function syncProfileWallet() {
    const user = await getUser();
    if (!user) return null;

    const { data, error } = await db
      .from('profiles')
      .select('id,username,chips,games_played,games_won,xp,level,last_spin_date')
      .eq('id', user.id)
      .single();

    if (error || !data) return null;

    if (typeof state !== 'undefined') {
      state.coins = Number(data.chips || 0);
      if (typeof updateMoney === 'function') updateMoney();
    }

    const meName = $q('#me .pname');
    const meAvatar = $q('#me .avatar');
    const meCoins = $q('#myTableCoins');
    if (meName) meName.textContent = data.username || 'Player';
    if (meAvatar) meAvatar.textContent = (data.username || 'ME').slice(0,2).toUpperCase();
    if (meCoins) meCoins.textContent = Number(data.chips || 0).toLocaleString();

    updateProgressDock(data);
    refreshSocialDock();
    refreshLaunchControl();
    return data;
  }


  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function ensureMetaStyles() {
    if ($q('#tpaMetaStyles')) return;
    const style = document.createElement('style');
    style.id = 'tpaMetaStyles';
    style.textContent = `
      .tpa-meta-dock{
        margin:14px 0 8px;
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:9px;
      }
      .tpa-meta-btn{
        border:1px solid rgba(255,220,145,.26);
        border-radius:15px;
        min-height:66px;
        padding:9px 7px;
        background:linear-gradient(145deg,rgba(95,38,108,.76),rgba(25,28,63,.88));
        color:#fff;
        box-shadow:0 10px 24px rgba(0,0,0,.22);
        font:inherit;
        cursor:pointer;
      }
      .tpa-meta-btn b{display:block;font-size:12px;letter-spacing:.04em}
      .tpa-meta-btn span{display:block;margin-top:5px;font-size:10px;opacity:.82}
      .tpa-meta-btn .tpa-meta-icon{font-size:22px;margin-bottom:3px}
      .tpa-overlay{
        position:fixed;inset:0;z-index:999999;
        display:flex;align-items:center;justify-content:center;
        padding:20px;background:rgba(5,5,15,.76);backdrop-filter:blur(9px)
      }
      .tpa-overlay.hidden{display:none}
      .tpa-overlay-card{
        width:min(430px,96vw);max-height:86vh;overflow:auto;
        border-radius:25px;padding:20px;
        background:linear-gradient(160deg,#471333,#1b1836 58%,#10172c);
        border:1px solid rgba(255,215,125,.36);
        color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.5)
      }
      .tpa-overlay-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .tpa-overlay-head h2{margin:0;font-size:22px}
      .tpa-close{
        width:34px;height:34px;border-radius:50%;border:0;
        color:#fff;background:rgba(255,255,255,.10);font-size:20px;cursor:pointer
      }
      .tpa-sub{opacity:.7;font-size:12px;margin:6px 0 15px}
      .tpa-wheel-wrap{display:flex;justify-content:center;padding:10px 0 16px;position:relative}
      .tpa-pointer{
        position:absolute;top:0;left:50%;transform:translateX(-50%);
        width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;
        border-top:22px solid #ffd36b;z-index:5
      }
      .tpa-wheel{
        width:230px;height:230px;border-radius:50%;
        border:7px solid #ffd36b;
        background:conic-gradient(
          #ef476f 0deg 45deg,#7137a5 45deg 90deg,
          #00a8a8 90deg 135deg,#d7812a 135deg 180deg,
          #8e3f7f 180deg 225deg,#237a78 225deg 270deg,
          #ba4c6f 270deg 315deg,#ad812d 315deg 360deg
        );
        position:relative;transition:transform 2.2s cubic-bezier(.18,.72,.13,1);
        box-shadow:0 0 0 6px rgba(255,211,107,.11),0 20px 50px rgba(0,0,0,.4)
      }
      .tpa-wheel:after{
        content:'♠';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:#ffe1a0;color:#4d1739;font-size:29px;font-weight:900;
        box-shadow:0 5px 18px rgba(0,0,0,.35)
      }
      .tpa-spin-result{text-align:center;font-weight:800;font-size:20px;min-height:30px}
      .tpa-primary-action{
        width:100%;border:0;border-radius:14px;padding:14px;
        background:linear-gradient(#ffd879,#ffad14);color:#3d2600;
        font-weight:900;font-size:15px;cursor:pointer
      }
      .tpa-primary-action:disabled{opacity:.5;cursor:not-allowed}
      .tpa-level-hero{text-align:center;padding:9px 0 12px}
      .tpa-level-badge{
        margin:auto;width:88px;height:88px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        border:5px solid #ffd36b;background:#3f2458;
        font-size:28px;font-weight:900;box-shadow:0 13px 35px rgba(0,0,0,.35)
      }
      .tpa-progress{height:11px;background:rgba(255,255,255,.10);border-radius:999px;overflow:hidden;margin:10px 0 7px}
      .tpa-progress>i{display:block;height:100%;background:linear-gradient(90deg,#f9b83b,#fff09e);border-radius:inherit}
      .tpa-stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:14px}
      .tpa-stat{
        background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.07);
        border-radius:14px;padding:12px;text-align:center
      }
      .tpa-stat b{display:block;font-size:18px}
      .tpa-stat span{font-size:10px;opacity:.7}
      .tpa-lb-row{
        display:grid;grid-template-columns:37px 1fr auto;gap:9px;align-items:center;
        padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.08)
      }
      .tpa-lb-row.me{background:rgba(255,211,107,.09);border-radius:12px}
      .tpa-lb-rank{font-weight:900;color:#ffd36b;text-align:center}
      .tpa-lb-name b{display:block;font-size:13px}.tpa-lb-name span{font-size:10px;opacity:.66}
      .tpa-lb-xp{text-align:right;font-size:11px}.tpa-lb-xp b{display:block;font-size:13px;color:#ffe298}
      .tpa-feature-card{border:1px solid rgba(255,218,130,.18);border-radius:17px;padding:14px;margin:10px 0;background:rgba(255,255,255,.055)}
      .tpa-feature-card h3{margin:0 0 5px;font-size:15px}
      .tpa-feature-line{display:flex;justify-content:space-between;gap:10px;font-size:11px;opacity:.78;margin-top:7px}
      .tpa-feature-actions{display:flex;gap:8px;margin-top:12px}
      .tpa-small-action{flex:1;border:0;border-radius:11px;padding:10px 8px;font-weight:900;font-size:11px;background:linear-gradient(#ffd879,#ffad14);color:#3d2600;cursor:pointer}
      .tpa-small-action.alt{background:rgba(255,255,255,.11);color:#fff;border:1px solid rgba(255,255,255,.10)}
      .tpa-small-action:disabled{opacity:.45;cursor:not-allowed}
      .tpa-challenge{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)}
      .tpa-challenge-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .tpa-challenge h4{margin:0 0 4px;font-size:13px}.tpa-challenge small{opacity:.64}
      .tpa-mini-progress{height:8px;background:rgba(255,255,255,.10);border-radius:99px;overflow:hidden;margin:8px 0}
      .tpa-mini-progress i{display:block;height:100%;background:linear-gradient(90deg,#ffd36b,#ff9e4b);border-radius:inherit}
      .tpa-reward{font-size:10px;color:#ffe29b;font-weight:800;white-space:nowrap}
      .tpa-badge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
      .tpa-badge{min-height:115px;border-radius:16px;padding:12px;text-align:center;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}
      .tpa-badge.locked{filter:grayscale(1);opacity:.48}.tpa-badge-icon{font-size:31px}.tpa-badge b{display:block;font-size:12px;margin:5px 0}.tpa-badge span{font-size:9px;opacity:.68}
      .tpa-stage{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
      .tpa-stage div{padding:8px 4px;border-radius:10px;text-align:center;background:rgba(255,255,255,.06);font-size:9px}
      .tpa-stage div.active{background:rgba(255,211,107,.16);border:1px solid rgba(255,211,107,.28);color:#ffe297}
      .tpa-social-row{
        display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;
        padding:11px 5px;border-bottom:1px solid rgba(255,255,255,.08)
      }
      .tpa-social-avatar{
        width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:linear-gradient(145deg,#ffb02e,#74387f);font-weight:900
      }
      .tpa-social-main b{display:block;font-size:13px}.tpa-social-main span{font-size:10px;opacity:.66}
      .tpa-action-stack{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
      .tpa-tiny{
        border:0;border-radius:9px;padding:7px 9px;font-size:9px;font-weight:900;cursor:pointer;
        background:#ffd36b;color:#3c2600
      }
      .tpa-tiny.alt{background:rgba(255,255,255,.10);color:#fff}
      .tpa-notice{
        border-radius:14px;padding:12px;margin:9px 0;background:rgba(255,255,255,.055);
        border:1px solid rgba(255,255,255,.08)
      }
      .tpa-notice.unread{border-color:rgba(255,211,107,.35);background:rgba(255,211,107,.07)}
      .tpa-notice b{font-size:12px}.tpa-notice p{font-size:10px;opacity:.72;margin:5px 0 8px;line-height:1.45}
      .tpa-club-code{
        font-size:25px;letter-spacing:.14em;font-weight:900;text-align:center;color:#ffe198;
        padding:10px;border:1px dashed rgba(255,225,152,.34);border-radius:14px;margin:10px 0
      }
      .tpa-vip{
        text-align:center;border-radius:18px;padding:15px;margin:10px 0;
        background:linear-gradient(145deg,rgba(255,186,47,.13),rgba(120,56,130,.18));
        border:1px solid rgba(255,213,107,.22)
      }
      .tpa-vip-icon{font-size:38px}.tpa-vip h3{margin:4px 0}.tpa-vip small{opacity:.68}
      .tpa-event-hero{
        text-align:center;padding:14px;border-radius:18px;
        background:linear-gradient(150deg,rgba(244,84,122,.16),rgba(55,177,190,.12));
        border:1px solid rgba(255,255,255,.08)
      }
      .tpa-event-hero .icon{font-size:44px}.tpa-event-hero h3{margin:7px 0 4px}
      .tpa-access-block{
        position:fixed;inset:0;z-index:999999;background:rgba(10,5,18,.96);
        display:flex;align-items:center;justify-content:center;padding:22px
      }
      .tpa-access-card{
        width:min(420px,94vw);border-radius:22px;padding:25px;text-align:center;
        background:linear-gradient(145deg,#29122e,#151226);
        border:1px solid rgba(255,211,107,.25);box-shadow:0 28px 80px rgba(0,0,0,.55)
      }
      .tpa-access-card .icon{font-size:48px}.tpa-access-card h2{margin:10px 0 7px}.tpa-access-card p{font-size:12px;opacity:.76;line-height:1.55}
      .tpa-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}
      .tpa-admin-card{
        border-radius:15px;padding:12px;background:rgba(255,255,255,.055);
        border:1px solid rgba(255,255,255,.08)
      }
      .tpa-admin-card b{display:block;font-size:18px}.tpa-admin-card span{font-size:9px;opacity:.64}
      .tpa-admin-toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0 14px}
      .tpa-admin-log{
        padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:10px;line-height:1.4
      }
      .tpa-admin-log b{font-size:11px}.tpa-admin-log small{opacity:.56}
      .tpa-maintenance-tag{
        display:inline-block;border-radius:99px;padding:4px 9px;font-size:9px;font-weight:900;
        background:rgba(255,107,107,.15);color:#ffb0b0;border:1px solid rgba(255,107,107,.24)
      }
      @media(max-width:420px){
        .tpa-meta-dock{gap:6px}.tpa-meta-btn{padding:7px 4px;min-height:62px}
        .tpa-wheel{width:210px;height:210px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMetaOverlay() {
    let overlay = $q('#tpaMetaOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'tpaMetaOverlay';
    overlay.className = 'tpa-overlay hidden';
    overlay.innerHTML = `
      <div class="tpa-overlay-card">
        <div class="tpa-overlay-head">
          <h2 id="tpaMetaTitle">Teen Patti Arena</h2>
          <button class="tpa-close" id="tpaMetaClose">×</button>
        </div>
        <div id="tpaMetaBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.classList.add('hidden');
    overlay.querySelector('#tpaMetaClose').onclick = close;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
    return overlay;
  }

  function showMeta(title, html) {
    ensureMetaStyles();
    const overlay = ensureMetaOverlay();
    overlay.querySelector('#tpaMetaTitle').textContent = title;
    overlay.querySelector('#tpaMetaBody').innerHTML = html;
    overlay.classList.remove('hidden');
    return overlay;
  }

  function ensureMetaDock() {
    ensureMetaStyles();
    let dock = $q('#tpaMetaDock');
    if (dock) return dock;

    const home = $q('#homeScreen');
    if (!home) return null;

    dock = document.createElement('div');
    dock.id = 'tpaMetaDock';
    dock.className = 'tpa-meta-dock';
    dock.innerHTML = `
      <button class="tpa-meta-btn" id="spinWheelBtn">
        <div class="tpa-meta-icon">🎡</div><b>DAILY SPIN</b><span id="spinDockText">Spin & win chips</span>
      </button>
      <button class="tpa-meta-btn" id="levelBtn">
        <div class="tpa-meta-icon">⭐</div><b id="levelDockTitle">LEVEL 1</b><span id="levelDockText">0 XP</span>
      </button>
      <button class="tpa-meta-btn" id="leaderboardBtn">
        <div class="tpa-meta-icon">🏆</div><b>LEADERBOARD</b><span>Top players</span>
      </button>
      <button class="tpa-meta-btn" id="sitgoBtn">
        <div class="tpa-meta-icon">🎟️</div><b>SIT & GO</b><span>5-player tournament</span>
      </button>
      <button class="tpa-meta-btn" id="challengesBtn">
        <div class="tpa-meta-icon">🎯</div><b>CHALLENGES</b><span>Daily & weekly</span>
      </button>
      <button class="tpa-meta-btn" id="achievementsBtn">
        <div class="tpa-meta-icon">🏅</div><b>BADGES</b><span>Achievements</span>
      </button>
      <button class="tpa-meta-btn" id="friendsBtn">
        <div class="tpa-meta-icon">👥</div><b>FRIENDS</b><span id="friendsDockText">Add & invite</span>
      </button>
      <button class="tpa-meta-btn" id="clubBtn">
        <div class="tpa-meta-icon">🛡️</div><b>CLUB / VIP</b><span id="clubDockText">Club & daily bonus</span>
      </button>
      <button class="tpa-meta-btn" id="eventsBtn">
        <div class="tpa-meta-icon">⚡</div><b>EVENTS</b><span id="eventsDockText">Daily event</span>
      </button>
      <button class="tpa-meta-btn" id="inboxBtn">
        <div class="tpa-meta-icon">🔔</div><b>INBOX</b><span id="inboxDockText">No new alerts</span>
      </button>
      <button class="tpa-meta-btn" id="adminBtn" style="display:none">
        <div class="tpa-meta-icon">🛡️</div><b>ADMIN</b><span id="adminDockText">Launch control</span>
      </button>
    `;

    const modeWrap = $q('.mode-pills');
    if (modeWrap?.parentElement) {
      modeWrap.parentElement.insertAdjacentElement('afterend', dock);
    } else {
      home.appendChild(dock);
    }

    return dock;
  }

  function updateProgressDock(profile) {
    ensureMetaDock();
    if (!profile) return;

    const lvl = Math.max(1, Number(profile.level || 1));
    const xp = Math.max(0, Number(profile.xp || 0));
    const lvlTitle = $q('#levelDockTitle');
    const lvlText = $q('#levelDockText');
    const spinText = $q('#spinDockText');

    if (lvlTitle) lvlTitle.textContent = `LEVEL ${lvl}`;
    if (lvlText) lvlText.textContent = `${xp.toLocaleString()} XP`;

    if (spinText) {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit'
      }).format(new Date());
      spinText.textContent = profile.last_spin_date === today
        ? 'Come back tomorrow'
        : 'Spin available';
    }
  }

  async function openLevelCard() {
    const { data, error } = await db.rpc('get_player_progress');
    if (error) return showError('Progress error', error);

    const p = Array.isArray(data) ? data[0] : data;
    if (!p) return showError('Progress error', 'No profile found.');

    const level = Number(p.level || 1);
    const xp = Number(p.xp || 0);
    const start = Math.pow(Math.max(0, level - 1), 2) * 100;
    const next = Math.pow(level, 2) * 100;
    const pct = next > start
      ? Math.max(0, Math.min(100, ((xp - start) / (next - start)) * 100))
      : 100;

    showMeta('Your Level', `
      <div class="tpa-level-hero">
        <div class="tpa-level-badge">${level}</div>
        <h3>${esc(p.username || 'Player')}</h3>
        <div class="tpa-sub">Rank #${Number(p.position_no || 1).toLocaleString()} • ${xp.toLocaleString()} XP</div>
        <div class="tpa-progress"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="tpa-sub">${Math.max(0,next-xp).toLocaleString()} XP to Level ${level+1}</div>
      </div>
      <div class="tpa-stat-grid">
        <div class="tpa-stat"><b>${Number(p.games_played || 0).toLocaleString()}</b><span>GAMES</span></div>
        <div class="tpa-stat"><b>${Number(p.games_won || 0).toLocaleString()}</b><span>WINS</span></div>
        <div class="tpa-stat"><b>${Number(p.chips || 0).toLocaleString()}</b><span>VIRTUAL CHIPS</span></div>
        <div class="tpa-stat"><b>${Number(p.win_rate || 0).toFixed(1)}%</b><span>WIN RATE</span></div>
      </div>
      <div class="tpa-sub" style="text-align:center;margin-top:14px">
        +10 XP per completed game • +25 bonus XP per win
      </div>
    `);
  }

  async function openLeaderboard() {
    const overlay = showMeta('Leaderboard', `<div class="tpa-sub">Loading top players…</div>`);
    const { data, error } = await db.rpc('get_leaderboard', { p_limit: 25 });
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML =
        `<div class="tpa-sub">Could not load leaderboard: ${esc(error.message)}</div>`;
      return;
    }

    const rows = data || [];
    const me = online.user?.id;
    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-sub">Ranked by XP, wins, then virtual chips.</div>
      <div>
        ${rows.map(r => `
          <div class="tpa-lb-row ${r.user_id === me ? 'me' : ''}">
            <div class="tpa-lb-rank">${Number(r.position_no)}</div>
            <div class="tpa-lb-name">
              <b>${esc(r.username || 'Player')}</b>
              <span>Level ${Number(r.level || 1)} • ${Number(r.games_won || 0)} wins</span>
            </div>
            <div class="tpa-lb-xp">
              <b>${Number(r.xp || 0).toLocaleString()} XP</b>
              <span>${Number(r.chips || 0).toLocaleString()} chips</span>
            </div>
          </div>
        `).join('') || '<div class="tpa-sub">No ranked players yet.</div>'}
      </div>
    `;
  }

  function rewardLabel(reward) {
    return `+${Number(reward || 0).toLocaleString()} CHIPS`;
  }

  async function spinDailyWheel() {
    const btn = $q('#spinWheelBtn');
    if (btn) btn.disabled = true;

    const overlay = showMeta('Daily Spin', `
      <div class="tpa-sub" style="text-align:center">One free spin every day • Virtual chips only</div>
      <div class="tpa-wheel-wrap">
        <div class="tpa-pointer"></div>
        <div class="tpa-wheel" id="tpaWheel"></div>
      </div>
      <div class="tpa-spin-result" id="tpaSpinResult">Good luck!</div>
      <button class="tpa-primary-action" id="tpaSpinAction" disabled>SPINNING…</button>
    `);

    const { data, error } = await db.rpc('spin_daily_wheel');
    if (error) {
      const body = overlay.querySelector('#tpaMetaBody');
      const msgText = String(error.message || '');
      body.innerHTML = `
        <div style="text-align:center;padding:25px 8px">
          <div style="font-size:46px">⏳</div>
          <h3>${msgText.toLowerCase().includes('already spun')
            ? 'Today’s spin is already used'
            : 'Spin unavailable'}</h3>
          <div class="tpa-sub">${esc(msgText)}</div>
          <button class="tpa-primary-action" id="tpaSpinClose">OK</button>
        </div>
      `;
      body.querySelector('#tpaSpinClose').onclick =
        () => overlay.classList.add('hidden');
      if (btn) btn.disabled = false;
      await syncProfileWallet();
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const reward = Number(result?.reward || 0);
    const segment = Math.max(0, Math.min(7, Number(result?.segment || 0)));
    const wheel = overlay.querySelector('#tpaWheel');
    const resultEl = overlay.querySelector('#tpaSpinResult');
    const action = overlay.querySelector('#tpaSpinAction');

    requestAnimationFrame(() => {
      const stopAngle = 360 - (segment * 45 + 22.5);
      wheel.style.transform = `rotate(${1440 + stopAngle}deg)`;
    });

    await sleep(2350);
    resultEl.innerHTML = `🎉 ${rewardLabel(reward)}<br><small style="font-size:11px;opacity:.68">+${Number(result?.xp_bonus || 0)} XP bonus</small>`;
    action.disabled = false;
    action.textContent = 'COLLECT';
    action.onclick = () => overlay.classList.add('hidden');

    await syncProfileWallet();
    if (btn) btn.disabled = false;
  }


  function formatTournamentStatus(status) {
    return ({open:'OPEN',running:'RUNNING',completed:'COMPLETED'})[status] || String(status || '').toUpperCase();
  }

  function sitgoStageLabel(state) {
    const r = Number(state?.rounds_completed || 0);
    if (state?.status === 'completed') return 'FINISHED';
    if (r < 2) return 'STAGE 1 • 5 PLAYERS';
    if (r < 4) return 'STAGE 2 • TOP 3';
    return 'FINAL • TOP 2';
  }

  async function openSitGoLobby() {
    const overlay = showMeta('Sit & Go Tournament', `<div class="tpa-sub">Loading tournament lobby…</div>`);
    const { data, error } = await db.rpc('get_sitgo_lobby');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }
    const payload = data || {};
    const tournaments = payload.tournaments || [];
    const board = payload.leaderboard || [];
    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-sub">5 players • 500 virtual-chip entry • 5 rounds • 2 elimination cuts</div>
      ${tournaments.map(t => {
        const joined = !!t.joined;
        const canJoin = t.status === 'open' && !joined && Number(t.entries_count || 0) < Number(t.max_players || 5);
        const canEnter = joined && t.status === 'running' && !['eliminated','completed'].includes(t.user_status);
        return `
          <div class="tpa-feature-card">
            <div class="tpa-feature-line"><b>${esc(t.name || 'Sit & Go')}</b><b>${formatTournamentStatus(t.status)}</b></div>
            <div class="tpa-stage">
              <div class="${Number(t.rounds_completed||0)<2?'active':''}">R1–2<br>5 players</div>
              <div class="${Number(t.rounds_completed||0)>=2 && Number(t.rounds_completed||0)<4?'active':''}">R3–4<br>Top 3</div>
              <div class="${Number(t.rounds_completed||0)>=4 && t.status!=='completed'?'active':''}">R5<br>Top 2</div>
            </div>
            <div class="tpa-feature-line"><span>Players</span><b>${Number(t.entries_count||0)}/${Number(t.max_players||5)}</b></div>
            <div class="tpa-feature-line"><span>Entry</span><b>${Number(t.entry_fee||500).toLocaleString()} chips</b></div>
            <div class="tpa-feature-line"><span>Prize pool</span><b>${Number(t.prize_pool||2500).toLocaleString()} chips</b></div>
            <div class="tpa-feature-line"><span>Stage</span><b>${sitgoStageLabel(t)}</b></div>
            ${joined ? `<div class="tpa-feature-line"><span>Your status</span><b>${esc(t.user_status || 'registered').toUpperCase()} • ${Number(t.user_points||0)} pts</b></div>` : ''}
            <div class="tpa-feature-actions">
              ${canJoin ? `<button class="tpa-small-action" data-sitgo-join="${t.id}">JOIN • ${Number(t.entry_fee||500).toLocaleString()}</button>` : ''}
              ${joined && t.status === 'open' ? `<button class="tpa-small-action alt" disabled>WAITING FOR ${Math.max(0,Number(t.max_players||5)-Number(t.entries_count||0))}</button>` : ''}
              ${canEnter ? `<button class="tpa-small-action" data-sitgo-enter="${t.id}">ENTER TABLE</button>` : ''}
              ${joined && t.user_status === 'eliminated' ? `<button class="tpa-small-action alt" disabled>ELIMINATED • #${Number(t.finish_position||0)||'—'}</button>` : ''}
              ${joined && t.status === 'completed' ? `<button class="tpa-small-action alt" disabled>FINISH #${Number(t.finish_position||0)||'—'}</button>` : ''}
            </div>
          </div>`;
      }).join('') || '<div class="tpa-sub">No Sit & Go available.</div>'}
      <h3 style="margin:18px 0 6px">Tournament Leaders</h3>
      <div class="tpa-sub">Championship wins, podiums and tournament points.</div>
      ${board.slice(0,10).map((r,i) => `
        <div class="tpa-lb-row ${r.user_id === online.user?.id ? 'me' : ''}">
          <div class="tpa-lb-rank">${i+1}</div>
          <div class="tpa-lb-name"><b>${esc(r.username || 'Player')}</b><span>${Number(r.tournaments||0)} tournaments • ${Number(r.podiums||0)} podiums</span></div>
          <div class="tpa-lb-xp"><b>${Number(r.championships||0)} 🏆</b><span>${Number(r.points||0)} pts</span></div>
        </div>`).join('') || '<div class="tpa-sub">No tournament results yet.</div>'}
    `;
    overlay.querySelectorAll('[data-sitgo-join]').forEach(btn => btn.onclick = () => joinSitGo(btn.dataset.sitgoJoin));
    overlay.querySelectorAll('[data-sitgo-enter]').forEach(btn => btn.onclick = () => enterSitGoTable(btn.dataset.sitgoEnter));
  }

  async function joinSitGo(tournamentId) {
    const { data, error } = await db.rpc('join_sitgo', { p_tournament_id: tournamentId });
    if (error) return showError('Sit & Go join failed', error);
    await syncProfileWallet();
    const d = data || {};
    modal(d.status === 'running' ? 'Tournament started' : 'Tournament joined',
      d.status === 'running' ? '5/5 players joined. Enter the tournament table now.' : `${Number(d.entries_count||0)}/5 players joined. Waiting for more players.`);
    await openSitGoLobby();
  }

  async function getSitGoState(tournamentId = online.sitgoTournamentId) {
    if (!tournamentId) return null;
    const { data, error } = await db.rpc('get_sitgo_state', { p_tournament_id: tournamentId });
    if (error) { console.warn('Sit & Go state:', error.message); return null; }
    online.sitgoState = data || null;
    return online.sitgoState;
  }

  async function joinRoomId(roomId) {
    const user = await getUser();
    if (!user) return showError('Login required', 'Please login first.');
    const { data: room, error: roomError } = await db.from('rooms')
      .select('id,room_code,room_name,boot_amount,status,is_private,game_mode').eq('id', roomId).single();
    if (roomError) return showError('Tournament room error', roomError);
    const { data: membership } = await db.from('room_players').select('seat_no')
      .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
    let seatNo = membership?.seat_no;
    if (!seatNo) {
      const { data, error } = await db.rpc('join_public_room', { p_room_id: roomId });
      if (error) return showError('Tournament table join failed', error);
      seatNo = data;
    }
    await enterOnlineRoom(room, seatNo);
  }

  async function createSitGoCandidateRoom(tournamentId) {
    const roomName = `Sit & Go ${String(tournamentId).slice(0,8).toUpperCase()}`;
    const { data, error } = await db.rpc('create_game_room', {
      p_room_name: roomName, p_boot_amount: 100, p_is_private: false, p_game_mode: 'sitgo'
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function enterSitGoTable(tournamentId) {
    const state = await getSitGoState(tournamentId);
    if (!state) return;
    if (state.status !== 'running') return modal('Tournament not started', 'The table opens when all 5 players join.');
    if (state.user_status === 'eliminated') return modal('Eliminated', `You finished #${state.finish_position || '—'}.`);
    online.sitgoTournamentId = tournamentId;
    if (state.room_id) return joinRoomId(state.room_id);

    let candidate;
    try { candidate = await createSitGoCandidateRoom(tournamentId); }
    catch (e) { return showError('Tournament room create failed', e); }

    const { data: claimed, error: claimError } = await db.rpc('claim_sitgo_room', {
      p_tournament_id: tournamentId, p_room_id: candidate.room_id
    });
    if (claimError) return showError('Tournament room link failed', claimError);
    const official = claimed?.room_id || candidate.room_id;
    if (official !== candidate.room_id) {
      try { await db.rpc('leave_game_room', { p_room_id: candidate.room_id }); } catch (_) {}
    }
    await joinRoomId(official);
  }

  async function refreshSitGoState() {
    if (online.mode !== 'sitgo' || !online.sitgoTournamentId) return;
    await getSitGoState(online.sitgoTournamentId);
  }

  async function openChallenges() {
    const overlay = showMeta('Challenges', `<div class="tpa-sub">Loading daily & weekly challenges…</div>`);
    const { data, error } = await db.rpc('get_challenges');
    if (error) { overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`; return; }
    const payload = data || {};
    const renderGroup = (title, rows) => `
      <h3 style="margin:15px 0 4px">${title}</h3>
      ${rows.map(c => {
        const progress=Number(c.progress||0), target=Number(c.target||1);
        const pct=Math.max(0,Math.min(100,(progress/target)*100));
        const complete=progress>=target;
        return `<div class="tpa-challenge">
          <div class="tpa-challenge-top"><div><h4>${esc(c.title)}</h4><small>${Math.min(progress,target)}/${target} • ${esc(c.description||'')}</small></div>
          <div class="tpa-reward">+${Number(c.reward_chips||0).toLocaleString()} chips<br>+${Number(c.reward_xp||0)} XP</div></div>
          <div class="tpa-mini-progress"><i style="width:${pct}%"></i></div>
          ${c.claimed ? `<button class="tpa-small-action alt" disabled>CLAIMED ✓</button>` : complete ? `<button class="tpa-small-action" data-challenge-claim="${esc(c.challenge_key)}">CLAIM REWARD</button>` : `<button class="tpa-small-action alt" disabled>IN PROGRESS</button>`}
        </div>`;
      }).join('')}`;
    overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">Progress updates automatically from games, wins, special modes and Daily Spin.</div>${renderGroup('Daily',payload.daily||[])}${renderGroup('Weekly',payload.weekly||[])}`;
    overlay.querySelectorAll('[data-challenge-claim]').forEach(btn => {
      btn.onclick = async () => {
        const { data: result, error: claimError } = await db.rpc('claim_challenge', { p_challenge_key: btn.dataset.challengeClaim });
        if (claimError) return showError('Challenge claim failed', claimError);
        await syncProfileWallet();
        modal('Challenge complete', `+${Number(result?.reward_chips||0).toLocaleString()} chips • +${Number(result?.reward_xp||0)} XP`);
        await openChallenges();
      };
    });
  }

  async function openAchievements() {
    const overlay = showMeta('Achievements & Badges', `<div class="tpa-sub">Checking your achievements…</div>`);
    const { data, error } = await db.rpc('get_achievements');
    if (error) { overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`; return; }
    const rows = data || [];
    await syncProfileWallet();
    overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">Unlocked badges stay permanently on your profile. New unlocks award virtual chips + XP automatically.</div><div class="tpa-badge-grid">${rows.map(a => `<div class="tpa-badge ${a.unlocked?'':'locked'}"><div class="tpa-badge-icon">${esc(a.icon||'🏅')}</div><b>${esc(a.title)}</b><span>${esc(a.description||'')}</span><br><span style="color:#ffe298">${a.unlocked?'UNLOCKED ✓':`Reward ${Number(a.reward_chips||0).toLocaleString()} chips + ${Number(a.reward_xp||0)} XP`}</span></div>`).join('')}</div>`;
  }

  async function refreshSocialDock() {
    try {
      const { data, error } = await db.rpc('get_social_summary');
      if (error || !data) return;

      const friendsText = $q('#friendsDockText');
      const clubText = $q('#clubDockText');
      const eventsText = $q('#eventsDockText');
      const inboxText = $q('#inboxDockText');

      if (friendsText) {
        const incoming = Number(data.incoming_requests || 0);
        friendsText.textContent = incoming
          ? `${incoming} request${incoming === 1 ? '' : 's'} waiting`
          : `${Number(data.friends_count || 0)} friends`;
      }

      if (clubText) {
        clubText.textContent = data.club_name
          ? `${data.club_name} • ${data.vip_tier || 'Bronze'}`
          : `${data.vip_tier || 'Bronze'} VIP`;
      }

      if (eventsText && data.event) {
        const e = data.event;
        eventsText.textContent = `${e.title || 'Daily Event'} • ${Number(e.progress || 0)}/${Number(e.target || 1)}`;
      }

      if (inboxText) {
        const n = Number(data.unread_notifications || 0);
        inboxText.textContent = n ? `${n} new alert${n === 1 ? '' : 's'}` : 'No new alerts';
      }
    } catch (_) {}
  }

  async function openFriends() {
    const overlay = showMeta('Friends', `<div class="tpa-sub">Loading your friends…</div>`);
    const { data, error } = await db.rpc('get_friends_hub');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }

    const payload = data || {};
    const friends = payload.friends || [];
    const incoming = payload.incoming || [];
    const outgoing = payload.outgoing || [];

    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-feature-actions">
        <button class="tpa-small-action" id="tpaAddFriend">+ ADD FRIEND</button>
        <button class="tpa-small-action alt" id="tpaRefreshFriends">REFRESH</button>
      </div>

      ${incoming.length ? `<h3 style="margin:18px 0 5px">Friend Requests</h3>` : ''}
      ${incoming.map(r => `
        <div class="tpa-social-row">
          <div class="tpa-social-avatar">${esc((r.username || 'P').slice(0,2).toUpperCase())}</div>
          <div class="tpa-social-main"><b>${esc(r.username || 'Player')}</b><span>Wants to be your friend</span></div>
          <div class="tpa-action-stack">
            <button class="tpa-tiny" data-friend-accept="${r.user_id}">ACCEPT</button>
            <button class="tpa-tiny alt" data-friend-reject="${r.user_id}">NO</button>
          </div>
        </div>
      `).join('')}

      <h3 style="margin:18px 0 5px">Friends (${friends.length})</h3>
      ${friends.map(f => `
        <div class="tpa-social-row">
          <div class="tpa-social-avatar">${esc((f.username || 'P').slice(0,2).toUpperCase())}</div>
          <div class="tpa-social-main">
            <b>${esc(f.username || 'Player')}</b>
            <span>Level ${Number(f.level || 1)} • ${Number(f.xp || 0).toLocaleString()} XP</span>
          </div>
          <div class="tpa-action-stack">
            <button class="tpa-tiny" data-table-invite="${f.user_id}">INVITE</button>
            <button class="tpa-tiny alt" data-player-report="${f.user_id}" data-player-name="${esc(f.username || 'Player')}">REPORT</button>
          </div>
        </div>
      `).join('') || '<div class="tpa-sub">No friends yet. Add one by username.</div>'}

      ${outgoing.length ? `
        <h3 style="margin:18px 0 5px">Sent Requests</h3>
        ${outgoing.map(r => `
          <div class="tpa-social-row">
            <div class="tpa-social-avatar">${esc((r.username || 'P').slice(0,2).toUpperCase())}</div>
            <div class="tpa-social-main"><b>${esc(r.username || 'Player')}</b><span>Request pending</span></div>
            <div></div>
          </div>
        `).join('')}
      ` : ''}
    `;

    overlay.querySelector('#tpaAddFriend').onclick = async () => {
      const username = prompt('ADD FRIEND\n\nEnter exact username:');
      if (!username) return;
      const { data: result, error: sendError } = await db.rpc('send_friend_request', { p_username: username.trim() });
      if (sendError) return showError('Friend request failed', sendError);
      modal('Friend request sent', `Request sent to ${result?.username || username}.`);
      await refreshSocialDock();
      await openFriends();
    };

    overlay.querySelector('#tpaRefreshFriends').onclick = openFriends;

    overlay.querySelectorAll('[data-friend-accept]').forEach(btn => {
      btn.onclick = async () => {
        const { error: acceptError } = await db.rpc('respond_friend_request', {
          p_user_id: btn.dataset.friendAccept,
          p_accept: true
        });
        if (acceptError) return showError('Accept failed', acceptError);
        await refreshSocialDock();
        await openFriends();
      };
    });

    overlay.querySelectorAll('[data-friend-reject]').forEach(btn => {
      btn.onclick = async () => {
        const { error: rejectError } = await db.rpc('respond_friend_request', {
          p_user_id: btn.dataset.friendReject,
          p_accept: false
        });
        if (rejectError) return showError('Request failed', rejectError);
        await refreshSocialDock();
        await openFriends();
      };
    });

    overlay.querySelectorAll('[data-table-invite]').forEach(btn => {
      btn.onclick = async () => {
        const code = prompt('TABLE INVITE\n\nEnter the 6-character PRIVATE TABLE room code:');
        if (!code) return;
        const { data: result, error: inviteError } = await db.rpc('send_friend_table_invite', {
          p_friend_id: btn.dataset.tableInvite,
          p_room_code: code.trim().toUpperCase()
        });
        if (inviteError) return showError('Invite failed', inviteError);
        modal('Invite sent', `Private table ${result?.room_code || code.toUpperCase()} sent to your friend.`);
      };
    });

    overlay.querySelectorAll('[data-player-report]').forEach(btn => {
      btn.onclick = async () => {
        const category = prompt(
          `REPORT ${btn.dataset.playerName || 'PLAYER'}\n\nType one category:\nABUSE\nCHEATING\nSPAM\nOTHER`
        );
        if (!category) return;
        const details = prompt('Briefly describe the problem (optional):') || '';
        const { data: result, error: reportError } = await db.rpc('submit_player_report', {
          p_reported_user: btn.dataset.playerReport,
          p_category: category.trim().toLowerCase(),
          p_details: details.trim()
        });
        if (reportError) return showError('Report failed', reportError);
        modal('Report submitted', `Report #${result?.report_id || ''} has been sent for review.`);
      };
    });
  }

  async function openClubVip() {
    const overlay = showMeta('Club & VIP', `<div class="tpa-sub">Loading Club and VIP status…</div>`);
    const { data, error } = await db.rpc('get_club_vip_hub');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }

    const hub = data || {};
    const vip = hub.vip || {};
    const club = hub.club;
    const leaderboard = hub.leaderboard || [];

    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-vip">
        <div class="tpa-vip-icon">${vip.icon || '🥉'}</div>
        <h3>${esc(vip.tier || 'Bronze')} VIP</h3>
        <small>Based on your level • Daily virtual-chip loyalty bonus</small>
        <div class="tpa-feature-line"><span>Your level</span><b>${Number(vip.level || 1)}</b></div>
        <div class="tpa-feature-line"><span>Daily VIP bonus</span><b>${Number(vip.daily_bonus || 0).toLocaleString()} chips</b></div>
        <div class="tpa-feature-actions">
          <button class="tpa-small-action" id="tpaVipClaim" ${vip.claimed_today ? 'disabled' : ''}>
            ${vip.claimed_today ? 'CLAIMED TODAY ✓' : 'CLAIM VIP BONUS'}
          </button>
        </div>
      </div>

      ${club ? `
        <div class="tpa-feature-card">
          <div class="tpa-feature-line"><b>${esc(club.name)}</b><b>${esc(String(club.role || 'member').toUpperCase())}</b></div>
          <div class="tpa-club-code">${esc(club.club_code)}</div>
          <div class="tpa-feature-line"><span>Members</span><b>${Number(club.members_count || 0)}/50</b></div>
          <div class="tpa-feature-line"><span>Club XP power</span><b>${Number(club.club_xp || 0).toLocaleString()}</b></div>
          <div class="tpa-feature-actions">
            <button class="tpa-small-action alt" id="tpaLeaveClub" ${club.role === 'owner' ? 'disabled' : ''}>
              ${club.role === 'owner' ? 'OWNER' : 'LEAVE CLUB'}
            </button>
          </div>
        </div>
      ` : `
        <div class="tpa-feature-card">
          <h3>Join the Club competition</h3>
          <div class="tpa-sub">Create a club or join one using a 6-character club code.</div>
          <div class="tpa-feature-actions">
            <button class="tpa-small-action" id="tpaCreateClub">CREATE CLUB</button>
            <button class="tpa-small-action alt" id="tpaJoinClub">JOIN CODE</button>
          </div>
        </div>
      `}

      <h3 style="margin:18px 0 6px">Top Clubs</h3>
      ${leaderboard.map((c,i) => `
        <div class="tpa-lb-row">
          <div class="tpa-lb-rank">${i+1}</div>
          <div class="tpa-lb-name"><b>${esc(c.name)}</b><span>${Number(c.members_count || 0)} members</span></div>
          <div class="tpa-lb-xp"><b>${Number(c.club_xp || 0).toLocaleString()} XP</b><span>${Number(c.club_wins || 0)} wins</span></div>
        </div>
      `).join('') || '<div class="tpa-sub">No clubs created yet.</div>'}
    `;

    const vipClaim = overlay.querySelector('#tpaVipClaim');
    if (vipClaim && !vipClaim.disabled) {
      vipClaim.onclick = async () => {
        const { data: result, error: claimError } = await db.rpc('claim_vip_daily_bonus');
        if (claimError) return showError('VIP claim failed', claimError);
        await syncProfileWallet();
        modal('VIP bonus claimed', `+${Number(result?.reward_chips || 0).toLocaleString()} virtual chips`);
        await openClubVip();
      };
    }

    const create = overlay.querySelector('#tpaCreateClub');
    if (create) {
      create.onclick = async () => {
        const name = prompt('CREATE CLUB\n\nEnter club name:');
        if (!name) return;
        const { data: result, error: createError } = await db.rpc('create_club', { p_name: name.trim() });
        if (createError) return showError('Create club failed', createError);
        modal('Club created', `${result?.name || name}\nClub code: ${result?.club_code || ''}`);
        await refreshSocialDock();
        await openClubVip();
      };
    }

    const join = overlay.querySelector('#tpaJoinClub');
    if (join) {
      join.onclick = async () => {
        const code = prompt('JOIN CLUB\n\nEnter 6-character club code:');
        if (!code) return;
        const { data: result, error: joinError } = await db.rpc('join_club', { p_club_code: code.trim().toUpperCase() });
        if (joinError) return showError('Join club failed', joinError);
        modal('Club joined', `Welcome to ${result?.name || 'the club'}.`);
        await refreshSocialDock();
        await openClubVip();
      };
    }

    const leave = overlay.querySelector('#tpaLeaveClub');
    if (leave && !leave.disabled) {
      leave.onclick = async () => {
        if (!confirm('Leave this club?')) return;
        const { error: leaveError } = await db.rpc('leave_club');
        if (leaveError) return showError('Leave club failed', leaveError);
        await refreshSocialDock();
        await openClubVip();
      };
    }
  }

  async function openDailyEvent() {
    const overlay = showMeta('Daily Event', `<div class="tpa-sub">Loading today’s event…</div>`);
    const { data, error } = await db.rpc('get_daily_event');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }
    const e = data || {};
    const progress = Number(e.progress || 0);
    const target = Math.max(1, Number(e.target || 1));
    const pct = Math.max(0, Math.min(100, (progress / target) * 100));
    const complete = progress >= target;

    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-event-hero">
        <div class="icon">${e.icon || '⚡'}</div>
        <h3>${esc(e.title || 'Daily Event')}</h3>
        <div class="tpa-sub">${esc(e.description || '')}</div>
        <div class="tpa-feature-line"><span>Featured mode</span><b>${esc(e.mode_title || e.mode || 'Classic')}</b></div>
        <div class="tpa-feature-line"><span>Reward</span><b>${Number(e.reward_chips || 0).toLocaleString()} chips + ${Number(e.reward_xp || 0)} XP</b></div>
        <div class="tpa-mini-progress"><i style="width:${pct}%"></i></div>
        <div class="tpa-sub">${Math.min(progress,target)}/${target} rounds completed today</div>
        <button class="tpa-primary-action" id="tpaEventClaim"
          ${!complete || e.claimed ? 'disabled' : ''}>
          ${e.claimed ? 'EVENT REWARD CLAIMED ✓' : complete ? 'CLAIM EVENT REWARD' : 'KEEP PLAYING'}
        </button>
      </div>
      <div class="tpa-sub" style="text-align:center;margin-top:13px">
        Event changes every day at midnight India time.
      </div>
    `;

    const claim = overlay.querySelector('#tpaEventClaim');
    if (claim && !claim.disabled) {
      claim.onclick = async () => {
        const { data: result, error: claimError } = await db.rpc('claim_daily_event');
        if (claimError) return showError('Event claim failed', claimError);
        await syncProfileWallet();
        modal('Event complete', `+${Number(result?.reward_chips || 0).toLocaleString()} chips • +${Number(result?.reward_xp || 0)} XP`);
        await refreshSocialDock();
        await openDailyEvent();
      };
    }
  }

  async function openInbox() {
    const overlay = showMeta('Inbox', `<div class="tpa-sub">Loading notifications…</div>`);
    const { data, error } = await db.rpc('get_social_notifications');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }

    const rows = data || [];
    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-feature-actions">
        <button class="tpa-small-action alt" id="tpaMarkAllRead">MARK ALL READ</button>
      </div>
      ${rows.map(n => `
        <div class="tpa-notice ${n.is_read ? '' : 'unread'}">
          <b>${esc(n.title || 'Notification')}</b>
          <p>${esc(n.message || '')}</p>
          <div class="tpa-feature-line"><span>${new Date(n.created_at).toLocaleString()}</span><span>${n.is_read ? 'READ' : 'NEW'}</span></div>
          <div class="tpa-feature-actions">
            ${n.type === 'table_invite' && n.payload?.room_code
              ? `<button class="tpa-small-action" data-inbox-join="${esc(n.payload.room_code)}" data-notice-id="${n.id}">JOIN TABLE</button>`
              : ''}
            ${!n.is_read ? `<button class="tpa-small-action alt" data-notice-read="${n.id}">MARK READ</button>` : ''}
          </div>
        </div>
      `).join('') || '<div class="tpa-sub">Your inbox is empty.</div>'}
    `;

    const markAll = overlay.querySelector('#tpaMarkAllRead');
    if (markAll) {
      markAll.onclick = async () => {
        const { error: readError } = await db.rpc('mark_all_social_notifications_read');
        if (readError) return showError('Inbox error', readError);
        await refreshSocialDock();
        await openInbox();
      };
    }

    overlay.querySelectorAll('[data-notice-read]').forEach(btn => {
      btn.onclick = async () => {
        const { error: readError } = await db.rpc('mark_social_notification_read', {
          p_notification_id: Number(btn.dataset.noticeRead)
        });
        if (readError) return showError('Inbox error', readError);
        await refreshSocialDock();
        await openInbox();
      };
    });

    overlay.querySelectorAll('[data-inbox-join]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await db.rpc('mark_social_notification_read', {
            p_notification_id: Number(btn.dataset.noticeId)
          });
        } catch (_) {}
        ensureMetaOverlay().classList.add('hidden');
        await refreshSocialDock();
        await joinPrivateRoom(btn.dataset.inboxJoin);
      };
    });
  }


  function ensureAccessBlock() {
    let el = document.getElementById('tpaAccessBlock');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tpaAccessBlock';
    el.className = 'tpa-access-block';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="tpa-access-card">
        <div class="icon" id="tpaAccessIcon">🛠️</div>
        <h2 id="tpaAccessTitle">Temporarily unavailable</h2>
        <p id="tpaAccessMessage">Please try again later.</p>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function setAccessBlock(show, title = '', message = '', icon = '🛠️') {
    const el = ensureAccessBlock();
    if (!show) {
      el.style.display = 'none';
      return;
    }
    el.querySelector('#tpaAccessTitle').textContent = title;
    el.querySelector('#tpaAccessMessage').textContent = message;
    el.querySelector('#tpaAccessIcon').textContent = icon;
    el.style.display = 'flex';
  }

  async function refreshLaunchControl() {
    try {
      const { data, error } = await db.rpc('get_launch_state');
      if (error || !data) return;

      const adminBtn = $q('#adminBtn');
      if (adminBtn) adminBtn.style.display = data.is_admin ? '' : 'none';

      if (data.banned && !data.is_admin) {
        setAccessBlock(
          true,
          'Account restricted',
          data.ban_reason || 'This account is temporarily restricted from gameplay.',
          '⛔'
        );
        return;
      }

      if (data.maintenance && !data.is_admin) {
        setAccessBlock(
          true,
          'Maintenance in progress',
          data.maintenance_message || 'Teen Patti Arena is being updated. Please try again shortly.',
          '🛠️'
        );
        return;
      }

      setAccessBlock(false);

      if (data.announcement?.id) {
        const key = `tpa_announcement_${data.announcement.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          modal(
            data.announcement.title || 'Announcement',
            data.announcement.message || ''
          );
        }
      }
    } catch (_) {}
  }

  async function openAdminPanel() {
    const overlay = showMeta('Admin • Launch Control', `<div class="tpa-sub">Loading admin dashboard…</div>`);
    const { data, error } = await db.rpc('get_admin_dashboard');
    if (error) {
      overlay.querySelector('#tpaMetaBody').innerHTML = `<div class="tpa-sub">${esc(error.message)}</div>`;
      return;
    }

    const d = data || {};
    const reports = d.reports || [];
    const rooms = d.rooms || [];
    const flags = d.suspicious || [];
    const stats = d.stats || {};

    overlay.querySelector('#tpaMetaBody').innerHTML = `
      <div class="tpa-admin-grid">
        <div class="tpa-admin-card"><b>${Number(stats.users || 0)}</b><span>PLAYERS</span></div>
        <div class="tpa-admin-card"><b>${Number(stats.active_rooms || 0)}</b><span>ACTIVE ROOMS</span></div>
        <div class="tpa-admin-card"><b>${Number(stats.pending_reports || 0)}</b><span>PENDING REPORTS</span></div>
        <div class="tpa-admin-card"><b>${Number(stats.flagged_24h || 0)}</b><span>FLAGS • 24H</span></div>
      </div>

      <div class="tpa-feature-card">
        <div class="tpa-feature-line">
          <b>Maintenance Mode</b>
          <span class="tpa-maintenance-tag">${d.maintenance ? 'ON' : 'OFF'}</span>
        </div>
        <div class="tpa-admin-toolbar">
          <button class="tpa-small-action" id="tpaMaintenanceToggle">${d.maintenance ? 'TURN OFF' : 'TURN ON'}</button>
          <button class="tpa-small-action alt" id="tpaPublishAnnouncement">ANNOUNCEMENT</button>
          <button class="tpa-small-action alt" id="tpaClearAnnouncement">CLEAR NOTICE</button>
          <button class="tpa-small-action alt" id="tpaRefreshAdmin">REFRESH</button>
        </div>
      </div>

      <div class="tpa-feature-card">
        <h3>User Controls</h3>
        <div class="tpa-sub">Ban/unban gameplay, social-mute/unmute, or grant virtual chips with an audit log.</div>
        <div class="tpa-admin-toolbar">
          <button class="tpa-small-action" id="tpaBanUser">BAN USER</button>
          <button class="tpa-small-action alt" id="tpaUnbanUser">UNBAN</button>
          <button class="tpa-small-action alt" id="tpaMuteUser">MUTE</button>
          <button class="tpa-small-action alt" id="tpaUnmuteUser">UNMUTE</button>
          <button class="tpa-small-action" id="tpaGrantChips">GRANT CHIPS</button>
        </div>
      </div>

      <h3 style="margin:18px 0 5px">Pending Reports</h3>
      ${reports.map(r => `
        <div class="tpa-notice unread">
          <b>#${r.id} • ${esc(r.reported_username || 'Player')} • ${esc(String(r.category || '').toUpperCase())}</b>
          <p>${esc(r.details || 'No details supplied.')}</p>
          <div class="tpa-feature-line"><span>By ${esc(r.reporter_username || 'Player')}</span><span>${new Date(r.created_at).toLocaleString()}</span></div>
          <div class="tpa-feature-actions">
            <button class="tpa-small-action" data-report-resolve="${r.id}">RESOLVE</button>
          </div>
        </div>
      `).join('') || '<div class="tpa-sub">No pending reports.</div>'}

      <h3 style="margin:18px 0 5px">Room Monitor</h3>
      ${rooms.map(r => `
        <div class="tpa-admin-log">
          <b>${esc(r.room_name || 'Room')} • ${esc(String(r.game_mode || 'classic').toUpperCase())}</b><br>
          ${Number(r.players_count || 0)}/5 players • ${esc(String(r.status || 'open').toUpperCase())}
          ${r.room_code ? ` • ${esc(r.room_code)}` : ''}
        </div>
      `).join('') || '<div class="tpa-sub">No recent rooms.</div>'}

      <h3 style="margin:18px 0 5px">Suspicious Activity</h3>
      ${flags.map(f => `
        <div class="tpa-admin-log">
          <b>${esc(f.username || 'Player')} • ${esc(String(f.event_type || '').toUpperCase())}</b><br>
          ${esc(f.summary || '')}<br>
          <small>${new Date(f.created_at).toLocaleString()} • severity ${Number(f.severity || 1)}</small>
        </div>
      `).join('') || '<div class="tpa-sub">No recent suspicious activity.</div>'}
    `;

    overlay.querySelector('#tpaRefreshAdmin').onclick = openAdminPanel;

    overlay.querySelector('#tpaMaintenanceToggle').onclick = async () => {
      const message = d.maintenance
        ? ''
        : (prompt('MAINTENANCE MESSAGE\\n\\nMessage players will see:', 'We are updating Teen Patti Arena. Please try again shortly.') || '');
      const { error: e } = await db.rpc('admin_set_maintenance', {
        p_enabled: !d.maintenance,
        p_message: message
      });
      if (e) return showError('Admin action failed', e);
      await refreshLaunchControl();
      await openAdminPanel();
    };

    overlay.querySelector('#tpaPublishAnnouncement').onclick = async () => {
      const title = prompt('ANNOUNCEMENT TITLE:');
      if (!title) return;
      const message = prompt('ANNOUNCEMENT MESSAGE:');
      if (!message) return;
      const { error: e } = await db.rpc('admin_publish_announcement', {
        p_title: title.trim(),
        p_message: message.trim(),
        p_hours: 24
      });
      if (e) return showError('Announcement failed', e);
      modal('Announcement published', 'Players will see it when they refresh/open the game.');
      await openAdminPanel();
    };

    overlay.querySelector('#tpaClearAnnouncement').onclick = async () => {
      const { error: e } = await db.rpc('admin_clear_announcements');
      if (e) return showError('Admin action failed', e);
      await openAdminPanel();
    };

    async function moderate(action) {
      const username = prompt(`${action.toUpperCase()} USER\\n\\nExact username:`);
      if (!username) return;
      const reason = prompt('Reason:', action === 'ban' ? 'Policy / abuse review' : 'Social moderation') || '';
      let hours = null;
      if (action === 'ban' || action === 'mute') {
        const raw = prompt('Duration in hours (blank = indefinite):', '24');
        if (raw && !Number.isNaN(Number(raw))) hours = Number(raw);
      }
      const { data: result, error: e } = await db.rpc('admin_moderate_user', {
        p_username: username.trim(),
        p_action: action,
        p_reason: reason.trim(),
        p_hours: hours
      });
      if (e) return showError('Moderation failed', e);
      modal('Admin action complete', `${result?.username || username}: ${action}`);
      await openAdminPanel();
    }

    overlay.querySelector('#tpaBanUser').onclick = () => moderate('ban');
    overlay.querySelector('#tpaUnbanUser').onclick = () => moderate('unban');
    overlay.querySelector('#tpaMuteUser').onclick = () => moderate('mute');
    overlay.querySelector('#tpaUnmuteUser').onclick = () => moderate('unmute');

    overlay.querySelector('#tpaGrantChips').onclick = async () => {
      const username = prompt('GRANT VIRTUAL CHIPS\\n\\nExact username:');
      if (!username) return;
      const raw = prompt('Amount (1 - 100000):', '1000');
      if (!raw) return;
      const amount = Number(raw);
      const reason = prompt('Reason:', 'Support / test adjustment') || '';
      const { data: result, error: e } = await db.rpc('admin_grant_virtual_chips', {
        p_username: username.trim(),
        p_amount: amount,
        p_reason: reason.trim()
      });
      if (e) return showError('Chip grant failed', e);
      modal('Virtual chips granted', `${result?.username || username}: +${Number(result?.amount || amount).toLocaleString()} chips`);
      await openAdminPanel();
    };

    overlay.querySelectorAll('[data-report-resolve]').forEach(btn => {
      btn.onclick = async () => {
        const note = prompt('Resolution note:', 'Reviewed by admin') || '';
        const { error: e } = await db.rpc('admin_resolve_report', {
          p_report_id: Number(btn.dataset.reportResolve),
          p_note: note.trim()
        });
        if (e) return showError('Resolve failed', e);
        await openAdminPanel();
      };
    });
  }

  function wireMetaFeatures() {
    ensureMetaDock();

    const spin = $q('#spinWheelBtn');
    if (spin) spin.onclick = spinDailyWheel;

    const level = $q('#levelBtn');
    if (level) level.onclick = openLevelCard;

    const lb = $q('#leaderboardBtn');
    if (lb) lb.onclick = openLeaderboard;

    const sitgo = $q('#sitgoBtn');
    if (sitgo) sitgo.onclick = openSitGoLobby;

    const challenges = $q('#challengesBtn');
    if (challenges) challenges.onclick = openChallenges;

    const achievements = $q('#achievementsBtn');
    if (achievements) achievements.onclick = openAchievements;

    const friends = $q('#friendsBtn');
    if (friends) friends.onclick = openFriends;

    const club = $q('#clubBtn');
    if (club) club.onclick = openClubVip;

    const events = $q('#eventsBtn');
    if (events) events.onclick = openDailyEvent;

    const inbox = $q('#inboxBtn');
    if (inbox) inbox.onclick = openInbox;

    const admin = $q('#adminBtn');
    if (admin) admin.onclick = openAdminPanel;

    refreshSocialDock();
    refreshLaunchControl();

    // Use the existing Profile nav as a shortcut to Levels/XP.
    const profileNav = $q('#navProfile');
    if (profileNav) profileNav.onclick = openLevelCard;
  }

  async function findOrCreatePublicRoom(boot, roomName, gameMode = 'classic') {
    const user = await getUser();
    if (!user) return showError('Login required', 'Please login first.');

    // If this user already belongs to a waiting/running table, restore it
    // instead of creating a second room.
    if (await reconnectExistingRoom(gameMode, boot)) return;

    const { data: rooms, error } = await db
      .from('rooms')
      .select('id,room_code,room_name,boot_amount,max_players,status,is_private,game_mode,created_at')
      .eq('is_private', false)
      .eq('status', 'waiting')
      .eq('game_mode', gameMode)
      .eq('boot_amount', Number(boot))
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) return showError('Room error', error);

    let joinedRoom = null;
    let seatNo = null;

    for (const r of (rooms || [])) {
      const { data, error: joinError } = await db.rpc('join_public_room', {
        p_room_id: r.id
      });
      if (!joinError) {
        joinedRoom = r;
        seatNo = data;
        break;
      }
      const m = String(joinError.message || '').toLowerCase();
      if (!m.includes('full') && !m.includes('started')) {
        return showError('Join failed', joinError);
      }
    }

    if (!joinedRoom) {
      const { data, error: createError } = await db.rpc('create_game_room', {
        p_room_name: roomName || 'Teen Patti Table',
        p_boot_amount: Number(boot),
        p_is_private: false,
        p_game_mode: gameMode
      });
      if (createError) return showError('Create room failed', createError);

      const row = Array.isArray(data) ? data[0] : data;
      joinedRoom = {
        id: row.room_id,
        room_code: row.room_code,
        room_name: roomName || 'Teen Patti Table',
        boot_amount: Number(boot),
        is_private: false,
        game_mode: gameMode
      };
      seatNo = row.seat_no;
    }

    await enterOnlineRoom(joinedRoom, seatNo);
  }

  async function createPrivateRoom(boot = 100, gameMode = 'classic') {
    const user = await getUser();
    if (!user) return showError('Login required', 'Please login first.');

    const { data, error } = await db.rpc('create_game_room', {
      p_room_name: 'Private Table',
      p_boot_amount: Number(boot),
      p_is_private: true,
      p_game_mode: gameMode
    });
    if (error) return showError('Create room failed', error);

    const row = Array.isArray(data) ? data[0] : data;
    await enterOnlineRoom({
      id: row.room_id,
      room_code: row.room_code,
      room_name: 'Private Table',
      boot_amount: Number(boot),
      is_private: true,
      game_mode: gameMode
    }, row.seat_no);

    modal('Private room created', `${modeTitle(gameMode)} • Room code: ${row.room_code}\nShare this code with friends.`);
  }

  async function joinPrivateRoom(code) {
    const cleaned = String(code || '').trim().toUpperCase();
    if (!cleaned) return;

    const { data, error } = await db.rpc('join_room_by_code', {
      p_room_code: cleaned
    });
    if (error) return showError('Join failed', error);

    const row = Array.isArray(data) ? data[0] : data;
    const { data: room, error: roomError } = await db
      .from('rooms')
      .select('id,room_code,room_name,boot_amount,status,is_private,game_mode')
      .eq('id', row.room_id)
      .single();

    if (roomError) return showError('Room error', roomError);
    await enterOnlineRoom(room, row.seat_no);
  }

  function privateDialog() {
    const choice = prompt(
      'PRIVATE TABLE\n\nCREATE = Classic\nCREATE MUFLIS\nCREATE AK47\nCREATE JOKER\nCREATE 999\nCREATE HUKAM\nCREATE 4X\nCREATE 6 PATTI\nCREATE 321\n\nOr enter a 6-character room code to JOIN.'
    );
    if (!choice) return;
    const c = choice.trim().toUpperCase();
    if (c === 'CREATE') createPrivateRoom(100, 'classic');
    else if (c === 'CREATE MUFLIS') createPrivateRoom(100, 'muflis');
    else if (c === 'CREATE AK47') createPrivateRoom(100, 'ak47');
    else if (c === 'CREATE JOKER') createPrivateRoom(100, 'joker');
    else if (c === 'CREATE 999') createPrivateRoom(100, '999');
    else if (c === 'CREATE HUKAM') createPrivateRoom(100, 'hukam');
    else if (c === 'CREATE 4X' || c === 'CREATE 4X BOOT') createPrivateRoom(400, '4xboot');
    else if (c === 'CREATE 6 PATTI' || c === 'CREATE 6PATTI') createPrivateRoom(500, '6patti');
    else if (c === 'CREATE 321') createPrivateRoom(100, '321');
    else joinPrivateRoom(choice);
  }

  async function enterOnlineRoom(room, seatNo) {
    online.roomId = room.id;
    online.roomCode = room.room_code;
    online.boot = Number(room.boot_amount || 100);
    online.roomName = room.room_name || 'Online Table';
    online.mode = room.game_mode || 'classic';
    online.selectedMode = online.mode;

    if (online.mode === 'sitgo' && !online.sitgoTournamentId) {
      try {
        const { data } = await db.rpc('get_sitgo_by_room', { p_room_id: room.id });
        if (data?.tournament_id) online.sitgoTournamentId = data.tournament_id;
      } catch (_) {}
    }

    if (typeof enterRoom === 'function') enterRoom(online.boot, online.roomName);

    const modeName = modeTitle(online.mode);
    const title = $q('#roomTitle');
    if (title) title.textContent = room.is_private
      ? `${modeName} • ${online.roomCode}`
      : `${modeName} • ${online.roomName}`;
    const subtitle = $q('#tableScreen .table-room small');
    if (subtitle) subtitle.textContent = online.mode === 'classic'
      ? 'CLASSIC 3 PATTI • 5 PLAYERS • BLIND / SEEN / CHAAL / PACK / SHOW'
      : `${modeName.toUpperCase()} • 5 PLAYERS`;

    if ($q('#bootValue')) $q('#bootValue').textContent = online.boot.toLocaleString();
    if ($q('#dealBoot')) $q('#dealBoot').textContent = online.boot.toLocaleString();

    await subscribeRoom();
    await setPresence(true);
    await refreshAll();
    wireTableButtons();
    ensureChangeTableButton();
    startTimerLoop();

    roomMessage(`Online table joined • Seat ${seatNo} • Room ${online.roomCode}`);
  }

  async function subscribeRoom() {
    if (online.subscription) {
      await db.removeChannel(online.subscription);
      online.subscription = null;
    }

    online.subscription = db
      .channel(`teen-patti-${online.roomId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_players',
        filter: `room_id=eq.${online.roomId}`
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rooms',
        filter: `id=eq.${online.roomId}`
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_rounds',
        filter: `room_id=eq.${online.roomId}`
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'player_hands',
        filter: `room_id=eq.${online.roomId}`
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_actions',
        filter: `room_id=eq.${online.roomId}`
      }, scheduleRefresh)
      .subscribe();
  }

  function scheduleRefresh() {
    clearTimeout(online.refreshTimer);
    online.refreshTimer = setTimeout(() => refreshAll(), 120);
  }

  async function refreshAll() {
    if (!online.roomId) return;
    await getUser();
    await Promise.all([
      loadRoomPlayers(),
      loadRound(),
      syncProfileWallet(),
      refreshSitGoState()
    ]);
    renderAll();
  }

  async function loadRoomPlayers() {
    const { data: members, error } = await db
      .from('room_players')
      .select('user_id,seat_no,is_ready,is_online,joined_at')
      .eq('room_id', online.roomId)
      .order('seat_no');

    if (error) return console.error(error);

    const ids = [...new Set((members || []).map(m => m.user_id))];
    let profiles = [];
    if (ids.length) {
      const res = await db
        .from('profiles')
        .select('id,username,chips')
        .in('id', ids);
      profiles = res.data || [];
    }

    const map = new Map(profiles.map(p => [p.id, p]));
    online.players = (members || []).map(m => ({
      ...m,
      profile: map.get(m.user_id) || { username:'Player', chips:0 }
    }));
  }

  async function loadRound() {
    const { data: rounds, error } = await db
      .from('game_rounds')
      .select('id,round_number,status,pot,current_bet,current_turn,winner_id,winner_hand,result,turn_seq,turn_deadline,variant_data,created_at,finished_at')
      .eq('room_id', online.roomId)
      .order('round_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return;
    }

    online.currentRound = rounds?.[0] || null;
    online.myHand = null;
    online.actions = [];

    if (!online.currentRound) return;

    const roundId = online.currentRound.id;

    const [handRes, actionRes] = await Promise.all([
      db.from('player_hands')
        .select('user_id,cards,is_seen,is_folded,is_revealed,bet_amount,variant_choice')
        .eq('round_id', roundId),
      db.from('game_actions')
        .select('id,user_id,action,amount,created_at')
        .eq('round_id', roundId)
        .order('id', { ascending: true })
    ]);

    const visibleHands = handRes.data || [];
    online.myHand = visibleHands.find(h => h.user_id === online.user?.id) || null;
    online.visibleHands = visibleHands;
    online.actions = actionRes.data || [];
  }

  function clearSeat(id) {
    const seat = $q('#' + id);
    if (!seat) return;
    const name = seat.querySelector('.pname');
    const coins = seat.querySelector('[data-coins]');
    const avatar = seat.querySelector('.avatar');
    const status = seat.querySelector('[data-status]');
    const cards = seat.querySelector('.mini-cards');
    if (name) name.textContent = 'Waiting…';
    if (coins) coins.textContent = '—';
    if (avatar) avatar.textContent = '+';
    if (status) status.textContent = 'OPEN';
    if (cards) {
      cards.className = 'mini-cards';
      const n = (online.mode === '6patti' || online.mode === '321') ? 6 : 3;
      cards.innerHTML = Array.from({length:n}, () => '<i></i>').join('');
    }
    seat.dataset.realUser = '';
  }

  function latestActionFor(userId) {
    const a = [...online.actions].reverse().find(x => x.user_id === userId);
    return a?.action || null;
  }

  function visibleHandFor(userId) {
    return (online.visibleHands || []).find(h => h.user_id === userId);
  }

  function renderPlayers() {
    ['bot1','bot2','bot3','bot4'].forEach(clearSeat);

    const me = online.players.find(p => p.user_id === online.user?.id);
    const others = online.players.filter(p => p.user_id !== online.user?.id);

    if (me) {
      const name = me.profile.username || 'You';
      if ($q('#me .pname')) $q('#me .pname').textContent = name;
      if ($q('#me .avatar')) $q('#me .avatar').textContent = name.slice(0,2).toUpperCase();
      if ($q('#myTableCoins')) $q('#myTableCoins').textContent =
        Number(me.profile.chips || 0).toLocaleString();
    }

    others.slice(0,4).forEach((p, idx) => {
      const seat = $q(`#bot${idx+1}`);
      if (!seat) return;
      const name = p.profile.username || 'Player';
      const action = latestActionFor(p.user_id);
      const vh = visibleHandFor(p.user_id);

      seat.dataset.realUser = p.user_id;
      seat.querySelector('.pname').textContent = name;
      seat.querySelector('[data-coins]').textContent =
        Number(p.profile.chips || 0).toLocaleString();
      seat.querySelector('.avatar').textContent = name.slice(0,2).toUpperCase();

      let status = 'ONLINE';
      if (online.currentRound?.status === 'playing') {
        if (online.mode === '321') {
          status = vh?.variant_choice?.ready ? 'READY' : 'ARRANGING';
        } else if (action === 'pack') status = 'PACK';
        else if (online.currentRound.current_turn === p.user_id) status = 'TURN';
        else if (action === 'seen') status = 'SEEN';
        else if (action === 'blind') status = 'BLIND';
        else if (action === 'chaal') status = 'CHAAL';
        else status = 'PLAYING';
      } else if (online.currentRound?.status === 'finished') {
        status = online.currentRound.winner_id === p.user_id ? 'WINNER' : 'ROUND OVER';
      }
      seat.querySelector('[data-status]').textContent = status;

      const cards = seat.querySelector('.mini-cards');
      if (vh?.is_revealed && Array.isArray(vh.cards)) {
        cards.className = 'mini-cards revealed';
        cards.textContent = vh.cards.map(c => `${c.r}${c.s}`).join('  ');
      } else {
        cards.className = 'mini-cards';
        const n = (online.mode === '6patti' || online.mode === '321') ? 6 : 3;
        cards.innerHTML = Array.from({length:n}, () => '<i></i>').join('');
      }
    });
  }

  function renderMyCards() {
    const hand = online.myHand;
    if (!hand || !Array.isArray(hand.cards) || !hand.cards.length) {
      if (typeof hideMine === 'function') hideMine();
      if ($q('#myStatus')) $q('#myStatus').textContent =
        online.currentRound?.status === 'playing' ? 'PLAYING' : 'READY';
      return;
    }

    if (hand.is_seen || hand.is_revealed || online.currentRound?.status === 'finished') {
      if (typeof card === 'function') {
        $q('#myCards').innerHTML = hand.cards.map(card).join('');
      }
    } else if (typeof hideMine === 'function') {
      hideMine();
    }

    let st = hand.is_folded ? 'PACK' : hand.is_seen ? 'SEEN' : 'BLIND';
    if (!hand.is_folded && online.currentRound?.current_turn === online.user?.id) st = 'YOUR TURN';
    if ($q('#myStatus')) $q('#myStatus').textContent = st;
  }

  function renderRound() {
    const r = online.currentRound;
    const count = online.players.length;

    if (!r) {
      if ($q('#potValue')) $q('#potValue').textContent = '0';
      if ($q('#roundNo')) $q('#roundNo').textContent = '1';
      if ($q('#roundLabel')) $q('#roundLabel').textContent =
        `${modeTitle(online.mode).toUpperCase()} • ${count}/5 • ${count < 2 ? 'WAITING' : 'READY'}`;
      showStartButton();
      return;
    }

    if ($q('#potValue')) $q('#potValue').textContent = Number(r.pot || 0).toLocaleString();
    if ($q('#roundNo')) $q('#roundNo').textContent = r.round_number || 1;

    if (r.status === 'playing' || r.status === 'show') {
      if (online.mode === '321') {
        show321Controls();
      } else {
        const myTurn = r.current_turn === online.user?.id;
        if ($q('#roundLabel')) $q('#roundLabel').textContent =
          myTurn ? `${modeTitle(online.mode).toUpperCase()} • YOUR TURN` : `${modeTitle(online.mode).toUpperCase()} • ${count}/5 • WAITING TURN`;
        showActionButtons(myTurn);
        renderTurnTimer();
      }
    } else if (r.status === 'finished') {
      showFinished(r);
    } else {
      showStartButton();
    }
  }

  function showStartButton() {
    const count = online.players.length;
    let required = online.mode === '6patti' ? 5 : 2;
    if (online.mode === 'sitgo') {
      const rounds = Number(online.sitgoState?.rounds_completed || 0);
      required = rounds < 2 ? 5 : rounds < 4 ? 3 : 2;
    }
    const deal = $q('#dealBtn');
    const actions = $q('#actionBar');
    if (actions) actions.classList.add('hidden');
    if (deal) {
      deal.classList.remove('hidden');
      const s = deal.querySelector('span');
      const sm = deal.querySelector('small');
      if (online.mode === 'sitgo' && online.sitgoState?.status === 'completed') {
        if (s) s.textContent='TOURNAMENT COMPLETE';
        if (sm) sm.textContent=`FINISH #${online.sitgoState?.finish_position || '—'}`;
        deal.disabled=true; deal.style.opacity='.55'; return;
      }
      if (online.mode === 'sitgo' && online.sitgoState?.user_status === 'eliminated') {
        if (s) s.textContent='ELIMINATED • WATCHING';
        if (sm) sm.textContent=`FINISH #${online.sitgoState?.finish_position || '—'}`;
        deal.disabled=true; deal.style.opacity='.55'; return;
      }
      if (s) {
        if (count >= required) s.textContent = online.mode==='321' ? 'START 321 ROUND' : online.mode==='sitgo' ? `START ${sitgoStageLabel(online.sitgoState)}` : 'START ONLINE ROUND';
        else s.textContent = online.mode==='6patti' ? `WAITING • ${count}/5 PLAYERS` : online.mode==='sitgo' ? `WAITING • ${count}/${required} ACTIVE PLAYERS` : 'WAITING FOR PLAYER';
      }
      if (sm) sm.innerHTML=`BOOT <b id="dealBoot">${online.boot.toLocaleString()}</b>`;
      deal.disabled=count<required;
      deal.style.opacity=count<required?'.55':'1';
    }
  }

  function showActionButtons(myTurn) {
    const deal = $q('#dealBtn');
    const actions = $q('#actionBar');
    if (deal) deal.classList.add('hidden');
    if (actions) actions.classList.remove('hidden');

    const pack = $q('#packBtn');
    const seen = $q('#seenBtn');
    const chaalBtn = $q('#chaalBtn');
    const show = $q('#showBtn');

    if (pack) {
      pack.style.display = '';
      pack.textContent = 'PACK';
      pack.onclick = () => act('pack');
    }
    if (seen) {
      seen.style.display = '';
      seen.textContent = 'SEEN';
      seen.onclick = () => act('seen');
    }
    if (chaalBtn) {
      chaalBtn.style.display = '';
      chaalBtn.onclick = () => act(online.myHand?.is_seen ? 'chaal' : 'blind');
    }
    if (show) {
      show.style.display = '';
      show.textContent = 'SHOW';
      show.onclick = () => act('show');
    }

    const hand = online.myHand;
    const disabled = !myTurn || !hand || hand.is_folded;

    ['#packBtn','#seenBtn','#chaalBtn','#showBtn'].forEach(id => {
      const b = $q(id);
      if (!b) return;
      b.disabled = disabled;
      b.style.opacity = disabled ? '.42' : '1';
    });

    if ($q('#seenBtn')) {
      $q('#seenBtn').disabled = disabled || !!hand?.is_seen;
      $q('#seenBtn').style.opacity = (disabled || hand?.is_seen) ? '.42' : '1';
    }

    const chaal = $q('#chaalBtn');
    if (chaal) {
      const label = chaal.querySelector('b');
      const amount = chaal.querySelector('small');
      const a = Number(online.currentRound?.current_bet || online.boot) *
        (hand?.is_seen ? 2 : 1);
      if (label) label.textContent = hand?.is_seen ? 'CHAAL' : 'BLIND';
      if (amount) amount.textContent = a.toLocaleString();
    }
  }

  function showFinished(r) {
    const deal = $q('#dealBtn');
    const actions = $q('#actionBar');
    if (actions) actions.classList.add('hidden');
    if (deal) {
      deal.classList.remove('hidden');
      deal.disabled = online.players.length < 2;
      deal.style.opacity = deal.disabled ? '.55' : '1';
      const s = deal.querySelector('span');
      if (s) s.textContent = 'START NEXT ROUND';
    }

    const result = r.result || {};
    const winners = Array.isArray(result.winners) ? result.winners : [];
    const amWinner = winners.includes(online.user?.id);

    if ($q('#roundLabel')) $q('#roundLabel').textContent =
      amWinner ? 'YOU WIN!' : 'ROUND COMPLETE';

    if (result.reason === 'show') {
      roomMessage(
        `${modeTitle(online.mode)} • ${result.tie ? 'TIE • ' : ''}${result.hand || 'Show'} • ` +
        `${Number(result.amount_each || 0).toLocaleString()} chips awarded`
      );
    } else if (result.reason === '321_showdown') {
      const tr = result.tournament_round || 1;
      const myPts = Number(result.points?.[online.user?.id] || 0);
      const total = Number(result.totals?.[online.user?.id] || 0);
      roomMessage(
        result.tournament_complete
          ? `321 TOURNAMENT COMPLETE • Round +${myPts} pts • Total ${total} pts`
          : `321 Round ${tr}/5 • +${myPts} pts • Total ${total} pts`
      );
    } else {
      roomMessage(
        amWinner
          ? `Everyone else packed • You win ${Number(result.amount_each || 0).toLocaleString()} chips!`
          : 'Round complete • Winner decided after packs.'
      );
    }
  }

  function renderAll() {
    renderPlayers();
    renderMyCards();
    renderRound();
  }

  async function startRoundOnline() {
    if (!online.roomId) return;
    const { error } = await db.rpc('start_online_round', {
      p_room_id: online.roomId
    });
    if (error) return showError('Cannot start round', error);
    await sleep(100);
    await refreshAll();
  }

  async function act(action) {
    const r = online.currentRound;
    if (!r?.id) return;

    const { error } = await db.rpc('take_online_action', {
      p_round_id: r.id,
      p_action: action
    });

    if (error) return showError('Action not allowed', error);
    await sleep(80);
    await refreshAll();
  }

  function ensureChangeTableButton() {
    const host = $q('#tableScreen');
    if (!host) return;

    if (!$q('#tpaChangeTableStyle')) {
      const style = document.createElement('style');
      style.id = 'tpaChangeTableStyle';
      style.textContent = `
        #tpaChangeTableBtn{
          position:absolute;right:14px;top:72px;z-index:80;
          border:1px solid rgba(255,220,120,.48);border-radius:999px;
          padding:8px 11px;background:rgba(20,12,30,.88);color:#ffe29a;
          font-size:10px;font-weight:1000;letter-spacing:.4px;cursor:pointer;
          box-shadow:0 6px 18px rgba(0,0,0,.22)
        }
      `;
      document.head.appendChild(style);
    }

    let btn = $q('#tpaChangeTableBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'tpaChangeTableBtn';
      btn.type = 'button';
      btn.textContent = 'CHANGE TABLE';
      host.style.position = host.style.position || 'relative';
      host.appendChild(btn);
    }

    btn.onclick = async () => {
      if (online.mode === 'sitgo') {
        return modal('Tournament table', 'Sit & Go uses tournament leave/forfeit rules. Normal table switching is disabled here.');
      }
      const mode = online.mode || 'classic';
      const ok = await leaveOnlineRoom({ force:true });
      if (!ok) return;
      if (typeof screen === 'function') screen('home');
      await sleep(60);
      openArenaTableLobby(mode);
    };
  }

  function wireTableButtons() {
    const deal = $q('#dealBtn');
    if (deal) deal.onclick = startRoundOnline;

    const seen = $q('#seenBtn');
    if (seen) seen.onclick = () => act('seen');

    const chaal = $q('#chaalBtn');
    if (chaal) chaal.onclick = () =>
      act(online.myHand?.is_seen ? 'chaal' : 'blind');

    const pack = $q('#packBtn');
    if (pack) pack.onclick = () => act('pack');

    const show = $q('#showBtn');
    if (show) show.onclick = () => act('show');

    const back = $q('#backBtn');
    if (back) back.onclick = async () => {
      if (online.mode === 'sitgo') {
        const active = online.currentRound &&
          ['dealing','playing','show'].includes(online.currentRound.status);
        if (active) return modal('Tournament in progress', 'Sit & Go uses tournament forfeit rules. Finish this tournament stage before leaving.');
      }
      const ok = await leaveOnlineRoom({ force: online.mode !== 'sitgo' });
      if (!ok) return;
      if (typeof screen === 'function') screen('home');
    };

    ensureChangeTableButton();
  }

  async function leaveOnlineRoom(options = {}) {
    if (!online.roomId) return true;
    const force = !!options.force;
    const leavingRoomId = online.roomId;

    await setPresence(false);

    let leaveError = null;
    try {
      const res = await db.rpc(force ? 'leave_table_anytime' : 'leave_game_room', {
        p_room_id: leavingRoomId
      });
      leaveError = res?.error || null;
    } catch (e) {
      leaveError = e;
    }

    if (leaveError) {
      showError(force ? 'Cannot change table' : 'Cannot leave table', leaveError);
      return false;
    }

    if (online.subscription) {
      await db.removeChannel(online.subscription);
      online.subscription = null;
    }

    stopTimerLoop();

    online.roomId = null;
    online.roomCode = null;
    online.mode = 'classic';
    online.players = [];
    online.currentRound = null;
    online.myHand = null;
    online.actions = [];
    online.arrangement321 = [1,2,3,4,5,6];
    online.sitgoTournamentId = null;
    online.sitgoState = null;
    return true;
  }


  // =============================================================
  // V14.0 — CORE CLASSIC 3 PATTI + ANYTIME TABLE SWITCH
  // V10.0 — 1000 TABLE NETWORK
  // 10 modes x 100 logical tables. Physical rooms are created lazily.
  // =============================================================
  const ARENA_TABLE_TIERS = ['ROOKIE','REGULAR','PRO','HIGH','VIP'];

  function arenaFallbackBoot(mode, tableNo) {
    const band = Math.min(4, Math.floor((Math.max(1, Number(tableNo || 1)) - 1) / 20));
    if (mode === '4xboot') return [400,1000,2000,4000,10000][band];
    if (mode === '6patti') return [500,1250,2500,5000,12500][band];
    if (mode === 'sitgo') return 500;
    return [100,250,500,1000,2500][band];
  }

  function arenaFallbackTables(mode) {
    return Array.from({length:100}, (_,i) => {
      const n = i + 1;
      const band = Math.min(4, Math.floor(i / 20));
      return {
        id:null,
        game_mode:mode,
        table_no:n,
        table_name:`${modeTitle(mode)} Table #${String(n).padStart(3,'0')}`,
        tier: mode === 'sitgo' ? 'TOURNAMENT' : ARENA_TABLE_TIERS[band],
        boot_amount:arenaFallbackBoot(mode,n),
        players_count:0,
        max_players:5,
        table_status:'OPEN',
        local_fallback:true
      };
    });
  }

  function ensureArenaLobbyStyles() {
    if ($q('#arena1000LobbyStyle')) return;
    const style = document.createElement('style');
    style.id = 'arena1000LobbyStyle';
    style.textContent = `
      .arena-net-summary{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;margin:0 0 10px;border:1px solid rgba(255,215,95,.22);background:rgba(255,215,95,.07);border-radius:14px;font-size:11px}
      .arena-net-summary b{font-size:13px}.arena-net-summary span{opacity:.72;text-align:right}
      .arena-tier-tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}
      .arena-tier-tabs::-webkit-scrollbar{display:none}
      .arena-tier-tab{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:8px 11px;font-weight:900;font-size:10px;white-space:nowrap}
      .arena-tier-tab.active{background:linear-gradient(135deg,#ffd35b,#b98619);color:#251400;border-color:rgba(255,224,122,.8)}
      .arena-table-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .arena-table-card{padding:11px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.055);border-radius:14px;min-width:0}
      .arena-table-top{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}
      .arena-table-top b{font-size:11px;line-height:1.2}.arena-table-top small{font-size:9px;opacity:.65}
      .arena-table-tier{font-size:8px;font-weight:1000;border:1px solid rgba(255,211,91,.26);color:#ffd96b;padding:3px 6px;border-radius:99px;white-space:nowrap}
      .arena-table-line{display:flex;justify-content:space-between;gap:6px;margin-top:7px;font-size:9px;opacity:.86}
      .arena-table-join{width:100%;margin-top:9px;border:0;border-radius:10px;padding:8px 6px;font-size:10px;font-weight:1000;background:linear-gradient(135deg,#ffd35b,#b98619);color:#281800}
      .arena-status-playing{color:#76e8ff}.arena-status-waiting{color:#9cffb2}.arena-status-full{color:#ff9d9d}
      @media(max-width:360px){.arena-table-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function joinArenaCatalogTable(table) {
    if (!table) return;
    const mode = table.game_mode || 'classic';
    if (mode === 'sitgo') return openSitGoLobby();

    const boot = Number(table.boot_amount || 100);
    const overlay = $q('#tpaMetaOverlay');

    // V12 FIX: do not short-circuit through reconnectExistingRoom here.
    // join_arena_table already reconnects an existing matching membership
    // and returns the actual room + seat. We must always call enterOnlineRoom
    // so the table screen is visibly opened after JOIN TABLE is pressed.
    if (!table.id || table.local_fallback) {
      if (overlay) overlay.classList.add('hidden');
      return findOrCreatePublicRoom(boot, table.table_name || `${modeTitle(mode)} Table`, mode);
    }

    let data, error;
    try {
      const res = await db.rpc('join_arena_table', { p_table_id:Number(table.id) });
      data = res.data;
      error = res.error;
    } catch (e) {
      error = e;
    }

    if (error) {
      const text = String(error?.message || error || '');
      if (/join_arena_table|function.*does not exist|schema cache/i.test(text)) {
        if (overlay) overlay.classList.add('hidden');
        return findOrCreatePublicRoom(boot, table.table_name || `${modeTitle(mode)} Table`, mode);
      }
      return showError('Table join failed', error);
    }

    const d = Array.isArray(data) ? data[0] : data;
    if (!d?.room_id) return showError('Table join failed', 'No room was returned.');

    if (overlay) overlay.classList.add('hidden');
    await enterOnlineRoom({
      id:d.room_id,
      room_code:d.room_code,
      room_name:d.table_name || table.table_name || `${modeTitle(mode)} Table`,
      boot_amount:Number(d.boot_amount || boot),
      status:'waiting',
      is_private:false,
      game_mode:d.game_mode || mode
    }, Number(d.seat_no || 1));
  }

  async function openArenaTableLobby(gameMode = 'classic') {
    const mode = String(gameMode || 'classic').toLowerCase();
    if (mode === 'sitgo') return openSitGoLobby();

    ensureArenaLobbyStyles();
    const overlay = showMeta(`${modeTitle(mode)} • 100 Tables`, `<div class="tpa-sub">Loading table network…</div>`);

    let tables = [];
    let synced = true;
    try {
      const { data, error } = await db.rpc('get_arena_table_lobby', { p_game_mode:mode });
      if (error) throw error;
      const payload = data || {};
      tables = Array.isArray(payload) ? payload : (payload.tables || []);
    } catch (e) {
      console.warn('V10 table catalog fallback:', e?.message || e);
      synced = false;
      tables = arenaFallbackTables(mode);
    }

    if (!tables.length) tables = arenaFallbackTables(mode);
    let activeTier = String(tables[0]?.tier || 'ROOKIE').toUpperCase();
    const tiers = [...new Set(tables.map(t => String(t.tier || 'ROOKIE').toUpperCase()))];

    const render = () => {
      const filtered = tables.filter(t => String(t.tier || '').toUpperCase() === activeTier);
      overlay.querySelector('#tpaMetaBody').innerHTML = `
        <div class="arena-net-summary">
          <b>${mode==='classic'?'3 PATTI • ':''}100 TABLES • ${modeTitle(mode).toUpperCase()}</b>
          <span>${synced ? 'LIVE NETWORK' : 'READY • SQL SYNC PENDING'}<br>10 MODES • 1000 TABLES</span>
        </div>
        ${mode==='classic' ? `<div style="margin:-2px 0 10px;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.045);font-size:9px;line-height:1.45;opacity:.88"><b>CLASSIC 3 PATTI</b> • 3 cards • BLIND / SEEN / CHAAL / PACK / SHOW • Trail &gt; Pure Sequence &gt; Sequence &gt; Color &gt; Pair &gt; High Card</div>` : ''}
        <div class="arena-tier-tabs">
          ${tiers.map(t => `<button class="arena-tier-tab ${t===activeTier?'active':''}" data-arena-tier="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <div class="arena-table-grid">
          ${filtered.map((t,idx) => {
            const status = String(t.table_status || 'OPEN').toUpperCase();
            const cls = status === 'PLAYING' ? 'arena-status-playing' : status === 'FULL' ? 'arena-status-full' : 'arena-status-waiting';
            return `<div class="arena-table-card">
              <div class="arena-table-top">
                <div><b>${esc(t.table_name || `${modeTitle(mode)} Table #${String(t.table_no||0).padStart(3,'0')}`)}</b><br><small>TABLE ${String(Number(t.table_no||0)).padStart(3,'0')}</small></div>
                <span class="arena-table-tier">${esc(String(t.tier||'').toUpperCase())}</span>
              </div>
              <div class="arena-table-line"><span>Boot</span><b>${Number(t.boot_amount||0).toLocaleString()} chips</b></div>
              <div class="arena-table-line"><span>Players</span><b>${Number(t.players_count||0)}/${Number(t.max_players||5)}</b></div>
              <div class="arena-table-line"><span>Status</span><b class="${cls}">${esc(status)}</b></div>
              <button class="arena-table-join" data-arena-index="${tables.indexOf(t)}">JOIN TABLE</button>
            </div>`;
          }).join('')}
        </div>`;

      overlay.querySelectorAll('[data-arena-tier]').forEach(btn => {
        btn.onclick = () => { activeTier = btn.dataset.arenaTier; render(); };
      });
      overlay.querySelectorAll('[data-arena-index]').forEach(btn => {
        btn.onclick = () => joinArenaCatalogTable(tables[Number(btn.dataset.arenaIndex)]);
      });
    };

    render();
  }

  function wireHomeButtons() {
    wireMetaFeatures();

    if ($q('#playNowBtn')) $q('#playNowBtn').onclick =
      () => openArenaTableLobby('classic');

    document.querySelectorAll('.room-card').forEach(btn => {
      // Classic 3 Patti now uses the same 100-table network as every variant.
      btn.onclick = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openArenaTableLobby('classic');
      };
    });

    if ($q('#navTables')) $q('#navTables').onclick =
      () => openArenaTableLobby('classic');

    if ($q('#navPlay')) $q('#navPlay').onclick =
      () => openArenaTableLobby('classic');

    if ($q('#privateBtn')) $q('#privateBtn').onclick = privateDialog;

    const modeWrap = $q('.mode-pills');
    const modes = [
      ['3 Patti','classic','Classic 3 Patti',100],
      ['Muflis','muflis','Muflis Club',100],
      ['AK47','ak47','AK47 Club',100],
      ['Joker','joker','Joker Club',100],
      ['999','999','999 Club',100],
      ['Hukam','hukam','Hukam Club',100],
      ['4X Boot','4xboot','4X Boot Club',400],
      ['6 Patti','6patti','6 Patti Tournament',500],
      ['321','321','321 Tournament',100],
      ['Sit & Go','sitgo','Sit & Go',500]
    ];

    if (modeWrap) {
      while (modeWrap.querySelectorAll('button').length < modes.length) {
        const b = document.createElement('button');
        modeWrap.appendChild(b);
      }

      const modeButtons = [...modeWrap.querySelectorAll('button')];
      modes.forEach((cfg, i) => {
        const [label, mode, room, boot] = cfg;
        let btn = modeButtons[i];
        if (!btn) return;

        // V13 FIX: old app.js can still have a legacy click listener attached
        // to these mode buttons. Replacing the node removes every old listener,
        // so a mode click can only open the 100-table lobby and cannot auto-reconnect.
        const cleanBtn = btn.cloneNode(true);
        btn.replaceWith(cleanBtn);
        btn = cleanBtn;

        btn.textContent = label;
        btn.dataset.mode = mode;
        btn.removeAttribute('data-coming');
        btn.onclick = (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          event?.stopImmediatePropagation?.();
          openArenaTableLobby(mode);
        };
      });
    }

    const modeHead = $q('.mode-head span');
    if (modeHead) modeHead.textContent = '1000 TABLE NETWORK';
  }

  async function init() {
    // IMPORTANT: activate online/mode buttons immediately.
    // Do not let auth/profile sync failures leave the old app.js
    // "coming soon" handlers attached.
    wireHomeButtons();

    try {
      await getUser();
      await syncProfileWallet();
    } catch (e) {
      console.warn('Initial profile sync failed:', e);
    }

    // Re-wire once more after async startup in case another script
    // changed an onclick handler during startup.
    wireHomeButtons();

    db.auth.onAuthStateChange(async (_event, session) => {
      online.user = session?.user || null;

      // Always keep mode/private/public handlers owned by rooms.js.
      wireHomeButtons();

      if (online.user) {
        try {
          await sleep(80);
          await syncProfileWallet();
          if (online.roomId) await setPresence(true);
        } catch (e) {
          console.warn('Auth profile sync failed:', e);
        }
      } else if (online.roomId) {
        await leaveOnlineRoom();
      }
    });

    window.addEventListener('pagehide', () => {
      if (online.roomId && online.user?.id) {
        // Fire-and-forget. Server timer still protects the round if this request is dropped.
        db.rpc('set_room_presence', {
          p_room_id: online.roomId,
          p_is_online: false
        }).catch(() => {});
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!online.roomId) return;
      if (document.visibilityState === 'visible') {
        setPresence(true);
        refreshAll();
      }
    });
  }

  init().catch(err => console.error('Online gameplay init failed:', err));
})();
