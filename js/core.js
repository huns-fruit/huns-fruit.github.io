/* core.js — 손님 화면과 사장님 화면이 함께 쓰는 공통 모듈
   (2026-11-23 분리: 두 HTML 에 각각 복사돼 있던 26개 함수를 1벌로 합침)
   - 가게 정보 · 저장소 키 · 공용 DB(Supabase) 호출
   - 표시 도우미: money · esc · thumb · toast
   - 과일 등급 · 주문 상태 문구 · 주문 올리기 (statusLabel · pushOrder 단일화)
   불러오는 순서: core.js → catalog.js → shop.js(또는 admin.js) */
/* ────────────────────────────────────────────────
   1. 가게 정보 · 배달 권역 · 포장 할인
   ──────────────────────────────────────────────── */
var STORE = {
  name: "훈이네과일야채",
  branch: "단구점",
  addr: "강원특별자치도 원주시 단구로 398, 상가동2동 1층 101호 (단구동)",
  tel: "033-765-1531",
  cs: "010-9142-1531",
  email: "hhh3350@naver.com",
  owner: "황관훈",
  biz: "421-28-01608",
  mailorder: "신고 진행 중 (20261123-31137180)"
};

/* 소매몰 ↔ 사장님 페이지가 함께 쓰는 저장소 키 */
var CATALOG_KEY  = "hoonie_retail_catalog_v1";   // 사장님이 고친 가격·품목·남은 수량·코멘트·등급
var ORDERS_KEY   = "hoonie_retail_orders_v1";    // 접수된 주문 (사장님 페이지가 상태 변경)
var CUSTOMER_KEY = "hoonie_retail_customer_v1";  // 최근 주문자 이름·연락처·배달 주소
var CLAIM_KEY    = "hoonie_retail_claims_v1";    // 사진 접수 (사장님이 보상완료/반려)
var MINE_KEY     = "hoonie_retail_my_orders_v1"; // 이 기기에서 넣은 주문번호 (다른 손님 주문은 보지 않게)


/* ── 공용 저장소 (Supabase) ── */
var SB_URL  = "https://hiulxicbowkffoxjtvye.supabase.co";
var SB_KEY  = "sb_publishable_89p69vS6pSVQBJfImjKMrw__mvxKVg3";
var SB_CATALOG = "retail_catalog";   // app_state.key
var SB_POLL_MS = 5000;
var sbTimer = null;

function isoAt(ts){ return new Date(ts || Date.now()).toISOString(); }

function sbOn(){
  return !!(window.fetch && window.JSON && /^https?:$/.test(location.protocol));
}

function sbHead(extra){
  var h = { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json" };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

function sbCall(path, opt){
  opt = opt || {};
  opt.headers = sbHead(opt.headers);
  return fetch(SB_URL + "/rest/v1/" + path, opt).then(function(r){
    if (!r.ok) throw new Error("supabase " + r.status);
    if (r.status === 204) return null;
    var ct = r.headers.get("content-type") || "";
    return ct.indexOf("json") > -1 ? r.json() : null;
  });
}

function sbQuoted(list){
  return list.map(function(s){ return '"' + String(s).replace(/"/g, '') + '"'; }).join(",");
}


/* ── 화면 도우미 ── */
var toastTimer = null;
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function money(n){ return Number(n).toLocaleString("ko-KR"); }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function byId(id){ for (var i=0;i<PRODUCTS.length;i++){ if (PRODUCTS[i].id===id) return PRODUCTS[i]; } return null; }
function thumb(p){ return '<img src="' + IMG[p.img] + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'; }
function toast(msg){
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("on"); }, 1800);
}

/* ── 과일 4단계 등급 ──
   A급 = 품질보증 · 가정용 = 실속 가정용 · B급 = 알뜰 못난이 · C급 = 당일소진 초특가
   C급처럼 낮은 등급도 불량·떨이 같은 말 대신 쓰임새로 설명한다. */
var GRADES = {
  A:    {key:"A",    name:"A급",   tag:"품질보증",       cls:"ga",
         why:"엄선해서 고른 알찬 상품 · 선물에도 좋아요"},
  home: {key:"home", name:"가정용", tag:"실속 가정용",     cls:"gh",
         why:"모양보다 맛·가성비 · 집에서 먹기 좋아요"},
  B:    {key:"B",    name:"B급",   tag:"알뜰 못난이",     cls:"gb",
         why:"크기·모양이 조금씩 달라도 맛은 그대로예요"},
  C:    {key:"C",    name:"C급",   tag:"당일소진 초특가", cls:"gc",
         why:"바로 드실 분께 추천 · 숙성·겉흠집 있어 특가"},
  /* 등급을 매기지 않는 일반 상품(바나나 등) — 4단계 등급표에는 넣지 않는다 */
  normal:{key:"normal", name:"일반", tag:"신선 행사", cls:"gn",
         why:"등급 구분 없이 매일 들여오는 신선 상품"}
};

var GRADE_ORDER = ["A", "home", "B", "C"];
var GRADE_ALL = ["normal", "A", "home", "B", "C"];   // 사장님 페이지 등급 선택지


/* ── 주문 상태 ──
   손님 화면과 사장님 화면이 같은 규칙을 쓴다. 문구만 화면에 맞게 다르다.
   canceled(사장님이 주문 취소)는 done 과 같이 끝난 상태라 진행 단계로 되돌아가지 않는다. */
var LIVE_STATUS = ["received", "accepted", "delivering", "ready"];   /* 취소할 수 있는 진행 중 상태 */
function normStatus(st, mode){
  if (st === "preparing") return mode === "pickup" ? "ready" : "delivering";
  return st || "received";
}
function oStatus(o){ return normStatus(o && o.status, o && o.mode); }
function isLiveStatus(st){ return LIVE_STATUS.indexOf(st) > -1; }
function coreStatusLabel(o, forAdmin){
  var st = oStatus(o), pick = o.mode === "pickup";
  if (forAdmin){
    if (st === "canceled") return "취소됨";
    if (st === "done") return pick ? "픽업 완료" : "배달 완료";
    if (st === "ready") return "픽업 대기";
    if (st === "delivering") return "배달 중";
    if (st === "accepted") return "접수 완료";
    return "새 주문";
  }
  if (st === "canceled") return "❌ 주문 취소";
  if (st === "done") return pick ? "✅ 픽업 완료" : "✅ 배달 완료";
  if (st === "ready") return "🛍️ 픽업 가능";
  if (st === "delivering") return "🚚 배달 시작";
  if (st === "accepted") return "주문 접수";
  return "접수 대기";
}

/* 주문 취소 사유 — 사장님 화면에서 고르고, 손님 화면에 그대로 보인다 */
var CANCEL_REASONS = ["입금 미확인", "상품 품절", "고객 요청", "기타"];

/* 취소 기록 지우기 (되돌릴 때) */
function clearCancelFields(o){
  if (!o) return;
  delete o.cancelReason;
  delete o.cancelAt;
  delete o.prevStatus;
}

function ov(pid){ return state.catalog[pid] || {}; }

function unitWord(p){
  var u = String(p.unit || "");
  var ws = ["팩","단","봉지","판","송이","알","박스","통","망"];
  for (var i=0;i<ws.length;i++) if (u.indexOf(ws[i]) > -1) return ws[i];
  return "개";
}


/* 등급 칩 — 손님·사장님 화면이 같은 모양을 쓴다 */
function coreGradeChip(key, small){
  var g = key ? GRADES[key] : null;
  if (!g) return "";
  return '<span class="gchip ' + g.cls + (small ? ' sm' : '') + '">' + g.name + ' · ' + g.tag + '</span>';
}


/* ── 주문을 공용 DB에 올리기 ──
   손님 화면은 status: o.status || "received", 사장님 화면은 oStatus(o) 로 서로 달랐다.
   oStatus(o) 는 status 가 없으면 "received" 이므로 두 경우를 한 벌로 덮는다. */
function pushOrder(o){
  if (!sbOn()) return Promise.resolve();
  return sbCall("retail_orders", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      id: o.no, data: o, status: oStatus(o),
      created_at: isoAt(o.at),
      updated_at: isoAt()
    }])
  }).catch(function(){});
}

