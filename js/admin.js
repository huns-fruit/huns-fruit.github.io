/* admin.js — 사장님 화면. 공용 코드는 core.js·catalog.js 에 있습니다. */

/* 공용 모듈 연결 — 손님 화면과 같은 규칙, 사장님 화면 문구만 짧게 */
var pollWorker = null;
function statusLabel(o){ return coreStatusLabel(o, true); }
function gradeChipHtml(p){ return coreGradeChip(adminGrade(p)); }

/* ── 상품 정보 ── */
function pushCatalog(doc){
  if (!sbOn()) return;
  var d = doc || readCatalog();
  if (!d.updatedAt) d.updatedAt = Date.now();
  sbCall("app_state", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: SB_CATALOG, value: {items: d.items || {}, updatedAt: d.updatedAt}, updated_at: isoAt() }])
  }).catch(function(){});
}
function pullCatalog(){
  if (!sbOn()) return Promise.resolve();
  return corePullCatalogValue().then(function(v){
    if (!v) return;
    var local = readCatalog();
    if (Number(v.updatedAt || 0) <= Number(local.updatedAt || 0)) return;
    v.updatedAt = Number(v.updatedAt || Date.now());
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(v)); } catch(e){}
    state.catalog = v.items || {};
    renderOrders();
    if (state.tab === "products") renderProducts();
  }).catch(function(){});
}


var ORDERS_PULL_LIMIT = 100;
/* 두 시간이 넘었는데도 공용 DB에 올라간 적 없는 주문 — 목록에서는 빼되 보관해 두고 되돌릴 수 있게 한다 */
var ORPHAN_MIN_AGE = 2 * 60 * 60 * 1000;
var ORPHAN_KEY = "hoonie_retail_orders_orphans_v1";
function readOrphans(){
  try { var d = JSON.parse(localStorage.getItem(ORPHAN_KEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function saveOrphans(list){
  var cur = readOrphans(), byNo = {};
  cur.forEach(function(o){ if (o && o.no) byNo[o.no] = o; });
  (list || []).forEach(function(o){ if (o && o.no) byNo[o.no] = o; });
  var out = Object.keys(byNo).map(function(k){ return byNo[k]; });
  out.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
  try { localStorage.setItem(ORPHAN_KEY, JSON.stringify(out.slice(0, 20))); } catch(e){}
}
function renderOrphanBar(){
  var box = $("#orphanBar");
  if (!box) return;
  var list = readOrphans();
  if (!list.length){ box.hidden = true; box.innerHTML = ""; return; }
  box.innerHTML = '<span>🗂 <b>공용 DB에 없는 주문 ' + list.length + '건</b>을 목록에서 뺐어요'
    + '<i>결제 실패·지운 주문이면 그대로 두시고, 손님 주문이면 되돌려 주세요.</i></span>'
    + '<div class="obtns"><button type="button" id="orphanRestore">되돌리기</button>'
    + '<button type="button" id="orphanDrop" class="drop" aria-label="안내 닫기">✕</button></div>';
  box.hidden = false;
}
function dropOrphans(){
  try { localStorage.removeItem(ORPHAN_KEY); } catch(e){}
  renderOrphanBar();
  toast("안내를 닫았어요");
}
function restoreOrphans(){
  var list = readOrphans();
  if (!list.length) return;
  var cur = readOrders();
  var byNo = {};
  cur.forEach(function(o){ if (o && o.no) byNo[o.no] = o; });
  list.forEach(function(o){
    o.keepLocal = true;                  /* 다음 조회에서 또 빠지지 않게 */
    if (!byNo[o.no]) byNo[o.no] = o;
  });
  var all = Object.keys(byNo).map(function(k){ return byNo[k]; });
  all.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
  writeOrders(all);
  try { localStorage.removeItem(ORPHAN_KEY); } catch(e){}
  renderOrders();
  renderOrphanBar();
  toast("주문 " + list.length + "건을 목록으로 되돌렸어요");
}
function pullOrders(){
  if (!sbOn()) return Promise.resolve();
  return sbCall("retail_orders?select=id,status,data&order=created_at.desc&limit=" + ORDERS_PULL_LIMIT).then(function(rows){
    rows = rows || [];
    var local = readOrders();
    var byNo = {};
    local.forEach(function(o){ byNo[o.no] = o; });
    var changed = false, dbIds = [];
    rows.forEach(function(r){
      var d = r.data || {};
      var no = d.no || r.id;
      dbIds.push(no);
      var cur = byNo[no];
      if (!cur){
        d.no = no; d.status = normStatus(r.status || d.status, d.mode);
        byNo[no] = d; changed = true;
      } else {
        var nx = r.status ? normStatus(r.status, cur.mode) : "";
        if (nx && nx !== oStatus(cur)){
          cur.status = nx; cur.statusAt = cur.statusAt || Date.now();
          /* 사장님이 취소한 경우 사유도 같이 받아 온다 */
          if (d.cancelReason) cur.cancelReason = d.cancelReason;
          if (d.cancelAt) cur.cancelAt = d.cancelAt;
          if (d.prevStatus) cur.prevStatus = d.prevStatus;
          changed = true;
        }
      }
    });
    /* 공용 DB에서 지운 주문(결제 실패·중복)은 이 기기 목록에서도 뺀다.
       DB에 올린 적이 없는 오래된 주문도 목록에서는 빼되, 지워 버리지 않고 보관해 두고
       카드 아래 안내에서 '되돌리기'를 누를 수 있게 한다(손님 주문이 통신 오류로 안 올라간 경우).
       100건을 다 받아 왔을 땐 오래된 주문을 지운 것으로 오해할 수 있어 건드리지 않는다. */
    var complete = rows.length < ORDERS_PULL_LIMIT;
    var split = splitDeletedOrders(Object.keys(byNo).map(function(k){ return byNo[k]; }), dbIds,
                                   complete ? null : [], {reconcile: complete, minAge: ORPHAN_MIN_AGE});
    var gone = split.dead.concat(split.orphans.map(function(o){ return o.no; }));
    if (split.orphans.length) saveOrphans(split.orphans);
    if (gone.length){
      gone.forEach(function(no){ delete byNo[no]; delete alarm.pending[no]; });
      changed = true;
    }
    if (!changed) return;
    var list = Object.keys(byNo).map(function(k){ return byNo[k]; });
    list.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
    writeOrders(list);
    renderOrders();
    checkNewOrders(list);
    renderOrphanBar();
  }).catch(function(){});
}
function pushOrderStatus(no, next){
  if (!sbOn()) return Promise.resolve(false);
  var list = readOrders(), found = null;
  for (var i=0;i<list.length;i++) if (list[i].no === no){ found = list[i]; break; }
  if (!found) return Promise.resolve(false);
  found.status = next;
  function send(left){
    return sbCall("retail_orders", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id: no, data: found, status: next, created_at: isoAt(found.at), updated_at: isoAt() }])
    }).then(function(){ return true; }).catch(function(){
      if (left <= 0) return false;
      /* 한 번 더 시도 — 손님 화면이 취소·진행 상태를 놓치지 않게 */
      return new Promise(function(r){ setTimeout(r, 1200); }).then(function(){ return send(left - 1); });
    });
  }
  return send(1);
}

/* ── 사진 접수 ── */
function pullClaims(){
  if (!sbOn()) return Promise.resolve();
  return sbCall("retail_claims?select=id,status,data&order=created_at.desc&limit=50").then(function(rows){
    if (!rows || !rows.length) return;
    var local = readClaims();
    var byNo = {};
    local.forEach(function(c){ byNo[c.no] = c; });
    var changed = false;
    rows.forEach(function(r){
      var d = r.data || {};
      var no = d.no || r.id;
      var cur = byNo[no];
      if (!cur){
        d.no = no; d.status = r.status || d.status || "checking";
        byNo[no] = d; changed = true;
      } else if (r.status && r.status !== (cur.status || "checking")){
        cur.status = r.status; cur.statusAt = cur.statusAt || Date.now(); changed = true;
      }
    });
    if (!changed) return;
    var list = Object.keys(byNo).map(function(k){ return byNo[k]; });
    list.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
    writeClaims(list);
    renderClaimNums();
    if (state.tab === "claims") renderClaims();
  }).catch(function(){});
}
function pushClaimStatus(no, next){
  if (!sbOn()) return Promise.resolve();
  var list = readClaims(), found = null;
  for (var i=0;i<list.length;i++) if (list[i].no === no){ found = list[i]; break; }
  if (!found) return Promise.resolve();
  found.status = next;
  return sbCall("retail_claims", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ id: no, data: found, status: next, created_at: isoAt(found.at) }])
  }).catch(function(){});
}

/* ── 새 주문 알림음 · 화면 알림 (배민 사장님앱 스타일) ─────────
   브라우저는 사장님이 한 번 눌러야 소리를 허락한다(자동재생 차단).
   5초마다 주문을 받아 오면서 처음 보는 '접수' 주문이 있으면 확인할 때까지 울린다.
   ※ 소리는 mp3 파일 없이 Web Audio로 만든다(딩동~ 딩동~). */
var ALARM_KEY    = "hoonie_retail_alarm_v1";
var RING_MS      = 12000;               /* 접수 확인 전 반복 간격 */
var ALARM_WINDOW = 30 * 60 * 1000;      /* 이보다 오래된 미확인 주문은 조용히 지나간다 */
var alarm = {
  on: false, seeded: false, ack: {}, pending: {}, ctx: null, sig: "",
  timer: null, lastRing: 0, titleTimer: null, baseTitle: document.title
};
var keepWanted = false, wakeLock = null;

function alarmRead(){
  try {
    var d = JSON.parse(localStorage.getItem(ALARM_KEY) || "{}") || {};
    alarm.on = !!d.on;
    alarm.seeded = !!d.seeded;
    if (d.ack && typeof d.ack === "object") alarm.ack = d.ack;
  } catch(e){}
}
function alarmSave(){
  try {
    var ack = alarm.ack, keys = Object.keys(ack);
    if (keys.length > 200){
      keys.sort(function(a, b){ return (ack[b] || 0) - (ack[a] || 0); });
      for (var i = 200; i < keys.length; i++) delete ack[keys[i]];
    }
    localStorage.setItem(ALARM_KEY, JSON.stringify({on: alarm.on, seeded: alarm.seeded, ack: ack}));
  } catch(e){}
}

/* ── 소리: Web Audio 차임벨 ── */
function ensureAudio(){
  try {
    if (!alarm.ctx){
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      alarm.ctx = new AC();
    }
    if (alarm.ctx.state === "suspended" && alarm.ctx.resume){
      alarm.ctx.resume().catch(function(){});
    }
    return true;
  } catch(e){ return false; }
}
function audioRunning(){ return !!(alarm.ctx && alarm.ctx.state === "running"); }
function bellAt(t0, freq, dur, vol){
  var ctx = alarm.ctx, g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(ctx.destination);
  var parts = [[1, 1], [2, 0.32], [3.01, 0.15], [4.17, 0.06]];
  for (var i = 0; i < parts.length; i++){
    var o = ctx.createOscillator(), pg = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * parts[i][0], t0);
    pg.gain.value = parts[i][1];
    o.connect(pg); pg.connect(g);
    o.start(t0); o.stop(t0 + dur + 0.06);
  }
}
function bellPattern(pairs){
  var ctx = alarm.ctx;
  if (!ctx) return;
  var base = ctx.currentTime + 0.03, n = pairs || 2;
  for (var k = 0; k < n; k++){
    var b = base + k * 0.85;          /* 딩-동~ */
    bellAt(b, 1046.50, 0.50, 0.42);
    bellAt(b + 0.20, 783.99, 0.95, 0.44);
  }
}
function playChime(pairs){
  if (!alarm.on) return;
  if (!ensureAudio()) return;
  var now = Date.now();
  if (now - alarm.lastRing < 800) return;   /* 소리 겹침 방지 */
  alarm.lastRing = now;
  var ctx = alarm.ctx;
  if (ctx.state === "suspended" && ctx.resume){
    ctx.resume().then(function(){ bellPattern(pairs); }).catch(function(){});
  } else {
    bellPattern(pairs);
  }
}
function sayOrder(){
  try {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    var u = new SpeechSynthesisUtterance("새 주문이 들어왔습니다");
    u.lang = "ko-KR"; u.rate = 1.02; u.pitch = 1.04; u.volume = 1;
    var vs = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < vs.length; i++){
      if (/^ko/i.test(vs[i].lang || "")){ u.voice = vs[i]; break; }
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch(e){}          /* 음성 미지원 브라우저에서도 벨소리는 그대로 울린다 */
}
function stopVoice(){
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e){}
}

/* ── 새 주문 감지 ── */
function pendingNos(){
  var out = [];
  for (var k in alarm.pending) if (alarm.pending[k]) out.push(k);
  return out;
}
function pendingOrders(){
  var map = {};
  state.orders.forEach(function(o){ if (o && o.no) map[o.no] = o; });
  var out = pendingNos().map(function(no){
    return map[no] || {no: no, name: "주문", total: 0, mode: "pickup"};
  });
  out.sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
  return out;
}
function renderBanner(){
  var box = $("#alarmModal");
  if (!box) return;
  var list = pendingOrders();
  if (!list.length){
    box.hidden = true; box.innerHTML = ""; alarm.sig = "";
    flashTitle(false);
    return;
  }
  var sig = list.map(function(o){ return o.no; }).join(",");
  if (sig !== alarm.sig){
    alarm.sig = sig;
    var h = '<div class="amcard" role="alertdialog" aria-live="assertive" aria-label="새 주문 알림">'
      + '<div class="amhead"><span class="bell">🔔</span>새 주문 <span class="n">' + list.length + '</span>건이 들어왔어요</div>'
      + '<div class="amitems">';
    list.forEach(function(o){
      h += '<button class="amit" type="button" data-amno="' + esc(o.no) + '" title="이 주문만 확인">'
        + '<span class="md' + (o.mode === "pickup" ? " pickup" : "") + '">' + (o.mode === "pickup" ? "🏪 포장" : "🛵 배달") + '</span>'
        + '<span class="meta"><b class="no">' + esc(o.no) + '</b> · ' + esc(o.name || "손님") + '</span>'
        + '<span class="amt">' + money(o.total || 0) + '원</span>'
        + (o.slotLabel ? '<span class="slotline">⏰ ' + esc(o.slotLabel) + (o.memo ? ' · 📝 ' + esc(o.memo) : '') + '</span>' : '')
        + ((o.depositor || (o.receiptNo && o.receiptType && o.receiptType !== "none"))
            ? '<span class="payline">' + (o.depositor ? '💰 입금자명 ' + esc(o.depositor) : '')
              + (o.depositor && o.receiptNo ? ' · ' : '')
              + (o.receiptNo && o.receiptType && o.receiptType !== "none" ? '🧾 현금영수증 ' + esc(rcptLabel(o)) + ' ' + esc(o.receiptNo) : '')
              + '</span>' : '')
        + '</button>';
    });
    h += '</div><div class="amact"><button class="ack" id="amAck" type="button">✅ 접수 확인 (알림 끄기)</button></div>'
      + '<div class="amhint">' + (alarm.on
          ? "확인을 누르기 전까지 12초마다 다시 울려요"
          : "🔕 지금은 소리가 꺼져 있어요 — 위의 알림 버튼을 누르면 소리로도 알려드려요")
      + '</div></div>';
    box.innerHTML = h;
  }
  box.hidden = false;
  flashTitle(true);
}
function markAck(no){
  if (!no) return false;
  var had = !!alarm.pending[no];
  alarm.ack[no] = Date.now();
  delete alarm.pending[no];
  alarmSave();
  return had;
}
function ackOrder(no){
  if (!no) return;
  var had = markAck(no);
  alarmSync();
  if (state.tab !== "orders") setTab("orders");
  var card = document.querySelector('.ocard[data-no="' + String(no).replace(/["\\]/g, "") + '"]');
  if (card && card.scrollIntoView) card.scrollIntoView({behavior: "smooth", block: "center"});
  if (had) toast("주문 " + no + " 접수 확인했어요");
}
function ackAll(){
  var nos = pendingNos();
  if (!nos.length) return;
  var now = Date.now();
  nos.forEach(function(no){ alarm.ack[no] = now; delete alarm.pending[no]; });
  alarmSave();
  stopRinging(); stopVoice();
  alarmSync();
  toast(nos.length + "건 접수 확인 완료 — 알림을 멈췄어요");
}
function ensureRinging(){
  if (!alarm.on || !pendingNos().length){ stopRinging(); return; }
  if (alarm.timer) return;
  alarm.timer = setInterval(function(){
    if (!pendingNos().length){ stopRinging(); return; }
    playChime();
  }, RING_MS);
}
function stopRinging(){
  if (alarm.timer){ clearInterval(alarm.timer); alarm.timer = null; }
}
function flashTitle(on){
  if (on){
    if (alarm.titleTimer) return;
    var flip = false;
    alarm.titleTimer = setInterval(function(){
      flip = !flip;
      document.title = flip ? "🔔 새 주문!" : "🔔 새 주문 " + pendingNos().length + "건";
    }, 1500);
    document.title = "🔔 새 주문!";
  } else {
    if (alarm.titleTimer) clearInterval(alarm.titleTimer);
    alarm.titleTimer = null;
    document.title = alarm.baseTitle;
  }
}
function raiseAlarm(fresh){
  if (!fresh || !fresh.length) return;
  if (alarm.on){
    playChime();
    setTimeout(sayOrder, 1900);
  }
  renderBanner();
  refreshAlarmUI();
  ensureRinging();
  if (state.tab === "orders") renderOrders();
}
function checkNewOrders(list){
  list = list || state.orders || [];
  var now = Date.now();
  if (!alarm.seeded){
    /* 처음 켠 기기: 지금까지의 주문은 '이미 본 것'으로 두고 새로 들어오는 것만 알린다 */
    alarm.seeded = true;
    list.forEach(function(o){ if (o && o.no) alarm.ack[o.no] = now; });
    alarmSave();
    refreshAlarmUI();
    return;
  }
  var fresh = [], touched = false;
  list.forEach(function(o){
    if (!o || !o.no) return;
    var st = oStatus(o);
    if (st !== "received"){
      if (!alarm.ack[o.no]){ alarm.ack[o.no] = now; touched = true; }
      if (alarm.pending[o.no]){ delete alarm.pending[o.no]; touched = true; }
      return;
    }
    if (alarm.ack[o.no]) return;
    var at = Number(o.at || 0);
    if (at && now - at > ALARM_WINDOW){ alarm.ack[o.no] = now; touched = true; return; }
    if (!alarm.pending[o.no]){ alarm.pending[o.no] = true; fresh.push(o); touched = true; }
  });
  if (touched) alarmSave();
  if (fresh.length) raiseAlarm(fresh);
  else if (pendingNos().length){ renderBanner(); refreshAlarmUI(); ensureRinging(); }
  else { refreshAlarmUI(); }
}
function alarmSync(){
  renderBanner();
  refreshAlarmUI();
  ensureRinging();
  if (state.tab === "orders") renderOrders();
}

/* ── 토글 · 화면 꺼짐 방지 ── */
function setAlarm(on, quiet){
  alarm.on = !!on;
  alarmSave();
  if (alarm.on){
    ensureAudio();
    playChime(1);                 /* 켤 때 테스트 '딩동' 한 번 */
  } else {
    stopRinging(); stopVoice(); flashTitle(false);
  }
  alarm.sig = "";            /* 알림 배너 안내문도 방금 바뀐 소리 상태로 다시 그린다 */
  renderBanner();
  refreshAlarmUI();
  ensureRinging();
  if (!quiet) toast(alarm.on ? "🔊 주문 알림음을 켰어요 (테스트 소리)" : "🔕 주문 알림음을 껐어요");
}
function refreshAlarmUI(){
  var btn = $("#alarmBtn");
  if (!btn) return;
  var n = pendingNos().length;
  btn.classList.toggle("on", alarm.on);
  btn.setAttribute("aria-pressed", alarm.on ? "true" : "false");
  if ($("#alarmIc")) $("#alarmIc").textContent = alarm.on ? "🔊" : "🔕";
  if (alarm.on){
    $("#alarmTitle").textContent = "주문 알림 켜짐";
    $("#alarmSub").textContent = "실시간 감시 중"
      + (audioRunning() ? "" : " · 🔈 눌러서 소리 켜기")
      + (n ? " · 새 주문 " + n + "건" : "");
  } else {
    $("#alarmTitle").textContent = "주문 알림 꺼짐";
    $("#alarmSub").textContent = "여기를 눌러 소리 켜기" + (n ? " · 새 주문 " + n + "건" : "");
  }
  var kb = $("#keepBtn");
  if (kb) kb.classList.toggle("on", !!wakeLock);
  if (kb) kb.textContent = wakeLock ? "☀️" : "🌙";
}
function canWake(){ return !!(navigator.wakeLock && navigator.wakeLock.request); }
function requestWake(){
  if (!canWake()){ toast("이 브라우저는 화면 꺼짐 방지를 지원하지 않아요"); return; }
  keepWanted = true;
  navigator.wakeLock.request("screen").then(function(lock){
    wakeLock = lock;
    try { lock.addEventListener("release", function(){ wakeLock = null; refreshAlarmUI(); }); } catch(e){}
    refreshAlarmUI();
    toast("☀️ 화면이 꺼지지 않게 고정했어요");
  }).catch(function(){
    keepWanted = false;
    refreshAlarmUI();
    toast("화면 꺼짐 방지를 켜지 못했어요 (화면이 보일 때만 가능)");
  });
}
function releaseWake(){
  keepWanted = false;
  if (wakeLock){ try { wakeLock.release(); } catch(e){} wakeLock = null; }
  refreshAlarmUI();
  toast("화면 꺼짐 방지를 해제했어요");
}
function toggleWake(){ if (wakeLock || keepWanted) releaseWake(); else requestWake(); }

function alarmBoot(){
  var top = document.querySelector(".top"), modal = $("#alarmModal");
  function fitBanner(){
    if (modal && top) modal.style.top = Math.max(0, top.getBoundingClientRect().bottom) + "px";
  }
  fitBanner();
  window.addEventListener("resize", fitBanner);
  if (alarm.on) ensureAudio();
  refreshAlarmUI();
  ensureRinging();
  document.addEventListener("visibilitychange", function(){
    if (document.hidden) return;
    fitBanner();
    refreshAlarmUI();
    if (keepWanted && !wakeLock) requestWake();
    if (pendingNos().length) playChime();
  });
  function unlockAudio(){
    if (alarm.on && !audioRunning()){ ensureAudio(); setTimeout(refreshAlarmUI, 220); }
  }
  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);
  checkNewOrders(state.orders);
}

function syncPullAll(){
  if (!sbOn()) return;
  /* 알림이 켜져 있으면 화면이 가려져 있어도 주문을 계속 받아 온다 */
  if (document.hidden && !alarm.on) return;
  pullCatalog();
  pullOrders();
  pullClaims();
}
function syncStart(){
  if (!sbOn()) return;
  syncPullAll();
  startPoll();
  document.addEventListener("visibilitychange", syncPullAll);
  window.addEventListener("online", syncPullAll);
}
/* 화면이 가려져도 5초 폴링이 밀리지 않도록 웹워커 타이머로 돌린다 */
function startPoll(){
  stopPoll();
  try {
    var src = "var t=0;onmessage=function(e){if(t)clearInterval(t);if(e.data>0)t=setInterval(function(){postMessage(1)},e.data);};";
    var url = URL.createObjectURL(new Blob([src], {type: "application/javascript"}));
    var w = new Worker(url);
    w.onmessage = syncPullAll;
    w.postMessage(SB_POLL_MS);
    pollWorker = w;
  } catch(e){
    sbTimer = setInterval(syncPullAll, SB_POLL_MS);
  }
}
function stopPoll(){
  if (pollWorker){ try { pollWorker.terminate(); } catch(e){} pollWorker = null; }
  if (sbTimer){ clearInterval(sbTimer); sbTimer = null; }
}








var state = {
  tab: "orders",
  filter: "all",
  cf: "all",
  q: "",
  expandedProducts: new Set(),
  catalog: {},
  orders: [],
  claims: []
};
var syncTimer = null;
var summaryHtml = '고친 내용은 이 기기 저장소에 저장돼 손님 화면과 함께 씁니다.';






function pad(n){ return String(n).padStart(2, "0"); }
function dayStr(d){
  d = d || new Date();
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}
function isToday(ts){
  if (!ts) return false;
  return dayStr(new Date(ts)) === dayStr();
}
function hhmm(ts){
  var v = tsMs(ts);
  if (!v) return "";          /* 읽을 수 없는 시각은 빈칸 — NaN:NaN 을 찍지 않는다 */
  var d = new Date(v);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function isYesterday(ts){
  if (!ts) return false;
  var d = new Date(ts), y = new Date();
  y.setDate(y.getDate() - 1);
  return dayStr(d) === dayStr(y);
}
/* 날짜 꼬리표 — 오늘·어제·11월 22일 */
function dayTag(ts){
  if (isToday(ts)) return "오늘";
  if (isYesterday(ts)) return "어제";
  var d = new Date(ts);
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
}

/* ── 저장소 ─────────────────────────────── */
function readCatalog(){
  try {
    var d = JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}");
    return (d && d.items) ? d : {items:{}, updatedAt: 0};
  } catch(e){ return {items:{}, updatedAt: 0}; }
}
function writeCatalog(doc){
  doc.updatedAt = Date.now();
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(doc)); } catch(e){}
  state.catalog = doc.items || {};
  flashSync();
  pushCatalog(doc);      /* 공용 DB에 올려 손님 화면에도 바로 반영 */
}
function patchItem(pid, patch){
  var doc = readCatalog();
  doc.items = doc.items || {};
  var it = doc.items[pid] || {};
  for (var k in patch){
    if (patch[k] === undefined) delete it[k];
    else it[k] = patch[k];
  }
  if (!Object.keys(it).length) delete doc.items[pid];
  else doc.items[pid] = it;
  writeCatalog(doc);
}
function readOrders(){
  try {
    var d = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    if (!Array.isArray(d)) return [];
    d.forEach(function(o){ if (o) o.status = oStatus(o); });   /* 예전 preparing → 새 단계 */
    return d;
  } catch(e){ return []; }
}
function writeOrders(list){
  (list || []).forEach(function(o){ if (o) o.status = oStatus(o); });
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch(e){}
  state.orders = list;
}
function flashSync(){
  var el = $("#syncbar");
  if (!el) return;
  el.innerHTML = '✅ <b>손님 화면에 바로 반영됐어요</b> · ' + hhmm(Date.now()) + ' 저장';
  el.classList.add("flash");
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function(){
    el.classList.remove("flash");
    el.innerHTML = summaryHtml;
  }, 2600);
}