/* ── 공용 DB에서 지워진 주문 정리 ──
   사장님이 공용 DB에서 지운 주문(결제 실패·중복 주문 등)은 기기 저장소에 남아 있으면
   자정이 지나도 '새 주문'처럼 계속 보인다. 그래서 DB에서 한 번이라도 확인된 주문(dbseen)이
   이번 조회 결과에 없으면 지워진 것으로 보고 이 기기 목록에서도 뺀다.
   아직 DB에 못 올라간 주문(주문 직후 통신 실패)은 dbseen 에 없으므로 그대로 남겨 둔다. */
var DBSEEN_KEY = "hoonie_retail_orders_dbseen_v1";
var DBSEEN_MIN_AGE = 10 * 60 * 1000;      /* 방금 올린 주문이 조회에서 앞서 나가는 일은 없다 — 넉넉히 둔다 */
function dbSeenRead(){
  try {
    var d = JSON.parse(localStorage.getItem(DBSEEN_KEY) || "{}");
    return (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
  } catch(e){ return {}; }
}
function dbSeenSave(m){
  var ks = Object.keys(m);
  if (ks.length > 400){
    ks.sort(function(a, b){ return (m[b] || 0) - (m[a] || 0); });
    for (var i = 400; i < ks.length; i++) delete m[ks[i]];
  }
  try { localStorage.setItem(DBSEEN_KEY, JSON.stringify(m)); } catch(e){}
}
/* present = 이번 조회에서 DB에 있던 주문번호 · asked = 이번에 물어본 주문번호 (null = 전체 목록을 다 받아 옴, [] = 아무것도 판단하지 않음)
   opts.reconcile = true 면 'DB에서 확인된 적은 없지만 오래된' 주문도 의심 목록 (orphans) 으로 빼 준다
   → {kept, dead, orphans} */
function splitDeletedOrders(list, present, asked, opts){
  opts = opts || {};
  var minAge = (typeof opts.minAge === "number") ? opts.minAge : DBSEEN_MIN_AGE;
  var reconcile = !!opts.reconcile;
  var seen = dbSeenRead(), has = {}, touched = false, t = Date.now();
  (present || []).forEach(function(no){
    if (!no) return;
    has[no] = 1;
    if (!seen[no]){ seen[no] = t; touched = true; }
  });
  if (touched) dbSeenSave(seen);
  var only = null;
  if (asked){ only = {}; asked.forEach(function(no){ if (no) only[no] = 1; }); }
  var kept = [], dead = [], orphans = [];
  (list || []).forEach(function(o){
    var no = o && (o.no || o.id);
    if (!no){ kept.push(o); return; }
    if (o.keepLocal){ kept.push(o); return; }          /* 사장님이 '되돌리기'한 주문은 건드리지 않는다 */
    var old = (t - Number(o.at || 0)) > minAge;
    if (!has[no] && old && (!only || only[no])){
      if (seen[no]) dead.push(no);                     /* DB에서 확인된 뒤 사라진 주문 = 지운 주문 */
      else if (reconcile) orphans.push(o);             /* DB에 올라간 적 없는 오래된 주문 = 의심 */
      else kept.push(o);
    } else kept.push(o);
  });
  return {kept: kept, dead: dead, orphans: orphans};
}