function effPrice(p, oi){
  var o = ov(p.id);
  if (p.opts){
    var a = o.opts || [], v = a[oi];
    return (typeof v === "number" && v > 0) ? v : p.opts[oi].price;
  }
  return (typeof o.price === "number" && o.price > 0) ? o.price : p.price;
}
function effStock(p){
  var o = ov(p.id);
  if (typeof o.stock === "number") return o.stock;
  if (typeof p.stock === "number") return p.stock;
  return null;
}
function isSold(p){ return coreIsSold(p, effStock); }





function adminGrade(p){
  var o = ov(p.id).grade;
  return (o && GRADES[o]) ? o : (p.grade || "");
}

function gradeOpts(cur){
  var h = "";
  for (var i=0;i<GRADE_ALL.length;i++){
    var k = GRADE_ALL[i], g = GRADES[k];
    h += '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + g.name + ' · ' + g.tag + '</option>';
  }
  return h;
}

/* ── 상단 시계 ──────────────────────────── */
function tick(){
  var d = new Date();
  var days = ["일","월","화","수","목","금","토"];
  $("#today").textContent = (d.getMonth()+1) + "월 " + d.getDate() + "일 (" + days[d.getDay()] + ")";
  $("#clock").textContent = hhmm(d.getTime());
  /* 매장 영업시간 09:00~20:00 — 시간에 맞춰 영업중/영업종료 */
  var st = document.querySelector(".open");
  if (st){
    var m = d.getHours()*60 + d.getMinutes(), openNow = m >= 9*60 && m < 20*60;
    st.textContent = openNow ? "영업중" : "영업종료";
    st.classList.toggle("off", !openNow);
    st.title = "매장 영업시간 09:00~20:00";
  }
}

/* ── 주문 목록 ──────────────────────────── */
function rcptLabel(o){
  if (o.receiptType === "income") return "소득공제";
  if (o.receiptType === "expense") return "지출증빙";
  return "";
}
function payFlagsHtml(o){
  var h = "";
  if (!o) return h;
  if (o.depositor) h += '<span class="flag dep">💰 입금자명 ' + esc(o.depositor) + '</span>';
  if (o.receiptNo && o.receiptType && o.receiptType !== "none"){
    h += '<span class="flag rcpt">🧾 현금영수증 ' + esc(rcptLabel(o)) + ' ' + esc(o.receiptNo) + '</span>';
  }
  return h ? '<div class="oflags">' + h + '</div>' : "";
}



/* ── 오늘 처리할 주문 ───────────────────────────
   자정이 지나면 사라지면 안 되는 주문이 있다.
     1) 오늘 접수된 주문                             — isToday(o.at)
     2) 어제 접수해서 오늘 오전 배달·픽업 예정인 주문    — slot 이 tomorrow_am · tomorrow_pickup
     3) 아직 끝나지 않은 진행 중 주문                 — 새 주문·접수·배달 중·픽업 대기
   목록·건수에는 1~3을 모두 넣고, 매출 합계에는 '오늘 몫'(1·2)만 센다.
   (며칠 지난 진행 중 주문이 매일 매출에 다시 더해지지 않게) */
var DUE_TODAY_SLOTS = ["tomorrow_am", "tomorrow_pickup"];
function dueToday(o){
  return !!o && DUE_TODAY_SLOTS.indexOf(String(o.slot || "")) > -1;
}
/* 어제 접수 · 오늘 배달/픽업 */
function carryOver(o){
  return !!o && isYesterday(o.at) && dueToday(o);
}
function todayOrders(){
  return state.orders.filter(function(o){
    if (!o) return false;
    if (isToday(o.at)) return true;
    if (carryOver(o)) return true;
    return isLiveStatus(oStatus(o));          /* 지난 주문이라도 아직 안 끝났으면 계속 보인다 */
  });
}
/* 오늘 매출로 세는 주문인가 — 오늘 접수 또는 어제 접수·오늘 배달/픽업 */
function todayMoney(o){ return isToday(o.at) || carryOver(o); }
/* 받는 시간 — 어제 접수한 주문은 '내일'이 아니라 '오늘' 오전으로 읽히게 바꾼다 */
function slotText(o){
  var base = String(o.slotLabel || o.eta || "—");
  if (isToday(o.at)) return base;
  if (carryOver(o)) return dayTag(o.at) + " 접수 · " + base.replace(/^내일\s*/, "오늘 ");
  return dayTag(o.at) + " 접수 · " + base.replace(/^(내일|모레)\s*/, "");   /* 지난 주문엔 '내일/모레'가 틀린 말 */
}
/* 단계 칩 → 그 단계에 해당하는 주문들 */
var FILTER_ST = {
  received: ["received"], accepted: ["accepted"], delivering: ["delivering"],
  ready: ["ready"], done: ["done"], canceled: ["canceled"],
  active: ["accepted", "delivering", "ready"]
};
function filteredOrders(){
  var list = todayOrders();
  var f = state.filter;
  if (f === "delivery" || f === "pickup") list = list.filter(function(o){ return o.mode === f; });
  else if (f !== "all"){
    var set = FILTER_ST[f] || [f];
    list = list.filter(function(o){ return set.indexOf(oStatus(o)) > -1; });
  }
  return list;
}
/* ── 단골(재주문) 배지 ─────────────────────────
   같은 전화번호(숫자만 비교)로 2번 이상 주문한 손님. 취소된 주문은 빼고 센다.
   카드마다 전체 목록을 훑지 않도록 주문 목록을 그릴 때 한 번만 세어 둔다. */
var regularCounts = {};
function countRegulars(list){
  var m = {};
  (list || []).forEach(function(o){
    if (!o || oStatus(o) === "canceled") return;
    var ph = String(o.phone || "").replace(/\D/g, "");
    if (ph) m[ph] = (m[ph] || 0) + 1;
  });
  return m;
}
/* 단골 등급 5단계 — 2회 미만은 표시하지 않는다. 이 화면(사장님 페이지)에서만 보인다. */
var REG_TIERS = [
  {min: 100, cls: "lv5", tx: "💎 VVIP "},
  {min: 50,  cls: "lv4", tx: "👑 VIP "},
  {min: 10,  cls: "lv3", tx: "🏅 찐단골 "},
  {min: 5,   cls: "lv2", tx: "🌟 우수단골 "},
  {min: 2,   cls: "",    tx: "⭐ 단골 "}
];
function regularBadgeHtml(o){
  var n = regularCounts[String((o && o.phone) || "").replace(/\D/g, "")] || 0;
  for (var i = 0; i < REG_TIERS.length; i++){
    var t = REG_TIERS[i];
    if (n >= t.min) return '<span class="obadge reg' + (t.cls ? " " + t.cls : "") + '" title="같은 번호로 ' + n + '번 주문한 단골 고객">' + t.tx + n + '회</span>';
  }
  return "";
}
function orderCardHtml(o){
  var st = oStatus(o);
  var h = '<article class="ocard st-' + st + (alarm.pending[o.no] ? ' isnew' : '') + '" data-no="' + esc(o.no) + '">';
  h += '<div class="ohead"><b class="ono">' + esc(o.no) + '</b><span class="otime' + (isToday(o.at) ? '' : ' prev') + '">' + esc((isToday(o.at) ? '' : dayTag(o.at) + ' ') + (o.time || hhmm(o.at))) + '</span>'
    +  '<span class="obadge ' + (o.mode === "pickup" ? "pickup" : "delivery") + '">' + (o.mode === "pickup" ? "🏪 포장" : "🛵 배달") + '</span>'
    +  '<span class="ost ' + st + '">' + statusLabel(o) + '</span></div>';
  h += '<div class="orows">'
    + '<div class="orow"><span>받는 시간</span><b class="slot">' + esc(slotText(o)) + '</b></div>'
    + '<div class="orow"><span>고객</span><b>' + esc(o.name) + ' · ' + esc(o.phone) + '</b>' + regularBadgeHtml(o) + '</div>'
    + payFlagsHtml(o)
    + (o.mode === "delivery"
        ? '<div class="orow"><span>배달 주소</span><b>' + esc(o.addr || "—") + '</b></div>'
          + (o.gate ? '<div class="orow gate"><span>🔑 현관 비번</span><b>' + esc(o.gate) + '</b></div>' : '')
        : '<div class="orow"><span>수령 장소</span><b>매장(단구로 398 상가동 101호)</b></div>')
    + '</div>';
  h += '<div class="oitems">';
  (o.items || []).forEach(function(it){
    var unit = esc(it.unit || '');
    var optTxt = it.opt ? (it.unit && it.opt.indexOf(it.unit) > -1 ? ' · ' + esc(it.opt) : ' ' + unit + ' · ' + esc(it.opt)) : (unit ? ' ' + unit : '');
    h += '<div class="oit"><span class="n"><b>' + esc(it.name) + '</b>'
      + optTxt + ' × ' + it.qty + '</span>'
      + '<span class="p">' + money(it.sum) + '원</span></div>';
  });
  h += '</div>';
  if (o.memo) h += '<div class="omemo">📝 ' + esc(o.memo) + '</div>';
  h += '<div class="osum"><span>상품 ' + money(o.sub) + '원</span>'
    + (o.disc > 0 ? '<span class="disc">포장 할인 -' + money(o.disc) + '원</span>' : '')
    + '<span>' + esc(o.pay || "결제") + (o.pay ? '' : '') + '</span>'
    + '<b class="tot">결제 ' + money(o.total) + '원</b></div>';
  /* 이 주문만 영수증 한 장 인쇄 */
  h += '<div class="orcpt"><button type="button" data-rcpt="' + esc(o.no) + '" title="이 주문 영수증 인쇄">🖨️ 영수증</button></div>';
  if (st === "canceled"){
    h += '<div class="ocx"><b>❌ 취소된 주문</b>'
      + '<span>사유: ' + esc(o.cancelReason || "기타") + (hhmm(o.cancelAt) ? ' · ' + esc(hhmm(o.cancelAt)) : '') + '</span></div>';
  }
  var pick = o.mode === "pickup";
  var step3 = pick ? "ready" : "delivering";
  var back = (st === "canceled" && o.prevStatus && isLiveStatus(o.prevStatus)) ? o.prevStatus : "received";
  h += '<div class="oacts">';
  if (st === "received"){
    h += '<button class="primary" data-act="accepted">접수하기</button>';
  } else if (st === "accepted"){
    h += '<button class="primary" data-act="' + step3 + '">' + (pick ? "포장 준비 완료" : "배달 출발") + '</button>'
      +  '<button class="ghost" data-act="received">되돌리기</button>';
  } else if (st === "delivering" || st === "ready"){
    h += '<button class="primary" data-act="done">' + (pick ? "픽업 완료" : "배달 완료") + '</button>'
      +  '<button class="ghost" data-act="accepted">되돌리기</button>';
  } else if (st === "canceled"){
    h += '<button class="ghost" data-act="' + back + '">↺ 주문 되돌리기</button>';
  } else {
    h += '<button class="done" disabled>✓ ' + (pick ? "픽업 완료" : "배달 완료") + '</button>'
      +  '<button class="ghost" data-act="' + step3 + '">되돌리기</button>';
  }
  h += '</div>';
  /* 진행 중인 주문(접수·배달·픽업 전)에는 주문 취소 버튼 */
  if (isLiveStatus(st)){
    h += '<div class="oacts cx"><button class="danger" data-cancel="' + esc(o.no) + '">✕ 주문 취소</button></div>';
  }
  h += '</article>';
  return h;
}
function renderOrders(){
  var today = todayOrders();
  regularCounts = countRegulars(state.orders);
  $("#tabOrderNum").textContent = today.length;
  var sales = 0, wait = 0;
  today.forEach(function(o){
    if (oStatus(o) === "canceled") return;      /* 취소된 주문은 매출·준비 건수에서 뻔다 */
    if (todayMoney(o)) sales += Number(o.total || 0);   /* 어제 접수·오늘 배달은 오늘 매출로 */
    if (oStatus(o) !== "done") wait++;
  });
  $("#sumCount").textContent = today.length + "건";
  $("#sumSales").textContent = money(sales) + "원";
  $("#sumWait").textContent = wait + "건";

  var cnt = {all: today.length, received: 0, accepted: 0, delivering: 0, ready: 0, done: 0, canceled: 0, active: 0, delivery: 0, pickup: 0};
  today.forEach(function(o){
    var st = oStatus(o);
    cnt[st] = (cnt[st] || 0) + 1;
    if (st !== "received" && st !== "done") cnt.active++;
    cnt[o.mode] = (cnt[o.mode] || 0) + 1;
  });
  $$("#filters button").forEach(function(b){
    var f = b.getAttribute("data-f");
    var em = b.querySelector("em");
    if (em) em.textContent = cnt[f] || 0;
    b.classList.toggle("on", f === state.filter);
  });

  var list = filteredOrders();
  var printList = list.filter(function(o){ return oStatus(o) !== "canceled"; });
  renderPrintBar(printList.length);
  var box = $("#orderList");
  if (!list.length){
    box.innerHTML = '<div class="oempty"><span class="em">🧾</span><b>' + (today.length ? "이 조건에 맞는 주문이 없어요" : "오늘 들어온 주문이 없어요") + '</b>'
      + '손님 화면에서 주문하면 여기에 바로 들어와요.'
      + '</div>';
    return;
  }
  box.innerHTML = list.map(orderCardHtml).join("");
}

/* ── 영수증 인쇄 ───────────────────────────────────────────
   주문 카드의 ‘🖨️ 영수증’ 또는 목록 위 ‘오늘 주문 영수증 인쇄’로 인쇄 창을 연다.
   주문 1건 = 한 장(80mm 영수증 프린터), A4는 두 칸으로 나눠 뽑을 수 있다.
   사업자 정보는 core.js 의 STORE 한 곳에서만 가져와 화면마다 달라지지 않게 한다. */
function renderPrintBar(n){
  var tx = $("#printAllTx"), num = $("#printAllNum"), btn = $("#printAll");
  if (tx) tx.textContent = state.filter === "all" ? "🖨️ 오늘 주문 영수증 인쇄" : "🖨️ 이 목록 영수증 인쇄";
  if (num) num.textContent = n;
  if (btn) btn.disabled = !n;
}
function rcptWhen(o){
  var v = tsMs(o && o.at);
  if (!v) return "—";
  var d = new Date(v);
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate())
    + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function rcptPhone(p){
  var d = String(p || "").replace(/\D/g, "");
  if (d.length === 11) return d.slice(0,3) + "-" + d.slice(3,7) + "-" + d.slice(7);
  if (d.length === 10) return d.slice(0,3) + "-" + d.slice(3,6) + "-" + d.slice(6);
  return String(p || "");
}
function rcptLine(label, val, cls){
  return '<div class="rl' + (cls ? " " + cls : "") + '"><span>' + label + '</span><b>' + val + '</b></div>';
}
function receiptInnerHtml(o){
  var st = oStatus(o), pick = o.mode === "pickup";
  var its = o.items || [], sum = 0, i;
  for (i = 0; i < its.length; i++) sum += Number(its[i].sum) || 0;
  var disc = Number(o.disc) || 0, total = Number(o.total) || 0;
  var h = '<section class="receipt">';
  h += '<div class="rhead"><b class="rstore">' + esc(STORE.name) + ' <i>' + esc(STORE.branch) + '</i></b>'
    + (st === "canceled" ? '<span class="rcx">취소된 주문 · ' + esc(o.cancelReason || "기타") + '</span>' : '')
    + '</div>';
  h += '<div class="rbiz">사업자등록번호 ' + esc(STORE.biz) + ' · 대표 ' + esc(STORE.owner) + '</div>'
    + '<div class="rbiz">TEL ' + esc(STORE.tel) + '</div>'
    + '<div class="rbiz">' + esc(STORE.addr) + '</div>'
    + '<div class="rbiz">통신판매업 ' + esc(STORE.mailorder) + '</div>';
  h += '<div class="rsep"></div>';
  h += rcptLine("주문번호", esc(o.no));
  h += rcptLine("주문일시", esc(rcptWhen(o)));
  h += rcptLine("수령방식", pick ? "🏪 포장 (매장 픽업)" : "🛵 배달");
  h += rcptLine("희망일시", esc(slotText(o)));
  h += rcptLine("진행상태", esc(statusLabel(o)));
  h += '<div class="rsep"></div>';
  h += rcptLine("고객명", esc(o.name || "—"));
  h += rcptLine("연락처", esc(rcptPhone(o.phone)));
  if (pick){
    h += rcptLine("수령장소", esc(STORE.addr));
  } else {
    h += rcptLine("배달주소", esc(o.addr || "—"));
    var gate = String(o.gate || "").trim();
    /* ‘없음’·‘-’ 같은 빈 값은 영수증에 찍지 않는다 */
    if (gate && !/^(없음|-|없어요|없습니다)$/.test(gate)) h += rcptLine("공동현관", esc(gate), "gate");
  }
  if (o.memo) h += rcptLine("요청사항", esc(o.memo));
  h += '<div class="rsep"></div>';
  h += '<table class="ritems"><thead><tr><th class="nm">품목</th><th class="q">수량</th><th class="u">단가</th><th class="s">금액</th></tr></thead><tbody>';
  if (!its.length) h += '<tr><td class="nm" colspan="4">품목 없음</td></tr>';
  for (i = 0; i < its.length; i++){
    var it = its[i];
    var unit = it.unit ? String(it.unit) : "";
    var opt = (it.opt && it.opt !== unit) ? String(it.opt) : "";
    var spec = unit + (opt ? (unit ? " · " : "") + opt : "");
    var qty = Number(it.qty) || 1;
    var price = Number(it.price);
    if (!isFinite(price) || price <= 0) price = Math.round((Number(it.sum) || 0) / qty);
    h += '<tr><td class="nm">' + esc(it.name || "")
      + (spec ? ' <i>' + esc(spec) + '</i>' : '') + '</td>'
      + '<td class="q">' + qty + '</td>'
      + '<td class="u">' + money(price) + '</td>'
      + '<td class="s">' + money(Number(it.sum) || 0) + '</td></tr>';
  }
  h += '</tbody></table>';
  h += '<div class="rtot">'
    + '<div class="tr"><span>상품합계</span><b>' + money(sum) + '원</b></div>'
    + '<div class="tr"><span>배달비</span><b>무료</b></div>'
    + (disc > 0 ? '<div class="tr"><span>할인</span><b>-' + money(disc) + '원</b></div>' : '')
    + '<div class="tr grand"><span>총 결제금액</span><b>' + money(total) + '원</b></div>'
    + '</div>';
  var pay = String(o.pay || "무통장입금");
  h += '<div class="rpay"><span>결제수단</span><b>' + esc(pay) + '</b></div>';
  if (pay.indexOf("무통장") > -1)
    h += '<div class="rpay sub"><span></span><i>NH농협은행 302-1803-5017-81 (예금주 황관훈)</i></div>';
  h += '<div class="rpay"><span>입금자명</span><b>' + esc(o.depositor || "—") + '</b></div>';
  h += '<div class="rpay"><span>현금영수증</span><b>'
    + (o.receiptNo && o.receiptType && o.receiptType !== "none" ? esc(rcptLabel(o)) + ' ' + esc(o.receiptNo) : '미신청')
    + '</b></div>';
  h += '<div class="rfoot">주문해 주셔서 감사합니다</div>'
    + '<div class="rnote">' + esc(STORE.name) + ' ' + esc(STORE.branch) + ' · 문의 ' + esc(STORE.tel) + '</div>';
  h += '</section>';
  return h;
}
var RCPT_CSS = [
  '*{box-sizing:border-box}',
  'html,body{margin:0;padding:0}',
  'body{background:#E9EDF0;color:#111;font-family:Pretendard,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.toolbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#fff;border-bottom:1px solid #DDE1E4}',
  '.toolbar button{height:42px;padding:0 16px;border-radius:10px;font-size:14px;font-weight:800;border:1px solid #DDE1E4;background:#fff;color:#333;cursor:pointer}',
  '.toolbar .go{background:#2AC1BC;border-color:#2AC1BC;color:#fff}',
  '.toolbar .hint{flex:1 1 100%;margin:0;font-size:12px;color:#6B7075;line-height:1.5}',
  '.sheet{width:80mm;margin:14px auto 26px}',
  '.receipt{position:relative;width:80mm;background:#fff;padding:5mm 4mm;margin:0 0 12px;box-shadow:0 2px 10px rgba(0,0,0,.09);font-size:11px;line-height:1.45;letter-spacing:-.1px;page-break-after:always;break-after:page}',
  '.receipt:last-child{page-break-after:auto;break-after:auto}',
  '.rhead{text-align:center}',
  '.rstore{display:block;font-size:18px;font-weight:800;letter-spacing:-.7px}',
  '.rstore i{font-style:normal;font-size:12px;font-weight:800;color:#12A39E}',
  '.rcx{display:block;margin-top:3px;font-size:11px;font-weight:800;color:#B3342B}',
  '.rbiz{text-align:center;font-size:9.5px;color:#444;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere}',
  '.rsep{border-top:1px dashed #9AA0A6;margin:5px 0}',
  '.rl{display:flex;gap:6px;font-size:10.5px;line-height:1.55}',
  '.rl>span{flex:0 0 54px;color:#666;font-weight:700}',
  '.rl>b{flex:1 1 auto;min-width:0;font-weight:800;word-break:keep-all;overflow-wrap:anywhere}',
  '.rl.gate>b{color:#B3342B}',
  '.ritems{width:100%;border-collapse:collapse;margin-top:2px;font-size:10.5px;table-layout:fixed}',
  '.ritems th{font-size:9px;color:#666;font-weight:800;text-align:right;padding:0 0 3px;border-bottom:1px solid #CCC}',
  '.ritems th.nm{text-align:left;width:46%}',
  '.ritems th.q{width:11%}',
  '.ritems th.u{width:21%}',
  '.ritems th.s{width:22%}',
  '.ritems td{padding:3px 0;vertical-align:top;border-bottom:1px dotted #E3E6E8}',
  '.ritems td.nm{text-align:left;word-break:keep-all;overflow-wrap:anywhere}',
  '.ritems td.nm i{font-style:normal;color:#666;font-size:9.5px}',
  '.ritems td.q,.ritems td.u,.ritems td.s{text-align:right;white-space:nowrap;padding-left:3px}',
  '.ritems td.s{font-weight:800}',
  '.ritems tr.ev td{background:#FFFBEA}',
  '.rtot{margin-top:4px;font-size:10.5px}',
  '.rtot .tr{display:flex;justify-content:space-between;gap:8px;padding:1.5px 0}',
  '.rtot .tr span{color:#555}',
  '.rtot .tr b{font-weight:800}',
  '.rtot .grand{margin-top:3px;padding-top:4px;border-top:1.5px solid #222}',
  '.rtot .grand span{font-size:12px;font-weight:800;color:#111}',
  '.rtot .grand b{font-size:15px;letter-spacing:-.4px}',
  '.rpay{display:flex;gap:6px;margin-top:3px;font-size:10px;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere}',
  '.rpay span{flex:0 0 54px;color:#666;font-weight:700}',
  '.rpay b{flex:1 1 auto;min-width:0;font-weight:800}',
  '.rpay.sub{margin-top:-1px}',
  '.rpay i{font-style:normal;color:#555;font-size:9.5px;flex:1 1 auto;min-width:0}',
  '.rfoot{margin-top:7px;text-align:center;font-size:10.5px;font-weight:800;color:#333}',
  '.rnote{margin-top:2px;text-align:center;font-size:9px;color:#777}',
  'html.a4 .sheet{width:auto;max-width:196mm;margin:14px auto;display:grid;grid-template-columns:1fr 1fr;gap:6mm;align-items:start}',
  'html.a4 .receipt{width:auto;padding:4mm;margin:0;border:1px dashed #C9CDD1;box-shadow:none;page-break-after:auto;break-after:auto;page-break-inside:avoid;break-inside:avoid}',
  '@page{size:80mm auto;margin:3mm 2mm}',
  '@media print{',
  '  body{background:#fff}',
  '  .no-print{display:none!important}',
  '  .sheet{width:auto;max-width:none;margin:0;display:block}',
  '  .receipt{width:76mm;margin:0 auto;padding:0;box-shadow:none;border:0;page-break-after:always;break-after:page}',
  '  .receipt:last-child{page-break-after:auto;break-after:auto}',
  '  html.a4 .sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm}',
  '  html.a4 .receipt{width:auto;margin:0;padding:3mm;border:1px dashed #C9CDD1;page-break-after:auto;break-after:auto;page-break-inside:avoid;break-inside:avoid}',
  '}'
].join("\n");
function receiptDocHtml(list, title){
  var body = list.map(receiptInnerHtml).join("");
  if (!body) body = '<section class="receipt"><div class="rhead"><b class="rstore">인쇄할 주문이 없습니다</b></div></section>';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + esc(title) + '</title><style>' + RCPT_CSS + '</style></head><body>'
    + '<div class="toolbar no-print">'
    + '<button class="go" id="rcptPrint" type="button">🖨️ 인쇄 / PDF 저장</button>'
    + '<button id="rcptA4" type="button">A4 두 칸</button>'
    + '<button id="rcptClose" type="button">닫기</button>'
    + '<p class="hint">영수증 프린터(80mm)는 그대로 인쇄하세요 · A4로 뽑을 때는 ‘A4 두 칸’을 누르고 인쇄 · ' + list.length + '장</p>'
    + '</div><div class="sheet">' + body + '</div>'
    + '<script>'
    + 'document.getElementById("rcptPrint").onclick=function(){window.print();};'
    + 'document.getElementById("rcptA4").onclick=function(){document.documentElement.classList.toggle("a4");};'
    + 'document.getElementById("rcptClose").onclick=function(){window.close();};'
    + '</scr' + 'ipt></body></html>';
}
/* 인쇄 창을 열고 영수증을 그린다. 팝업이 막히면 이 화면의 iframe으로 인쇄한다. */
function openReceiptWindow(list){
  if (!list || !list.length){ toast("인쇄할 주문이 없어요"); return; }
  var sorted = list.slice().sort(function(a, b){ return (tsMs(a.at) || 0) - (tsMs(b.at) || 0); });
  var title = STORE.name + " " + STORE.branch + " 주문 영수증 " + sorted.length + "장 · " + dayStr();
  var html = receiptDocHtml(sorted, title);
  var w = null;
  try { w = window.open("", "_blank"); } catch(e){ w = null; }
  if (w){
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      try { w.focus(); } catch(e){}
      toast("영수증 " + sorted.length + "장을 열었어요 · 인쇄 버튼을 누르세요");
      return;
    } catch(e){}
  }
  printReceiptFallback(html);
}
function printReceiptFallback(html){
  var f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.setAttribute("title", "영수증 인쇄");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(f);
  try {
    var d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
    d.open(); d.write(html); d.close();
  } catch(e){ toast("영수증 창을 열지 못했어요 · 팝업 차단을 풀어 주세요"); return; }
  setTimeout(function(){
    try { f.contentWindow.focus(); f.contentWindow.print(); toast("인쇄 창을 열었어요"); }
    catch(e){ toast("영수증 창을 열지 못했어요 · 팝업 차단을 풀어 주세요"); }
    setTimeout(function(){ if (f.parentNode) f.parentNode.removeChild(f); }, 60000);
  }, 350);
}
function printOrderReceipt(no){
  var list = state.orders, found = null;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].no === no){ found = list[i]; break; }
  if (!found){ toast("주문을 찾지 못했어요 · 새로고침해 주세요"); return; }
  openReceiptWindow([found]);
}
/* 목록 위 일괄 인쇄 — 지금 필터에 보이는 주문 중 취소된 주문만 뺀다 */
function printAllReceipts(){
  var list = filteredOrders().filter(function(o){ return oStatus(o) !== "canceled"; });
  if (!list.length){
    toast(state.filter === "canceled" ? "취소된 주문은 영수증을 뽑지 않아요" : "지금 인쇄할 주문이 없어요");
    return;
  }
  openReceiptWindow(list);
}
function setStatus(no, next){
  if (next !== "received") markAck(no);   /* 상태를 바꾸면 새 주문 알림은 끝난 것 */
  var TOAST = {received: "새 주문으로 되돌렸어요", accepted: "접수했어요 · 손님 화면에 ‘주문 접수’로 보여요",
               delivering: "배달 출발로 바꿨어요 · 손님 화면에 ‘🚚 배달 시작’",
               ready: "포장 준비 완료 · 손님 화면에 ‘🛍️ 픽업 가능’",
               done: "완료 처리했어요 · 손님 화면에 바로 보여요",
               canceled: "주문을 취소했어요 · 손님 화면에 ‘❌ 주문 취소’로 보여요"};
  var list = readOrders();
  for (var i=0;i<list.length;i++){
    if (list[i].no === no){
      list[i].status = next;
      list[i].statusAt = Date.now();
      if (next !== "canceled") clearCancelFields(list[i]);   /* 취소를 물리면 취소 기록도 지운다 */
      break;
    }
  }
  writeOrders(list);
  pushOrderStatus(no, next);
  renderOrders();
  renderBanner(); refreshAlarmUI(); ensureRinging();
  toast(TOAST[next] || "상태를 바꿨어요");
}

/* ── 주문 취소 (사장님) ─────────────────────────────
   진행 중인 주문 카드의 ‘주문 취소’ → 사유를 고르면 canceled 로 바뀌고
   취소 사유·취소 시각·되돌릴 상태(prevStatus)를 주문에 함께 저장한다.
   손님 화면은 5초 폴링으로 status=’canceled’ 를 받아 바로 취소 화면으로 바뀐다. */
function cancelOrder(no, reason){
  var list = readOrders(), found = null;
  for (var i=0;i<list.length;i++) if (list[i].no === no){ found = list[i]; break; }
  if (!found) return;
  var prev = oStatus(found);
  if (!isLiveStatus(prev)) return;            /* 완료·이미 취소된 주문은 취소 불가 */
  found.prevStatus = prev;
  found.status = "canceled";
  found.cancelReason = reason || "기타";
  found.cancelAt = Date.now();
  found.statusAt = Date.now();
  writeOrders(list);
  markAck(no);                 /* 새 주문 알림이 울리던 중이면 취소와 함께 멈춘다 */
  pushOrderStatus(no, "canceled").then(function(ok){
    if (!ok) toast("⚠️ 공용 DB에 취소를 못 올렸어요 · 손님 화면에 안 보이면 다시 취소해 주세요");
  });
  closeCancel();
  renderOrders();
  alarmSync();
  toast("주문을 취소했어요 · 손님 화면에 ‘❌ 주문 취소’로 보여요");
}
function openCancel(no){
  var list = readOrders(), found = null;
  for (var i=0;i<list.length;i++) if (list[i].no === no){ found = list[i]; break; }
  if (!found) return;
  var pick = found.mode === "pickup";
  var h = '<div class="cxcard" role="dialog" aria-modal="true" aria-labelledby="cxTitle">'
    + '<div class="cxhead" id="cxTitle">✕ 주문을 취소할까요?</div>'
    + '<div class="cxwho"><b>' + esc(found.no) + '</b> · ' + esc(found.name || "손님") + ' · '
    +   (pick ? "🏪 포장" : "🛵 배달") + ' · ' + money(found.total || 0) + '원</div>'
    + '<p class="cxp">취소하면 손님 화면에 <b>❌ 주문 취소</b>로 바로 보입니다. 취소 사유를 골라 주세요.</p>'
    + '<div class="cxopts">';
  CANCEL_REASONS.forEach(function(r){
    h += '<button type="button" data-cx="' + esc(r) + '" data-cxno="' + esc(found.no) + '">' + esc(r) + '</button>';
  });
  h += '</div><div class="cxact"><button type="button" class="cxno" id="cxClose">그만두기</button></div>'
    + '<div class="cxhint">잘못 눌렀다면 취소된 주문 카드에서 <b>↺ 주문 되돌리기</b>를 누르면 됩니다.</div>'
    + '</div>';
  var box = $("#cxModal");
  if (!box) return;
  box.innerHTML = h;
  box.hidden = false;
}
function closeCancel(){
  var box = $("#cxModal");
  if (!box) return;
  box.hidden = true; box.innerHTML = "";
}

/* ── 사진 접수 ──────────────────────────── */
function readClaims(){
  try { var d = JSON.parse(localStorage.getItem(CLAIM_KEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function writeClaims(list){
  try { localStorage.setItem(CLAIM_KEY, JSON.stringify(list.slice(0, 12))); } catch(e){}
  state.claims = list;
}
function cStatusLabel(c){
  if (!c) return "";
  if (c.status === "done") return "보상 완료";
  if (c.status === "rejected") return "반려";
  return "확인중";
}
function filteredClaims(){
  var f = state.cf;
  if (f === "all") return state.claims;
  return state.claims.filter(function(c){ return (c.status || "checking") === f; });
}
function claimCardHtml(c){
  var st = c.status || "checking";
  var h = '<article class="ccard st-' + st + '" data-cno="' + esc(c.no) + '">';
  h += '<div class="chead"><b class="cno">' + esc(c.no) + '</b><span class="ctime">' + esc(c.time || hhmm(c.at)) + '</span>'
    + '<span class="cst ' + st + '">' + cStatusLabel(c) + '</span></div>';
  h += '<div class="orows">'
    + '<div class="orow"><span>품목</span><b>' + esc(c.itemLabel || "—") + '</b></div>'
    + '<div class="orow"><span>사유</span><b>' + esc(c.reason || "—") + '</b></div>'
    + (c.orderNo ? '<div class="orow"><span>주문</span><b>' + esc(c.orderNo) + '</b></div>' : '')
    + '<div class="orow"><span>고객</span><b>' + esc(c.name || "—") + ' · ' + esc(c.phone || "—") + '</b></div>'
    + '</div>';
  if (c.photos && c.photos.length){
    h += '<div class="cphotos">';
    for (var i=0;i<c.photos.length;i++){
      h += '<button data-photo="' + i + '" aria-label="사진 ' + (i+1) + ' 크게 보기"><img src="' + esc(c.photos[i]) + '" alt="접수 사진 ' + (i+1) + '"></button>';
    }
    h += '</div>';
  } else {
    h += '<p class="cnopic">사진이 저장되지 않은 접수예요 · 손님께 다시 받아 주세요</p>';
  }
  if (c.memo) h += '<div class="omemo">📝 ' + esc(c.memo) + '</div>';
  h += '<div class="oacts">';
  if (st === "checking"){
    h += '<button class="primary" data-cact="done">보상 완료</button>'
      +  '<button class="ghost" data-cact="rejected">반려</button>';
  } else {
    h += '<button class="done" disabled>✓ ' + cStatusLabel(c) + '</button>'
      +  '<button class="ghost" data-cact="checking">확인중으로</button>';
  }
  h += '</div></article>';
  return h;
}
function renderClaimNums(){
  var wait = 0, done = 0;
  state.claims.forEach(function(c){
    var st = c.status || "checking";
    if (st === "checking") wait++;
    if (st === "done") done++;
  });
  var n = $("#tabClaimNum");
  if (n) n.textContent = wait;
  if ($("#clWait")){
    $("#clWait").textContent = wait + "건";
    $("#clDone").textContent = done + "건";
    $("#clAll").textContent = state.claims.length + "건";
  }
}
function renderClaims(){
  renderClaimNums();
  var cnt = {all: state.claims.length, checking: 0, done: 0, rejected: 0};
  state.claims.forEach(function(c){
    var st = c.status || "checking";
    cnt[st] = (cnt[st] || 0) + 1;
  });
  $$("#clFilters button").forEach(function(b){
    var f = b.getAttribute("data-cf");
    var em = b.querySelector("em");
    if (em) em.textContent = cnt[f] || 0;
    b.classList.toggle("on", f === state.cf);
  });
  var box = $("#claimList");
  if (!box) return;
  var list = filteredClaims();
  if (!list.length){
    box.innerHTML = '<div class="oempty"><span class="em">📷</span><b>' + (state.claims.length ? "이 조건에 맞는 접수가 없어요" : "아직 사진 접수가 없어요") + '</b>'
      + '손님 화면에서 ‘사진 접수’를 누르면 여기에 들어옵니다.</div>';
    return;
  }
  box.innerHTML = list.map(claimCardHtml).join("");
}
function setClaimStatus(no, next){
  var list = readClaims();
  for (var i=0;i<list.length;i++){
    if (list[i].no === no){
      list[i].status = next;
      list[i].statusAt = Date.now();
      break;
    }
  }
  writeClaims(list);
  pushClaimStatus(no, next);
  renderClaims();
  toast(next === "done" ? "보상 완료로 처리했어요" : (next === "rejected" ? "반려로 처리했어요" : "확인중으로 되돌렸어요"));
}

/* ── 상품 관리 ──────────────────────────── */
function prodMatches(p){
  var q = state.q.trim().toLowerCase();
  if (!q) return true;
  var hay = p.name + " " + p.unit + " " + (p.origin || "") + " " + (p.desc || "") + " " + (p.tags || []).join(" ");
  return hay.toLowerCase().indexOf(q) > -1;
}
function prodRowHtml(p){
  var sold = isSold(p), stock = effStock(p), cmt = ov(p.id).comment || "";
  var low = (!sold && stock !== null && stock <= 5) ? '<span class="low' + (stock <= 2 ? '' : ' soon') + '">오늘 ' + stock + unitWord(p) + ' 남음</span>' : '';
  var expanded = state.expandedProducts.has(p.id);
  var h = '<div class="prow' + (sold ? ' sold' : '') + '" data-pid="' + p.id + '">';
  h += '<div class="th">' + thumb(p) + (sold ? '<span class="so">품절</span>' : '') + '</div>';
  h += '<div class="pbody"><div class="pname"><b>' + esc(p.name) + '</b><small>' + esc(p.unit) + '</small>'
    + (sold ? '<span class="low soldtag">품절</span>' : '') + low + gradeChipHtml(p) + '</div>';
  h += '<div class="pctl">';
  if (p.opts){
    h += '<button class="pexpand" data-expand="' + p.id + '" aria-controls="product-options-' + p.id + '" aria-expanded="' + expanded + '">옵션 ' + p.opts.length + '개 가격</button>';
  } else {
    h += '<span class="pfield"><label>가격</label><input type="number" inputmode="numeric" data-price="' + p.id + '" value="' + effPrice(p, 0) + '" aria-label="' + esc(p.name) + ' 가격"><em>원</em></span>';
  }
  h += '<span class="pfield"><label>남은 수량</label><input type="number" inputmode="numeric" data-stock="' + p.id + '" value="' + (stock === null ? "" : stock) + '" placeholder="—" aria-label="' + esc(p.name) + ' 남은 수량"><em>' + unitWord(p) + '</em></span>';
  h += '<button class="ptoggle' + (sold ? ' off' : '') + '" data-sold="' + p.id + '" aria-pressed="' + (sold ? 'true' : 'false') + '">'
    + (sold ? '품절 해제' : '판매중') + '</button>';
  if (p.grade){
    h += '<span class="pfield gfield"><label>등급</label><select data-grade="' + p.id + '" aria-label="' + esc(p.name) + ' 등급">'
      + gradeOpts(adminGrade(p)) + '</select></span>';
  }
  h += '</div>';
  if (p.opts){
    h += '<div class="popts" id="product-options-' + p.id + '"' + (expanded ? '' : ' hidden') + '>';
    for (var i=0;i<p.opts.length;i++){
      h += '<div class="popt"><span class="ol">' + esc(p.opts[i].label) + '</span>'
        +  '<span class="pfield"><input type="number" inputmode="numeric" data-opt="' + p.id + '" data-oi="' + i + '" value="' + effPrice(p, i) + '" aria-label="' + esc(p.name) + ' ' + esc(p.opts[i].label) + ' 가격"><em>원</em></span></div>';
    }
    h += '</div>';
  }
  h += '<input class="pcmt" type="text" data-comment="' + p.id + '" value="' + esc(cmt) + '" maxlength="60" placeholder="사장님 한 줄 코멘트 (예: 오늘 새벽에 들어왔어요)" aria-label="' + esc(p.name) + ' 코멘트">';
  h += '</div></div>';
  return h;
}
/* 입/블러·클릭 이벤트 중에 innerHTML 을 갈아치우면 방금 누른 버튼이 사라지므로 한 박자 늦춘다 */
function deferRender(){ setTimeout(renderProducts, 0); }
function renderProducts(){
  var visible = PRODUCTS.filter(function(p){ return !p.endsOnSale || productAvailable(p); });
  var list = visible.filter(prodMatches);
  $("#prodList").innerHTML = list.map(prodRowHtml).join("");
  var soldN = 0, lowN = 0;
  visible.forEach(function(p){
    if (isSold(p)) soldN++;
    else { var s = effStock(p); if (s !== null && s <= 5) lowN++; }
  });
  var base = '<b>손님 화면에 바로 반영</b>됩니다.';
  summaryHtml = (state.q ? list.length + '종 찾음 · ' : '')
    + (soldN ? '품절 ' + soldN + '종 · ' : '') + (lowN ? '임박 ' + lowN + '종 · ' : '')
    + base;
  $("#syncbar").innerHTML = summaryHtml;
}

/* ── 탭 ────────────────────────────────── */
function setTab(t){
  state.tab = t;
  $$("#tabs button").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-tab") === t); });
  $("#tabOrders").hidden = t !== "orders";
  $("#tabClaims").hidden = t !== "claims";
  $("#tabProducts").hidden = t !== "products";
  if (t === "orders") renderOrders();
  else if (t === "claims") renderClaims();
  else renderProducts();
  window.scrollTo(0, 0);
}

/* ── 이벤트 ─────────────────────────────── */
function bind(){
  $("#alarmBtn").addEventListener("click", function(){ setAlarm(!alarm.on); });
  $("#keepBtn").addEventListener("click", toggleWake);
  $("#alarmModal").addEventListener("click", function(e){
    var row = e.target.closest("[data-amno]");
    if (row){ ackOrder(row.getAttribute("data-amno")); return; }
    if (e.target.closest("#amAck")) ackAll();
  });
  $("#tabs").addEventListener("click", function(e){
    var b = e.target.closest("[data-tab]");
    if (b) setTab(b.getAttribute("data-tab"));
  });
  $("#filters").addEventListener("click", function(e){
    var b = e.target.closest("[data-f]");
    if (!b) return;
    state.filter = b.getAttribute("data-f");
    renderOrders();
  });
  var pab = $("#printAll");
  if (pab) pab.addEventListener("click", printAllReceipts);
  var ob = $("#orphanBar");
  if (ob) ob.addEventListener("click", function(e){
    if (e.target.closest("#orphanRestore")){ restoreOrphans(); return; }
    if (e.target.closest("#orphanDrop")) dropOrphans();
  });
  $("#orderList").addEventListener("click", function(e){
    var rp = e.target.closest("[data-rcpt]");
    if (rp){ printOrderReceipt(rp.getAttribute("data-rcpt")); return; }
    var cx = e.target.closest("[data-cancel]");
    if (cx){ openCancel(cx.getAttribute("data-cancel")); return; }
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var card = e.target.closest(".ocard");
    if (!card) return;
    setStatus(card.getAttribute("data-no"), b.getAttribute("data-act"));
  });

  /* 주문 취소 사유 모달 */
  var cxm = $("#cxModal");
  if (cxm) cxm.addEventListener("click", function(e){
    var r = e.target.closest("[data-cx]");
    if (r){ cancelOrder(r.getAttribute("data-cxno"), r.getAttribute("data-cx")); return; }
    if (e.target.closest("#cxClose") || e.target === cxm) closeCancel();
  });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeCancel(); });

  /* 사진 접수 탭 */
  $("#clFilters").addEventListener("click", function(e){
    var b = e.target.closest("[data-cf]");
    if (!b) return;
    state.cf = b.getAttribute("data-cf");
    renderClaims();
  });
  $("#claimList").addEventListener("click", function(e){
    var ph = e.target.closest("[data-photo]");
    if (ph){ ph.classList.toggle("big"); return; }
    var b = e.target.closest("[data-cact]");
    if (!b) return;
    var card = e.target.closest(".ccard");
    if (!card) return;
    setClaimStatus(card.getAttribute("data-cno"), b.getAttribute("data-cact"));
  });

  var pq = $("#pq");
  pq.addEventListener("input", function(){
    state.q = pq.value;
    renderProducts();
  });
  $("#resetAll").addEventListener("click", function(){
    try { localStorage.removeItem(CATALOG_KEY); } catch(e){}
    state.catalog = {};
    pushCatalog({items:{}, updatedAt: Date.now()});
    renderProducts();
    flashSync();
    toast("원래 가격·판매 상태로 되돌렸어요");
  });

  $("#prodList").addEventListener("click", function(e){
    var ex = e.target.closest("[data-expand]");
    if (ex){
      var pid = ex.getAttribute("data-expand");
      var panel = document.getElementById(ex.getAttribute("aria-controls"));
      if (!panel) return;
      var expanded = panel.hidden;
      if (expanded) state.expandedProducts.add(pid);
      else state.expandedProducts.delete(pid);
      panel.hidden = !expanded;
      ex.setAttribute("aria-expanded", String(expanded));
      return;
    }
    var so = e.target.closest("[data-sold]");
    if (so){
      var soldPid = so.getAttribute("data-sold");
      var soldP = byId(soldPid);
      var cur = isSold(soldP);
      patchItem(soldPid, {soldout: cur ? undefined : true});
      // 품절 해제 시 수량이 0이면 살 수 없으므로 1로 올려 준다
      if (cur){
        var doc = readCatalog();
        var it = doc.items[soldPid] || {};
        var stock = (typeof it.stock === "number") ? it.stock : (soldP && typeof soldP.stock === "number" ? soldP.stock : null);
        if (stock !== null && stock <= 0) it.stock = 1;
        if (Object.keys(it).length) doc.items[soldPid] = it;
        writeCatalog(doc);
      }
      deferRender();
      toast(cur ? (soldP ? soldP.name : "상품") + " 품절을 풀었어요" : (soldP ? soldP.name : "상품") + "을(를) 품절로 바꿨어요");
      return;
    }
  });

  var timers = {};
  function debounced(el, key, fn){
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, 320);
  }
  $("#prodList").addEventListener("input", function(e){
    var t = e.target;
    if (t.matches("[data-price]")){
      var pid = t.getAttribute("data-price"), v = parseInt(t.value, 10);
      if (!v || v <= 0) return;
      debounced(t, "p" + pid, function(){ patchItem(pid, {price: v}); });
      return;
    }
    if (t.matches("[data-opt]")){
      var pid2 = t.getAttribute("data-opt"), oi = parseInt(t.getAttribute("data-oi"), 10), v2 = parseInt(t.value, 10);
      if (!v2 || v2 <= 0) return;
      debounced(t, "o" + pid2, function(){
        var p = byId(pid2), arr = [];
        for (var i=0;i<p.opts.length;i++) arr[i] = effPrice(p, i);
        arr[oi] = v2;
        patchItem(pid2, {opts: arr});
      });
      return;
    }
    if (t.matches("[data-stock]")){
      var pid3 = t.getAttribute("data-stock");
      debounced(t, "s" + pid3, function(){
        var raw = t.value.trim();
        if (raw === ""){ patchItem(pid3, {stock: undefined}); return; }
        var n = parseInt(raw, 10);
        if (isNaN(n) || n < 0) return;
        patchItem(pid3, {stock: n});
        if (n <= 5) deferRender();
      });
      return;
    }
    if (t.matches("[data-comment]")){
      var pid4 = t.getAttribute("data-comment");
      debounced(t, "c" + pid4, function(){
        var v4 = t.value.trim();
        patchItem(pid4, {comment: v4 ? v4 : undefined});
      });
    }
  });
  // 수량 입력 후 포커스를 벗어나면 배지 갱신
  $("#prodList").addEventListener("change", function(e){
    if (e.target.matches("[data-grade]")){
      var pidg = e.target.getAttribute("data-grade");
      patchItem(pidg, {grade: e.target.value});
      deferRender();
      var pg = byId(pidg);
      toast((pg ? pg.name : "상품") + " 등급을 바꿨어요");
      return;
    }
    if (e.target.matches("[data-stock]") || e.target.matches("[data-price]") || e.target.matches("[data-opt]")) deferRender();
  });

  /* 손님 화면에서 주문이 들어오면 바로 새로고침 */
  window.addEventListener("storage", function(e){
    if (!e.key) return;
    if (e.key === ORDERS_KEY){ state.orders = readOrders(); if (state.tab === "orders") renderOrders(); checkNewOrders(state.orders); }
    else if (e.key === CATALOG_KEY){ state.catalog = readCatalog().items; if (state.tab === "products") renderProducts(); renderOrders(); }
    else if (e.key === CLAIM_KEY){ state.claims = readClaims(); renderClaimNums(); if (state.tab === "claims") renderClaims(); }
  });
}

function init(){
  state.catalog = readCatalog().items;
  state.orders = readOrders();
  state.claims = readClaims();
  alarmRead();
  /* 배포본(htmlpreview)에서는 상대 경로가 깨지므로 손님 화면 주소를 직접 계산한다 */
  var link = document.querySelector(".shoplink");
  if (link && location.hostname.indexOf("htmlpreview.github.io") > -1){
    link.href = "https://htmlpreview.github.io/?https://github.com/hhh3350-lab/hoonie-b2b/blob/main/shop.html";
  }
  tick();
  setInterval(tick, 30000);
  renderOrders();
  renderClaimNums();
  renderOrphanBar();
  bind();
  alarmBoot();          /* 알림 토글·새 주문 감지 준비 (첫 화면 주문은 '이미 본 것' 처리) */
  syncStart();          /* 손님 화면·공용 DB와 5초마다 맞추기 */
}

/* ── 로그인 게이트 ─────────────────────────────────
   admin.html 은 로그인 전에는 아무 데이터도 부르지 않는다.
   로그인에 성공해야 init() 이 돌아 주문·접수·상품을 불러온다.
   아이디·비밀번호는 코드에 없다 — 화면에서 입력받은 값을 Supabase 에 확인한다. */
var booted = false;
var authTimer = null;
var authBusy = false;

function setLoginMsg(msg){
  var el = $("#loginMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}
function lockLogin(msg){
  document.body.classList.add("locked");
  var g = $("#loginGate");
  if (g) g.hidden = false;
  setLoginMsg(msg || "");
  var em = $("#loginEmail");
  if (em) setTimeout(function(){ try { em.focus(); } catch(e){} }, 150);
}
function unlockApp(){
  document.body.classList.remove("locked");
  var g = $("#loginGate");
  if (g) g.hidden = true;
}
function startAuthTimer(){
  if (authTimer) clearInterval(authTimer);
  authTimer = setInterval(function(){
    var s = authReadSession();
    if (s && authExpired(s)) renewAuth().catch(function(){});
  }, 60000);
}
/* refresh_token 으로 조용히 세션 갱신 */
function renewAuth(){
  var s = authReadSession();
  if (!s || !s.refresh_token) return Promise.reject(new Error("no session"));
  return authRefresh(s.refresh_token).then(function(d){
    var ns = authPack(d);
    if (!ns.email) ns.email = s.email;
    authSaveSession(ns, authIsKept());
    sbSetToken(ns.access_token);
    return ns;
  });
}
/* 401·403 — 한 번만 갱신해 보고, 안 되면 로그인 화면으로 돌아간다 */
function onAuthFail(){
  if (authBusy) return;
  authBusy = true;
  renewAuth().then(function(){
    authBusy = false;
    if (booted && sbOn()) syncPullAll();
  }).catch(function(){
    authBusy = false;
    endAuth("로그인이 만료됐어요. 다시 로그인해 주세요.");
  });
}
/* 세션 지우고 로그인 화면으로 (새로고침으로 남은 화면·타이머까지 정리) */
function endAuth(msg){
  var s = authReadSession();
  var tok = s && s.access_token;
  if (authTimer){ clearInterval(authTimer); authTimer = null; }
  authClearSession();
  sbSetToken(null); sbAuthFail = null;
  try { stopPoll(); } catch(e){}
  try { stopRinging(); stopVoice(); flashTitle(false); } catch(e){}
  try { if (msg) sessionStorage.setItem(AUTH_MSG_KEY, msg); } catch(e){}
  var done = tok ? authLogoutCall(tok).catch(function(){}) : Promise.resolve();
  Promise.race([done, new Promise(function(r){ setTimeout(r, 1200); })]).then(function(){
    location.reload();
  });
}
function doLogin(){
  var em = $("#loginEmail"), pw = $("#loginPassword"), keep = $("#loginKeep"), btn = $("#loginBtn");
  var email = ((em && em.value) || "").trim();
  var pass = (pw && pw.value) || "";
  if (!email || !pass){ setLoginMsg("아이디(이메일)와 비밀번호를 넣어 주세요"); return; }
  setLoginMsg("");
  if (btn){ btn.disabled = true; btn.textContent = "로그인 중…"; }
  authLogin(email, pass).then(function(d){
    var s = authPack(d);
    authSaveSession(s, !!(keep && keep.checked));
    sbSetToken(s.access_token);
    sbAuthFail = onAuthFail;
    if (pw) pw.value = "";
    if (btn){ btn.disabled = false; btn.textContent = "로그인"; }
    startAuthTimer();
    bootAdmin();
    toast("로그인했어요");
  }).catch(function(err){
    if (btn){ btn.disabled = false; btn.textContent = "로그인"; }
    setLoginMsg((err && err.message) ? err.message : "로그인하지 못했어요");
  });
}
function bootAdmin(){
  if (booted) return;
  booted = true;
  unlockApp();
  init();
}
function bindAuth(){
  var f = $("#loginForm");
  if (f) f.addEventListener("submit", function(e){ e.preventDefault(); doLogin(); });
  var lb = $("#logoutBtn");
  if (lb) lb.addEventListener("click", function(){ endAuth("로그아웃했어요."); });
}
function authStart(){
  bindAuth();
  var notice = "";
  try { notice = sessionStorage.getItem(AUTH_MSG_KEY) || ""; sessionStorage.removeItem(AUTH_MSG_KEY); } catch(e){}
  var s = authReadSession();
  if (!s){ lockLogin(notice); return; }
  sbSetToken(s.access_token);
  sbAuthFail = onAuthFail;
  if (!authExpired(s)){ bootAdmin(); startAuthTimer(); return; }
  /* access_token 이 만료됐어도 refresh_token 이 남아 있으면 조용히 갱신하고 바로 들어간다 */
  renewAuth().then(function(){
    bootAdmin(); startAuthTimer();
  }).catch(function(){
    authClearSession(); sbSetToken(null); sbAuthFail = null;
    lockLogin("로그인 시간이 만료됐어요. 다시 로그인해 주세요.");
  });
}

/* 로그인 확인부터 시작 — 인증 전에는 init() 이 돌지 않는다 */
authStart();
