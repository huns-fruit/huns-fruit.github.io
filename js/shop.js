/* shop.js — 손님 화면(단구점 소매몰). 공용 코드는 core.js·catalog.js 에 있습니다. */

/* 공용 모듈 연결 — 상태 문구와 등급 칩은 core.js 한 곳에서 만든다 */
function statusLabel(o){ return coreStatusLabel(o, false); }
function gradeChipHtml(p, oi, small){ return coreGradeChip(gradeOf(p, oi), small); }

/* 무통장입금 계좌 (사장님 확인) — 예금주까지 표시 */
var BANK = { bank: "NH농협은행", no: "302-1803-5017-81", holder: "황관훈" };
/* 새 주문을 사장님 폰으로 푸시 (ntfy 앱으로 이 주제를 구독) — 실패해도 주문 흐름은 그대로 */
var NTFY_URL = "https://ntfy.sh/hoonie-dangu-order-914288";

var ZONES = {
  pickup: { key:"pickup", name:"포장(매장픽업)", short:"포장", icon:"🏪", min:0,
    hint:"단구로 398, 상가동2동 1층 101호 · 최소주문 없음 · 포장 09:00~20:00", eta:"포장 가능 시간 09:00~20:00 (준비되면 바로 수령)" },
  city:   { key:"city", name:"원주 시내권 배달", short:"원주 시내권", icon:"🛵", min:30000,
    hint:"30,000원 이상 무료배달 · 낮 12시 마감", eta:"낮 12시 이전 주문 → 당일 또는 익일 배달" },
  outer:  { key:"outer", name:"기업도시·태장·우산동 배달", short:"기업·태장·우산동", icon:"🚛", min:50000,
    hint:"50,000원 이상 무료배달 · 전날 발주 → 다음날 오전배송", eta:"전날 주문 → 다음날 오전 배송" }
};

/* 포장(매장픽업) 하루 1회 1,000원 할인 쿠폰 — 15,000원 이상 주문에만 */
var PICKUP_DISCOUNT = 1000;
var PICKUP_MIN = 15000;
var COUPON_KEY = "hoonie_retail_pickup_coupon_v1";
/* 오픈 기념 바나나 100원도 포장 쿠폰과 똑같이 하루 1회 — 사용한 날짜를 기기에 남긴다 */
var BANANA_KEY = "hoonie_retail_banana_event_v1";   // {"date":"2026-11-24"}

/* 오픈 기념 이벤트 — 3만 원 이상 '배달' 주문이면 바나나 1송이를 100원에 추가 (11/24~11/29)
   조건: 배달 전용 · 일반 상품 합계 3만 원 이상 · 주문당 1송이 · 하루 1회
   일반 상품 합계(subtotal)만 보고 판단하고, 이벤트 바나나는 장바구니 줄이 아니라 state.banana 로 따로 담는다.
   (바나나 행사 재고 8송이 제한과 섞이지 않게 하려는 것)
   포장(매장픽업) 주문에는 적용하지 않는다 — 포장으로 바꾸면 자동으로 뺀다.
   하루 1회는 포장 쿠폰과 같이 사용한 날짜를 기기에 남겨 하루에 한 번만 적용한다. */
var OPEN_EVENT = {
  from: "2026-11-24", to: "2026-11-29",
  min: 30000,
  price: 100,
  pid: "banana-event",
  name: "🍌 [오픈특가] 바나나 1송이",
  label: "[오픈특가] 바나나 1송이 100원 추가하기 (+100원)",
  offNote: "🍌 바나나 100원 이벤트는 3만 원 이상 배달 주문 시에만 적용돼요",
  banner: "🎉 오픈 기념 이벤트 (11/24~11/29) · 배달 3만 원 이상 주문 시 🍌 바나나 1송이 100원! (하루 1회 · 1인 1송이 한정)",
  bannerSub: "3만 원 이상 배달 주문 시 장바구니에서 100원에 추가할 수 있어요 · 하루 1회 · 주문당 1송이 한정"
};






/* ── 상품 정보(가격·품절·수량·코멘트·등급) 공유 ── */
function catalogDoc(){
  try {
    var d = JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}");
    if (d && d.items) return d;
  } catch(e){}
  return { items:{}, updatedAt: 0 };
}
function writeCatalogDoc(doc){
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(doc)); } catch(e){}
  state.catalog = doc.items || {};
}
function pushCatalog(){
  if (!sbOn()) return Promise.resolve();
  var doc = catalogDoc();
  if (!doc.updatedAt) doc.updatedAt = Date.now();
  return sbCall("app_state", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: SB_CATALOG, value: doc, updated_at: new Date().toISOString() }])
  }).catch(function(){});
}
/* 주문으로 줄어든 남은 수량만 올린다.
   서버의 최신 문서 위에 얹어 쓰기 때문에 사장님이 고른 가격·코멘트·등급을 덮지 않는다. */
function pushStockPatch(patch){
  if (!sbOn()) return Promise.resolve();
  return sbCall("app_state?key=eq." + SB_CATALOG + "&select=value").then(function(rows){
    var remote = rows && rows[0] && rows[0].value;
    var doc = (remote && remote.items) ? remote : catalogDoc();
    doc.items = doc.items || {};
    for (var pid in patch){
      var it = doc.items[pid] || {};
      it.stock = patch[pid];
      doc.items[pid] = it;
    }
    doc.updatedAt = Date.now();
    writeCatalogDoc(doc);
    loadCatalog();
    return sbCall("app_state", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: SB_CATALOG, value: doc, updated_at: new Date().toISOString() }])
    });
  }).catch(function(){});
}
function pullCatalog(){
  if (!sbOn()) return Promise.resolve();
  return sbCall("app_state?key=eq." + SB_CATALOG + "&select=value").then(function(rows){
    var v = rows && rows[0] && rows[0].value;
    if (!v || !v.items) return;
    var local = catalogDoc();
    if (Number(v.updatedAt || 0) <= Number(local.updatedAt || 0)) return;
    writeCatalogDoc(v);
    renderAll();
    if (state.view === "cart") renderCart();
  }).catch(function(){});
}


/* 내 기기에 있는 주문의 상태만 사장님 화면에서 바뀐 값으로 맞춘다.
   (다른 손님 주문은 이 화면으로 끌어오지 않는다) */
function pullOrderStatus(){
  if (!sbOn() || !state.orders.length) return Promise.resolve();
  var ids = state.orders.slice(0, 20).map(function(o){ return o.no; });
  var sel = encodeURIComponent("id,status,cancelReason:data->>cancelReason,cancelAt:data->>cancelAt");
  return sbCall("retail_orders?select=" + sel + "&id=in.(" + encodeURIComponent(sbQuoted(ids)) + ")").then(function(rows){
    if (!rows || !rows.length) return;
    var byNo = {};
    rows.forEach(function(r){ byNo[r.id] = r; });
    var changed = false;
    state.orders.forEach(function(o){
      var r = byNo[o.no];
      if (!r) return;
      var st = normStatus(r.status, o.mode);
      if (st && st !== oStatus(o)){ o.status = st; o.statusAt = Date.now(); changed = true; }
      /* 사장님이 취소한 경우 사유도 같이 받아 온다 */
      if (oStatus(o) === "canceled"){
        if (r.cancelReason && r.cancelReason !== o.cancelReason){ o.cancelReason = r.cancelReason; changed = true; }
        if (r.cancelAt && r.cancelAt !== o.cancelAt){ o.cancelAt = r.cancelAt; changed = true; }
      } else if (o.cancelReason){
        clearCancelFields(o); changed = true;
      }
    });
    if (!changed) return;
    saveOrders();
    renderOrderStrip();
    if (state.view === "done" && state.order) showDone(state.order);
  }).catch(function(){});
}

/* ── 사진 접수 ── */
function pushClaim(c){
  if (!sbOn()) return Promise.resolve();
  return sbCall("retail_claims", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      id: c.no, data: c, status: c.status || "checking",
      created_at: new Date(c.at || Date.now()).toISOString()
    }])
  }).catch(function(){});
}
function pullClaimStatus(){
  var list = loadClaims();
  if (!sbOn() || !list.length) return Promise.resolve();
  var ids = list.slice(0, 12).map(function(c){ return c.no; });
  return sbCall("retail_claims?select=id,status&id=in.(" + encodeURIComponent(sbQuoted(ids)) + ")").then(function(rows){
    if (!rows || !rows.length) return;
    var byNo = {};
    rows.forEach(function(r){ byNo[r.id] = r.status; });
    var changed = false;
    list.forEach(function(c){
      var st = byNo[c.no];
      if (st && st !== (c.status || "checking")){ c.status = st; c.statusAt = Date.now(); changed = true; }
    });
    if (!changed) return;
    saveClaims(list);
    renderClaimBadge();
    if (state.view === "cart") renderCart();
  }).catch(function(){});
}

function syncPullAll(){
  if (!sbOn() || document.hidden) return;
  pullCatalog();
  pullOrderStatus();
  pullClaimStatus();
}
function syncStart(){
  if (!sbOn()) return;
  syncPullAll();
  clearInterval(sbTimer);
  sbTimer = setInterval(syncPullAll, SB_POLL_MS);
  document.addEventListener("visibilitychange", syncPullAll);
  window.addEventListener("online", syncPullAll);
}













/* 결제 수단 — PG 연결 전까지는 무통장입금(계좌입금)만 받는다.
   다른 수단은 화면에 'PG 준비 중'으로만 보이고 고를 수 없다(disabled). */
var PAY_ONLY = "bank";
var PAYS = [
  {key:"bank", label:"무통장입금", icon:"🏦"},
  {key:"card", label:"신용·체크카드", icon:"💳", soon:true},
  {key:"naverpay", label:"네이버페이", icon:"🟢", soon:true},
  {key:"kakaopay", label:"카카오페이", icon:"🟡", soon:true}
];

var DAYS = ["일","월","화","수","목","금","토"];

/* ────────────────────────────────────────────────
   2. 상태
   ──────────────────────────────────────────────── */
var KEY = "hoonie_retail_v2";
var state = {
  cart: [],          // [{pid, oi, qty}]
  mode: "delivery",  // delivery | pickup
  zone: "city",      // city | outer
  user: null,        // {provider, name}
  filter: "all",
  q: "",
  view: "shop",      // shop | cart | checkout | done
  form: {name:"", phone:"", addr:"", memo:"", pay:"bank", agree:false, depositor:"", receiptType:"none", receiptNo:""},
  order: null,
  opt: null,         // {pid, oi, qty}
  couponDate: null,  // 포장 할인 마지막 사용일 (YYYY-MM-DD)
  banana: false,     // 오픈 기념 이벤트 바나나 1송이 100원 추가 여부
  bananaDate: null,  // 바나나 100원 마지막 사용일 (YYYY-MM-DD) — 하루 1회
  slots: {},         // 받는 시간 선택 {pickup:"soon30", delivery_city:"today_pm", delivery_outer:"tomorrow_am"}
  recent: null,      // 최근 주문자 {name, phone, addr, at}
  catalog: {},       // 사장님 페이지가 고친 상품 정보 {pid:{price,opts,soldout,stock,comment}}
  orders: []         // 이 기기에 접수된 주문 (최신순)
};
/* ── 매장 픽업(포장) 영업시간 = 09:00~20:00 ──
   이 시간 안에서만 '오늘 픽업'을 받고, 20:00~다음날 09:00 사이에는
   '내일 오전 9시 이후 픽업'으로만 예약을 받는다. */
var PICKUP_OPEN_H = 9;
var PICKUP_CLOSE_H = 20;
var PICKUP_HOURS = "09:00~20:00";
var SLOT_DEF = {
  delivery_city: [
    {key:"today_pm",    label:"오늘 오후 배달", sub:"낮 12시 이전 주문", eta:"오늘 오후 배달"},
    {key:"tomorrow_am", label:"내일 오전 배달", sub:"낮 12시 넘었어도 접수", eta:"내일 오전 배달"}
  ],
  delivery_outer: [
    {key:"tomorrow_am",  label:"내일 오전 배송", sub:"오늘 주문 · 전날 발주", eta:"내일 오전 배송"},
    {key:"dayafter_am",  label:"모레 오전 배송", sub:"하루 여유 있게", eta:"모레 오전 배송"}
  ]
};
/* 무료배달 채우기 추천 (1,500~3,000원 채소) */
var FILL_IDS = ["perilla", "aehobak", "daepa", "cheongyang"];
/* 원터치 요청사항 칩 */
var REQ_DELIVERY = ["문 앞에 두고 문자 주세요", "벨 누르지 마세요", "도착 전 전화 주세요", "아이스박스/그늘 보관"];
/* 포장 요청사항 칩 — 영업시간 밖이면 '30분 뒤' 대신 '내일 오전'으로 */
function reqPickupChips(){
  return pickupOpenNow()
    ? ["30분 뒤에 갈게요", "봉투에 담아 주세요", "계산대에서 바로 받을게요"]
    : ["내일 오전에 갈게요", "봉투에 담아 주세요", "계산대에서 바로 받을게요"];
}





/* ── 사장님 페이지가 고친 상품 정보 반영 ── */
function catItems(){
  try { var d = JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}"); return (d && d.items) || {}; }
  catch(e){ return {}; }
}
function loadCatalog(){ state.catalog = catItems(); }

function priceOf(p, oi){
  var o = ov(p.id);
  if (p.opts){ var a = o.opts || [], v = a[oi]; return (typeof v === "number" && v > 0) ? v : p.opts[oi].price; }
  return (typeof o.price === "number" && o.price > 0) ? o.price : p.price;
}
function basePrice(p){ return priceOf(p, 0); }
function optOf(p, oi){ return p.opts ? p.opts[oi] : null; }
function linePrice(l){ var p=byId(l.pid); return priceOf(p, l.oi); }
function lineKey(l){ return l.pid + "|" + l.oi; }

function stockOf(p){
  var o = ov(p.id);
  if (typeof o.stock === "number") return o.stock;
  if (typeof p.stock === "number") return p.stock;
  return null;
}
function isSold(p){
  if (ov(p.id).soldout) return true;
  var s = stockOf(p);
  return s !== null && s <= 0;
}
function commentOf(p){ var c = ov(p.id).comment; return c ? String(c).trim() : ""; }
/* ── 과일 등급 (사장님이 고친 등급이 있으면 그걸 우선) ── */
function gradeOf(p, oi){
  if (!p) return null;
  var o = ov(p.id);
  if (o.grade && GRADES[o.grade]) return o.grade;
  if (oi !== undefined && oi !== null && p.ogrades && p.ogrades[oi]) return p.ogrades[oi];
  return p.grade || null;
}


function stockBadgeHtml(p){
  if (isSold(p)) return "";
  var s = stockOf(p);
  if (s === null || s > 5) return "";
  return '<span class="stockb' + (s <= 2 ? '' : ' soon') + '">오늘 ' + s + unitWord(p) + ' 남음</span>';
}

/* ── 낮 12시 마감 (한국 시간 Asia/Seoul 기준, 기기 시간대와 무관) ── */
function kstDate(){
  var d = new Date();
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 9 * 3600000);
}
function deliveryClosed(){ return kstDate().getHours() >= 12; }
/* 한국 시간 기준 지금이 몇 분인지 (00:00 = 0) */
function kstMin(){ var d = kstDate(); return d.getHours()*60 + d.getMinutes(); }
function pad2(n){ return String(n).padStart(2,"0"); }
function pickupOpenNow(){ var m = kstMin(); return m >= PICKUP_OPEN_H*60 && m < PICKUP_CLOSE_H*60; }
/* 지금 시각에 고를 수 있는 포장(매장픽업) 시간 — 20:00을 넘기는 시간대는 내놓지 않는다 */
function pickupSlots(){
  var m = kstMin(), closeM = PICKUP_CLOSE_H*60, list = [];
  if (!pickupOpenNow()){
    return [{key:"tomorrow_am", label:"내일 오전 9시 이후 픽업",
             sub:"포장 가능 시간 " + PICKUP_HOURS, eta:"내일 오전 9시 이후 픽업"}];
  }
  if (m + 30 <= closeM){
    list.push({key:"soon30", label:"30분 뒤 바로 픽업",
               sub:"지금 바로 준비해 둘게요", eta:"30분 뒤 픽업"});
  } else {
    list.push({key:"today_close", label:"오늘 " + pad2(PICKUP_CLOSE_H) + ":00까지 픽업",
               sub:"매장 마감 전에 가져가기", eta:"오늘 " + pad2(PICKUP_CLOSE_H) + ":00까지 픽업"});
  }
  /* 오후 픽업(4시~7시)은 7시가 되기 전까지만 고를 수 있다 */
  if (m < 19*60){
    list.push({key:"today_pm", label:"오늘 오후 픽업",
               sub:(m < 16*60 ? "오후 4시~7시에 가져가기" : "지금부터 오후 7시 사이에 가져가기"),
               eta:"오늘 오후 픽업"});
  }
  return list;
}
function closedMsg(){
  return "오늘 당일 배달은 낮 12시에 마감되었어요. 지금 주문하시면 내일 오전 배송으로 접수됩니다. ("
    + (pickupOpenNow() ? "매장 포장은 " + PICKUP_HOURS + " 안에서 지금도 가능해요"
                       : "매장 포장은 영업시간 " + PICKUP_HOURS + "에 가능해요") + ")";
}
function deliveryClosedBannerHtml(){
  return '<div class="banner closed" id="closedBanner">'
    + '<b><span class="bn-ico">⏰</span>오늘 배달은 낮 12시에 마감됐어요</b>'
    + '<small>' + closedMsg() + '</small>'
    + '<div class="chips"><button data-mode="pickup">🏪 포장으로 바꾸기</button></div></div>';
}
function deliveryClosedNote(pad){
  return '<div class="banner closed" style="margin:' + (pad ? '12px 0 0' : '10px 16px 0') + '">'
    + '<b><span class="bn-ico">⏰</span>낮 12시 마감 · 내일 오전 배송으로 접수돼요</b>'
    + '<small>' + closedMsg() + '</small>'
    + '<div class="chips"><button data-mode="pickup">🏪 포장으로 바꾸기</button></div></div>';
}
/* 포장(매장픽업) 영업시간 09:00~20:00 밖일 때의 안내 */
function pickupClosedText(){
  return "포장(매장픽업)은 영업시간 " + PICKUP_HOURS + "에 가능해요. 지금 주문하시면 내일 오전 9시 이후에 가져가실 수 있어요.";
}
function pickupClosedBannerHtml(){
  return '<div class="banner closed" id="pickupClosedBanner">'
    + '<b><span class="bn-ico">⏰</span>지금은 영업시간이 아니에요 · ' + PICKUP_HOURS + '</b>'
    + '<small>' + pickupClosedText() + '</small></div>';
}
function pickupClosedNote(pad){
  return '<div class="banner closed" style="margin:' + (pad ? '12px 0 0' : '10px 16px 0') + '">'
    + '<b><span class="bn-ico">⏰</span>지금은 영업시간이 아니에요 · ' + PICKUP_HOURS + '</b>'
    + '<small>' + pickupClosedText() + '</small></div>';
}

/* ── 받는 시간 선택 ── */
function ctxKey(){ return state.mode === "pickup" ? "pickup" : "delivery_" + state.zone; }
function slotList(){
  if (ctxKey() === "pickup") return pickupSlots();
  var list = SLOT_DEF[ctxKey()] || SLOT_DEF.delivery_city;
  /* 낮 12시가 지나면 오늘 오후 배달은 받지 않고 내일 오전 배송으로 접수한다 */
  if (ctxKey() === "delivery_city" && deliveryClosed()){
    list = list.filter(function(s){ return s.key !== "today_pm"; });
  }
  return list;
}
/* ── 현금영수증 표기 ── */
function receiptLabel(t){
  if (t === "income") return "소득공제(휴대폰번호)";
  if (t === "expense") return "지출증빙(사업자번호)";
  return "";
}
function rcptHtml(){
  var f = state.form, t = f.receiptType || "none";
  function c(k, label){ return '<button data-rcpt="' + k + '"' + (t === k ? ' class="on"' : '') + ' aria-pressed="' + (t === k) + '">' + label + '</button>'; }
  var h = '<div class="rcpt" id="rcptBox"><div class="rcpt-h"><b>🧾 현금영수증 신청 (선택)</b>'
    + '<small>현금·계좌이체로 보내실 때 발급해 드려요 · 카드 결제는 자동 발급</small></div><div class="chips">'
    + c("none", "안 함") + c("income", "소득공제 · 휴대폰번호") + c("expense", "지출증빙 · 사업자번호")
    + '</div>';
  if (t !== "none"){
    h += '<div class="field"><label for="ckRcptNo">' + (t === "expense" ? "사업자번호" : "휴대폰번호") + '</label>'
      + '<input id="ckRcptNo" inputmode="numeric" value="' + esc(f.receiptNo) + '" placeholder="' + (t === "expense" ? "123-45-67890" : "010-0000-0000") + '">'
      + '<span class="fhint">현금영수증을 발급할 번호예요</span></div>';
  }
  return h + '</div>';
}
function curSlot(){
  var list = slotList(), want = state.slots[ctxKey()];
  for (var i=0;i<list.length;i++) if (list[i].key === want) return list[i];
  return list[0];
}
function slotBoxHtml(inBanner){
  var list = slotList(), cur = curSlot(), h = "";
  h += '<div class="slotbox' + (inBanner ? ' inbanner' : '') + '">'
    +  '<div class="ct">🕞 받는 시간 <em>' + (state.mode === "pickup" ? "매장 픽업 · " + PICKUP_HOURS : "배달 일정") + '</em></div>'
    +  '<div class="slots">';
  for (var i=0;i<list.length;i++){
    var s = list[i];
    h += '<button class="slot' + (s.key === cur.key ? ' on' : '') + '" data-slot="' + s.key + '" aria-pressed="' + (s.key === cur.key) + '">'
      + '<b>' + s.label + '</b><small>' + s.sub + '</small></button>';
  }
  return h + '</div></div>';
}

/* ── 주문 저장소 (사장님 페이지와 공유) ── */
function myOrderNos(){
  try { var d = JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function rememberMyOrder(no){
  var list = myOrderNos();
  if (list.indexOf(no) < 0) list.unshift(no);
  try { localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 50))); } catch(e){}
}
function loadOrders(){
  try { var d = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); state.orders = Array.isArray(d) ? d : []; }
  catch(e){ state.orders = []; }
  state.orders.forEach(function(o){ if (o) o.status = oStatus(o); });
  /* 이 화면은 손님용 — 사장님이 같은 브라우저로 열어 받아 둔 다른 손님 주문은 보여주지 않는다 */
  var mine = myOrderNos();
  if (mine.length) state.orders = state.orders.filter(function(o){ return mine.indexOf(o.no) > -1; });
}
function saveOrders(){
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(state.orders)); } catch(e){}
}
function lastOrder(){ return state.orders.length ? state.orders[0] : null; }

/* ── 무통장입금 계좌 박스 · 복사 버튼 ─────────────────────── */
function bankBoxHtml(total){
  return '<div class="bankbox" id="bankBox">'
    + '<div class="bbt"><span class="bbi">🏦</span>무통장입금 계좌</div>'
    + '<div class="bbno"><b>' + BANK.bank + '</b>' + BANK.no + '</div>'
    + '<div class="bbh">예금주: ' + BANK.holder + '</div>'
    + '<div class="bbwarn">입금이 확인된 후 상품 준비 및 배달이 출발합니다.</div>'
    + '<button type="button" class="bbcopy" id="bankCopy">📋 계좌번호 복사</button>'
    + (total ? '<p class="bbnote">입금하실 금액: <b>' + money(total) + '원</b> · 입금자명을 주문자 이름과 같게 적어 주세요.</p>'
             : '<p class="bbnote">입금자명을 주문자 이름과 같게 적어 주세요.</p>')
    + '</div>';
}
function copyBank(){
  var no = BANK.no;
  function done(){ toast("계좌번호 " + no + " 복사했어요"); }
  function fallback(){
    try {
      var ta = document.createElement("textarea");
      ta.value = no; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, no.length);
      document.execCommand("copy"); document.body.removeChild(ta); done();
    } catch(e){ toast("계좌번호: " + no); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(no).then(done).catch(fallback);
  } else fallback();
}
function bindBankCopy(){
  var b = $("#bankCopy");
  if (b) b.addEventListener("click", copyBank);
}

/* ── 새 주문을 사장님 폰으로 푸시 (ntfy) ────────────────────
   주문 저장 뒤 비동기로 보낸다. 실패해도 주문 완료 화면과 저장은 그대로. */
function pushNewOrderAlert(ord){
  try {
    if (!ord || !window.fetch) return;
    var yname = Number(ord.total || 0).toLocaleString("ko-KR");
    var body = "새 주문! [" + (ord.mode === "pickup" ? "포장" : "배달") + "] · "
             + (ord.name || "손님") + "님 · " + yname + "원"
             + (ord.depositor ? " · 입금자명 " + ord.depositor : "");
    fetch(NTFY_URL, {
      method: "POST",
      headers: {
        "Title": "Hoonie Dangu New Order",   /* ntfy Title 헤더는 ASCII 만 허용 */
        "Priority": "high",
        "Tags": "bell,strawberry"
      },
      body: body
    }).catch(function(){});
  } catch(e){}          /* 알림 실패가 주문을 막지 않는다 */
}



function statusMsg(o){
  var st = oStatus(o), pick = o.mode === "pickup";
  if (st === "canceled") return "가게에서 주문을 취소했어요" + (o.cancelReason ? " · 사유: " + o.cancelReason : "");
  if (st === "done") return pick ? "픽업이 끝났어요. 맛있게 드세요!" : "배달이 끝났어요. 맛있게 드세요!";
  if (st === "ready") return "매장에서 바로 받아 가세요!";
  if (st === "delivering") return "기사님이 출발했어요!";
  if (st === "accepted") return "가게에서 주문을 확인했어요.";
  return "가게에서 확인 중이에요.";
}
function statusHead(o, st){
  st = st || oStatus(o);
  var pick = o.mode === "pickup";
  if (st === "canceled") return "❌ 주문이 취소되었어요";
  if (st === "done") return pick ? "✅ 픽업 완료" : "✅ 배달 완료";
  if (st === "ready") return "🛍️ 픽업 가능해요";
  if (st === "delivering") return "🚚 배달이 시작됐어요";
  if (st === "accepted") return "주문을 확인했어요";
  return "주문이 접수됐어요";
}

/* ── 최근 주문자 기억 ── */
function loadRecent(){
  try { var d = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null"); if (d && d.name) state.recent = d; } catch(e){}
}
function saveRecent(){
  var f = state.form;
  if (!f.name || !f.phone) return;
  state.recent = {name: f.name, phone: f.phone, addr: f.addr || "", at: Date.now()};
  try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(state.recent)); } catch(e){}
}
function applyRecent(){
  var r = state.recent; if (!r) return;
  if (!state.form.name)  state.form.name  = r.name  || "";
  if (!state.form.phone) state.form.phone = r.phone || "";
  if (!state.form.addr)  state.form.addr  = r.addr  || "";
}

/* ────────────────────────────────────────────────
   3. 계산
   ──────────────────────────────────────────────── */
function count(){ var n=0; for (var i=0;i<state.cart.length;i++) n += state.cart[i].qty; return n; }
function subtotal(){ var s=0; for (var i=0;i<state.cart.length;i++) s += linePrice(state.cart[i]) * state.cart[i].qty; return s; }
function zoneInfo(){ return state.mode === "pickup" ? ZONES.pickup : ZONES[state.zone]; }
function remaining(){ var z=zoneInfo(); return Math.max(0, z.min - subtotal()); }
function meetMin(){ return subtotal() >= zoneInfo().min; }
function todayStr(){
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function couponUsedToday(){ return state.couponDate === todayStr(); }
/* 15,000원까지 남은 금액 */
function couponGap(){ return Math.max(0, PICKUP_MIN - subtotal()); }
/* 쿠폰 상태: used(오늘 사용) / delivery(배달) / empty(빈 장바구니) / need(금액 부족) / on(사용 가능) */
function couponState(){
  if (couponUsedToday()) return "used";
  if (state.mode !== "pickup") return "delivery";
  if (!state.cart.length) return "empty";
  return subtotal() >= PICKUP_MIN ? "on" : "need";
}
/* 이번 주문에 적용되는 포장 할인 (포장 + 오늘 미사용 + 15,000원 이상) */
function pickupDiscount(){
  if (state.mode !== "pickup") return 0;
  if (!state.cart.length) return 0;
  if (couponUsedToday()) return 0;
  var sub = subtotal();
  if (sub < PICKUP_MIN) return 0;
  return Math.min(PICKUP_DISCOUNT, sub);
}
/* ── 오픈 기념 이벤트 바나나(100원) ─────────────────────────────
   eventBase() = 100원 이벤트 상품을 뺀 일반 상품 합계 (= 장바구니 합계)
   eventReady() = 배달 주문 + 3만 원 이상 (주문당 1송이 · 포장에는 적용 안 함) */
function eventBase(){ return subtotal(); }
function eventGap(){ return Math.max(0, OPEN_EVENT.min - eventBase()); }
function bananaUsedToday(){ return state.bananaDate === todayStr(); }
function markBananaUsed(){ state.bananaDate = todayStr(); save(); }
function eventReady(){ return state.mode === "delivery" && state.cart.length > 0 && eventBase() >= OPEN_EVENT.min && !bananaUsedToday(); }
/* 바나나 100원 상태: off(포장) / used(오늘 사용) / empty(빈 장바구니) / need(금액 부족) / ready(담을 수 있음) / on(담음) */
function bananaState(){
  if (state.mode !== "delivery") return "off";
  if (bananaUsedToday()) return "used";
  if (!state.cart.length) return "empty";
  if (eventBase() < OPEN_EVENT.min) return "need";
  return state.banana ? "on" : "ready";
}
function bananaPay(){ return (state.banana && eventReady()) ? OPEN_EVENT.price : 0; }
/* 조건이 안 맞으면 이벤트 바나나를 자동으로 뺀다 (3만 원 아래로 줄었거나 포장으로 바꾼 경우) */
function syncBanana(quiet){
  if (state.banana && !eventReady()){
    state.banana = false;
    save();
    if (!quiet){
      toast(state.mode !== "delivery"
        ? "🍌 바나나 100원은 배달 주문에만 적용돼서 장바구니에서 뺐어요"
        : (bananaUsedToday()
            ? "오늘 이미 사용한 이벤트예요 · 바나나 100원은 내일 다시 담을 수 있어요"
            : "3만 원 아래로 줄어서 바나나 100원 이벤트가 풀렸어요"));
    }
    return true;
  }
  return false;
}
/* 배달 / 포장 전환 — 포장으로 바꾸면 100원 이벤트 바나나를 자동으로 뺀다 */
function setMode(mode, quiet){
  state.mode = (mode === "pickup") ? "pickup" : "delivery";
  var dropped = syncBanana(true);
  save();
  renderAll();
  if (dropped && !quiet) toast("🍌 바나나 100원은 배달 주문에만 적용돼서 장바구니에서 뺐어요");
  return dropped;
}
function payable(){ return Math.max(0, subtotal() - pickupDiscount() + bananaPay()); }

function save(){
  try {
    localStorage.setItem(KEY, JSON.stringify({cart: state.cart, mode: state.mode, zone: state.zone, user: state.user, slots: state.slots, banana: !!state.banana}));
    if (state.couponDate) localStorage.setItem(COUPON_KEY, JSON.stringify({date: state.couponDate}));
    else localStorage.removeItem(COUPON_KEY);
    if (state.bananaDate) localStorage.setItem(BANANA_KEY, JSON.stringify({date: state.bananaDate}));
    else localStorage.removeItem(BANANA_KEY);
  } catch(e){}
}
function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.cart)) {
        state.cart = d.cart.filter(function(l){ return byId(l.pid) && l.qty > 0 && l.oi >= 0; });
      }
      if (d && d.mode === "pickup") state.mode = "pickup";
      else if (d && d.zone && ZONES[d.zone]) { state.mode = "delivery"; state.zone = d.zone; }
      if (d && d.user && d.user.provider) state.user = d.user;
      if (d && d.slots && typeof d.slots === "object") state.slots = d.slots;
      if (d && d.banana === true) state.banana = true;
    }
    var c = localStorage.getItem(COUPON_KEY);
    if (c) { var cd = JSON.parse(c); if (cd && cd.date) state.couponDate = cd.date; }
    var bn = localStorage.getItem(BANANA_KEY);
    if (bn) { var bd = JSON.parse(bn); if (bd && bd.date) state.bananaDate = bd.date; }
  } catch(e){}
}
function markCouponUsed(){ state.couponDate = todayStr(); save(); }



/* ────────────────────────────────────────────────
   5. 간편 로그인
   ──────────────────────────────────────────────── */
function login(provider){
  state.user = {provider: provider, name: "김단골"};
  if (!state.form.name) state.form.name = "김단골";
  if (!state.form.phone) state.form.phone = "010-1234-5678";
  save();
  toast(provider === "naver" ? "네이버로 로그인했어요" : "카카오로 로그인했어요");
  if (state.view === "checkout") renderCheckout();
}
function logout(){
  state.user = null;
  save();
  if (state.view === "checkout") renderCheckout();
  toast("로그아웃했어요");
}

/* ────────────────────────────────────────────────
   6. 배달 / 포장 탭 · 안내 배너
   ──────────────────────────────────────────────── */
function renderMode(){
  $$("#modeTabs button").forEach(function(b){
    var on = b.getAttribute("data-mode") === state.mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  var el = $("#modeBanner");
  if (state.mode === "pickup") {
    var cs = couponState(), ico, title, sub;
    if (cs === "used"){
      ico = "🗓️"; title = "오늘 쿠폰 사용 완료";
      sub = "내일 다시 1,000원 할인 쿠폰을 쓸 수 있어요 · 포장은 최소주문 없이 · " + PICKUP_HOURS;
    } else if (cs === "need"){
      ico = "🎟️"; title = money(couponGap()) + "원 더 담으면 포장 1,000원 쿠폰 사용 가능";
      sub = "15,000원 이상 포장 주문 · 오늘 하루 1회";
    } else if (cs === "on"){
      ico = "🎟️"; title = "포장 1,000원 할인 쿠폰 적용 중";
      sub = "이번 주문에서 1,000원 빠져요 · 오늘 하루 1회";
    } else {
      ico = "🎟️"; title = "포장 1,000원 할인 쿠폰";
      sub = "15,000원 이상 포장 주문에 1,000원 · 오늘 하루 1회";
    }
    el.innerHTML = (pickupOpenNow() ? '' : pickupClosedBannerHtml())
      + '<div class="banner pick' + (cs === "used" ? ' used' : '') + '">'
      + '<b><span class="bn-ico">' + ico + '</span>' + title + '</b>'
      + '<small>' + sub + '</small>'
      + slotBoxHtml(true)
      + '</div>';
  } else {
    el.innerHTML = (deliveryClosed() ? deliveryClosedBannerHtml() : '')
      + '<div class="banner deliv">'
      + '<b><span class="bn-ico">🛵</span>무료배달 최소주문</b>'
      + '<small>원주 시내 30,000원 이상 · 기업·태장·우산 50,000원 이상 · 낮 12시 마감</small>'
      + '<div class="chips">'
      +   '<button data-zone="city"' + (state.zone === "city" ? ' class="on"' : '') + '>원주 시내권 <em>3만원 이상</em></button>'
      +   '<button data-zone="outer"' + (state.zone === "outer" ? ' class="on"' : '') + '>기업·태장·우산동 <em>5만원 이상</em></button>'
      + '</div>'
      + slotBoxHtml(true)
      + '</div>';
  }
}

/* ────────────────────────────────────────────────
   7. 카테고리 · 메뉴 목록
   ──────────────────────────────────────────────── */
function matches(p){
  if (state.filter !== "all" && p.cats.indexOf(state.filter) < 0) return false;
  var q = state.q.trim().toLowerCase();
  if (!q) return true;
  var hay = p.name + " " + p.unit + " " + (p.origin||"") + " " + (p.desc||"") + " " + (p.tags||[]).join(" ");
  return hay.toLowerCase().indexOf(q) > -1;
}
function qtyOf(pid){
  var n = 0;
  for (var i=0;i<state.cart.length;i++) if (state.cart[i].pid === pid) n += state.cart[i].qty;
  return n;
}
function renderCats(){
  var h = "";
  for (var i=0;i<CATS.length;i++){
    var c = CATS[i];
    h += '<button data-cat="' + c.key + '"' + (state.filter===c.key ? ' class="on"' : '') + '>' + c.label + '</button>';
  }
  $("#catIn").innerHTML = h;
}
function rowAction(p){
  var q = qtyOf(p.id);
  if (p.opts){
    return '<button class="madd" data-add="' + p.id + '" aria-label="' + esc(p.name) + ' 옵션 담기">담기</button>';
  }
  if (q > 0){
    return '<span class="mstp">'
      + '<button data-dec="' + p.id + '" aria-label="' + esc(p.name) + ' 수량 줄이기">−</button>'
      + '<b>' + q + '</b>'
      + '<button data-inc="' + p.id + '" aria-label="' + esc(p.name) + ' 수량 늘리기">+</button>'
      + '</span>';
  }
  return '<button class="madd" data-add="' + p.id + '" aria-label="' + esc(p.name) + ' 담기">담기</button>';
}
function rowHtml(p){
  var sold = isSold(p);
  var badges = gradeChipHtml(p);
  var bs = (p.badges || []).slice(0, 2);
  for (var i=0;i<bs.length;i++) badges += '<span class="bdg ' + bs[i][1] + '">' + bs[i][0] + '</span>';
  var meta = (p.origin ? esc(p.origin) + " · " : "") + esc(p.unit);
  if (p.opts) meta += " · 옵션 " + p.opts.length + "가지";
  var price = p.opts
    ? money(basePrice(p)) + '원<span class="from">부터</span>'
    : money(priceOf(p, 0)) + '원';
  var cmt = commentOf(p);
  return '<article class="mrow' + (sold ? ' sold' : '') + '" data-id="' + p.id + '">'
    + '<div class="mleft">'
    +   (badges ? '<div class="mbadges">' + badges + '</div>' : '')
    +   '<h3>' + esc(p.name) + '</h3>'
    +   '<p class="mdesc">' + meta + '</p>'
    +   '<div class="mprice">' + price + stockBadgeHtml(p) + '</div>'
    +   (sold ? '' : (p.tip ? '<p class="tip">💡 ' + esc(p.tip) + '</p>' : ''))
    +   (cmt ? '<div class="cmt">💬 사장님 · ' + esc(cmt) + '</div>' : '')
    + '</div>'
    + '<div class="mright">'
    +   '<div class="mimg">' + thumb(p) + (sold ? '<span class="soldtag">품절</span>' : '')
    +     (!sold && p.opts && qtyOf(p.id) ? '<span class="mcnt">' + qtyOf(p.id) + '</span>' : '') + '</div>'
    +   (sold ? '<button class="madd sold" disabled aria-label="' + esc(p.name) + ' 품절">품절</button>' : rowAction(p))
    + '</div>'
    + '</article>';
}
function renderReorder(){
  var btn = $("#reorderBtn"), o = lastOrder();
  if (!btn) return;
  if (!o || !o.items || !o.items.length){ btn.hidden = true; return; }
  btn.hidden = false;
  btn.innerHTML = '🔁 지난번 시킨 거 그대로 담기 <span style="font-weight:800;color:#159C97">(' + o.items.length + '종)</span>';
}
function renderMenu(){
  var list = PRODUCTS.filter(matches);
  var h = "";
  for (var i=0;i<list.length;i++) h += rowHtml(list[i]);
  $("#menuList").innerHTML = h;
  $("#empty").hidden = list.length > 0;
  var cat = null;
  for (var k=0;k<CATS.length;k++) if (CATS[k].key === state.filter) cat = CATS[k];
  $("#menuTitle").textContent = state.q ? "‘" + state.q + "’ 검색 결과" : (cat ? cat.title : "오늘 입고 상품");
  $("#menuCount").textContent = list.length + "개 상품";
}

/* ── 오늘의 행사 (메뉴 목록 위 가로 카드) ─────────
   행사(cats:deal) 품목을 사진·가격이 크게 보이는 카드로 먼저 보여 준다.
   검색 중이거나 다른 카테고리를 골랐을 때는 메뉴 목록에 집중하도록 숨긴다. */
function dealProducts(){
  return PRODUCTS.filter(function(p){ return (p.cats || []).indexOf("deal") > -1; });
}
function dealCardHtml(p){
  var q = qtyOf(p.id);
  var price = p.opts
    ? money(basePrice(p)) + '원<span class="from">부터</span>'
    : money(priceOf(p, 0)) + '원';
  var flag = (p.badges && p.badges[0]) ? p.badges[0][0] : "행사";
  return '<article class="dcard" data-id="' + p.id + '">'
    + '<div class="dimg">' + thumb(p)
    +   '<span class="dflag">' + esc(flag) + '</span>'
    +   (q ? '<span class="dcnt">' + q + '</span>' : '') + '</div>'
    + '<div class="dt"><h3>' + esc(p.name) + '</h3>'
    +   '<p>' + esc((p.origin ? p.origin + " · " : "") + p.unit) + '</p>'
    +   '<div class="dprice">' + price + '</div></div>'
    + '<div class="dact">' + rowAction(p) + '</div>'
    + '</article>';
}
function renderDeals(){
  var sec = $("#dealSec");
  if (!sec) return;
  if (state.q.trim() || state.filter !== "all"){ sec.hidden = true; sec.innerHTML = ""; return; }
  var list = dealProducts().filter(function(p){ return !isSold(p); });
  if (!list.length){ sec.hidden = true; sec.innerHTML = ""; return; }
  var h = '<div class="dh"><h2>🔥 오늘의 행사</h2><span>' + list.length + '개 · 오늘만 이 가격</span></div>'
        + '<div class="dlist" id="dealList">';
  for (var i=0;i<list.length;i++) h += dealCardHtml(list[i]);
  sec.innerHTML = h + '</div>';
  sec.hidden = false;
}

/* ────────────────────────────────────────────────
   8. 담기 · 수량
   ──────────────────────────────────────────────── */
function add(pid, oi, qty){
  var p = byId(pid);
  if (!p) return;
  oi = oi || 0;
  qty = qty || 1;
  var found = null;
  for (var i=0;i<state.cart.length;i++){
    if (state.cart[i].pid === pid && state.cart[i].oi === oi){ found = state.cart[i]; break; }
  }
  if (found) found.qty += qty;
  else state.cart.push({pid: pid, oi: oi, qty: qty});
  syncBanana();
  save();
  renderAll();
  toast(p.name + (p.opts ? " · " + p.opts[oi].label : "") + " 담았어요");
}
function setQty(key, delta){
  for (var i=0;i<state.cart.length;i++){
    var l = state.cart[i];
    if (lineKey(l) === key){
      l.qty += delta;
      if (l.qty <= 0) state.cart.splice(i,1);
      break;
    }
  }
  syncBanana();
  save();
  renderAll();
}
function removeLine(key){
  state.cart = state.cart.filter(function(l){ return lineKey(l) !== key; });
  syncBanana();
  save();
  renderAll();
}
function bump(pid, delta){
  var key = pid + "|0";
  var has = false;
  for (var i=0;i<state.cart.length;i++) if (lineKey(state.cart[i]) === key){ has = true; break; }
  if (!has){ if (delta > 0) add(pid, 0, 1); return; }
  setQty(key, delta);
}

/* ────────────────────────────────────────────────
   9. 하단 장바구니 바
   ──────────────────────────────────────────────── */
function renderBar(){
  var n = count();
  var show = n > 0 && state.view === "shop";
  var bar = $("#cartbar");
  bar.hidden = !show;
  document.body.classList.toggle("hasbar", show);
  if (!show) return;
  $("#cbBadge").textContent = n;
  $("#cbAmt").textContent = money(payable()) + "원";
}

/* ────────────────────────────────────────────────
   10. 장바구니 화면
   ──────────────────────────────────────────────── */
function modeSegHtml(){
  return '<div class="seg">'
    + '<button data-mode="delivery"' + (state.mode==="delivery" ? ' class="on"' : '') + '>🛵 배달</button>'
    + '<button data-mode="pickup"' + (state.mode==="pickup" ? ' class="on"' : '') + '>🏪 포장</button>'
    + '</div>';
}
function zoneChipsHtml(){
  return '<div class="chips carts">'
    + '<button data-zone="city"' + (state.zone==="city" ? ' class="on"' : '') + '>원주 시내권 <em>3만원 이상</em></button>'
    + '<button data-zone="outer"' + (state.zone==="outer" ? ' class="on"' : '') + '>기업·태장·우산동 <em>5만원 이상</em></button>'
    + '</div>';
}
function cartRowHtml(l){
  var p = byId(l.pid), o = optOf(p, l.oi), k = lineKey(l), sold = isSold(p);
  return '<div class="crow' + (sold ? ' sold' : '') + '" data-key="' + k + '">'
    + '<div class="th">' + thumb(p) + '</div>'
    + '<div>'
    +   '<div class="nm">' + esc(p.name) + ' <span class="unit">' + esc(p.unit) + '</span>'
    +     (sold ? ' <span class="stockb">품절</span>' : '') + '</div>'
    +   (o ? '<div class="op">' + esc(o.label) + '</div>' : '')
    +   '<div class="pr"><b>' + money(linePrice(l) * l.qty) + '원</b>'
    +     '<button class="del" data-rm="' + k + '">삭제</button>'
    +     '<span class="stp">'
    +       '<button data-dec="' + k + '" aria-label="수량 줄이기">−</button>'
    +       '<b>' + l.qty + '</b>'
    +       '<button data-inc="' + k + '" aria-label="수량 늘리기">+</button>'
    +     '</span>'
    +   '</div>'
    + '</div></div>';
}
function hasSold(){
  for (var i=0;i<state.cart.length;i++){ var p = byId(state.cart[i].pid); if (p && isSold(p)) return p; }
  return null;
}
/* ── 사진 접수 (v5) ── */
var CLAIM_REASONS = ["상해서 왔어요", "눌리거나 터졌어요", "덜 익었어요", "너무 익었어요", "크기가 달라요", "수량이 달라요"];
var claim = null;

function loadClaims(){
  try { var d = JSON.parse(localStorage.getItem(CLAIM_KEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function saveClaims(list){
  list = list.slice(0, 12);
  try { localStorage.setItem(CLAIM_KEY, JSON.stringify(list)); return true; } catch(e){}
  /* 사진 때문에 저장 공간이 모자라면 오래된 접수부터 사진을 줄여 다시 시도 */
  for (var i=list.length-1;i>0;i--){
    list[i].photos = (list[i].photos || []).slice(0,1);
    try { localStorage.setItem(CLAIM_KEY, JSON.stringify(list)); return true; } catch(e2){}
  }
  return false;
}
function claimStatusLabel(c){
  if (!c) return "";
  if (c.status === "done") return "보상 완료";
  if (c.status === "rejected") return "확인 완료";
  return "사장님 확인 중";
}
function claimBadgeLine(){
  var list = loadClaims();
  if (!list.length) return "";
  return "접수한 사진 " + list.length + "건 · " + claimStatusLabel(list[0]);
}
function gbadgeHtml(){
  var line = claimBadgeLine();
  return '<div class="gbadge" data-claim="1">'
    + '<span class="gi">🛡</span>'
    + '<div class="gb-t"><b>수령 당일 이상 시 사진 접수 · 확인 후 보상</b>'
    + '<small>사진 한 장 올려 주시면 사장님이 확인하고 부분환불·교환으로 보상해 드려요 · 문의 033-765-1531</small>'
    + (line ? '<span class="gb-cl">📷 ' + esc(line) + '</span>' : '')
    + '</div>'
    + '<button class="gbtn" data-claim="1">📷 사진 접수</button></div>';
}
function renderClaimBadge(){
  var el = $("#menuClaim");
  if (el) el.innerHTML = gbadgeHtml();
}
/* 과일 등급 안내 — 네 단계를 한눈에 */
function renderGradeGuide(){
  var el = $("#gradeGuide");
  if (!el) return;
  var h = '<div class="gguide"><div class="gg-h"><b>🍓 과일 등급 안내</b><span>4단계로 골라 드세요</span></div><ul>';
  for (var i=0;i<GRADE_ORDER.length;i++){
    var g = GRADES[GRADE_ORDER[i]];
    h += '<li><span class="gchip ' + g.cls + '">' + g.name + ' · ' + g.tag + '</span>'
      + '<span class="gd">' + g.why + '</span></li>';
  }
  h += '</ul><p class="gg-note">등급은 크기·모양 기준이에요. 어느 등급이든 맛은 사장님이 확인하고 보내 드리고, 이상하면 수령 당일 사진 접수로 보상해 드려요.</p></div>';
  el.innerHTML = h;
}
/* 무료배달까지 남은 금액을 채울 채소 추천 */
function fillCardHtml(){
  var gap = remaining(), h = '';
  h += '<div class="fillcard" id="fillCard"><b>1,500원~3,000원 채소 하나 더 담고 무료배달 받기</b>'
    +  '<p>무료배달까지 ' + money(gap) + '원 남았아요 · 아래에서 바로 담아 보세요</p><div class="filllist">';
  for (var i=0;i<FILL_IDS.length;i++){
    var p = byId(FILL_IDS[i]);
    if (!p) continue;
    var sold = isSold(p), inCart = qtyOf(p.id) > 0;
    h += '<div class="fitem"><div class="fi">' + thumb(p) + '</div>'
      +  '<div class="fn"><b>' + esc(p.name) + '</b><small>' + esc(p.unit) + ' · ' + money(priceOf(p, 0)) + '원'
      +  (sold ? ' · 품절' : (inCart ? ' · ' + qtyOf(p.id) + '개 담김' : '')) + '</small></div>'
      +  (sold ? '<button class="sold" disabled>품절</button>'
              : '<button data-fillbtn="' + p.id + '">+ 담기</button>') + '</div>';
  }
  return h + '</div></div>';
}
/* 최근 주문자 · 배송지 */
function maskAddr(a){ if (!a) return ""; return a.length > 24 ? a.slice(0, 24) + "…" : a; }
function recentCardHtml(){
  var r = state.recent;
  if (!r) return '';
  var line = esc(r.name) + ' · ' + esc(r.phone) + (r.addr ? ' · ' + esc(maskAddr(r.addr)) : '');
  return '<div class="recentcard" id="recentCard"><span style="font-size:18px;line-height:1">📍</span>'
    + '<div class="rt"><b>최근 배송지 불러오기</b><small>' + line + '</small></div>'
    + '<button id="loadRecent">불러오기</button></div>';
}
/* 원터치 요청사항 칩 */
function reqChipsHtml(){
  var list = state.mode === "pickup" ? reqPickupChips() : REQ_DELIVERY, h = '<div class="reqchips">';
  for (var i=0;i<list.length;i++){
    var t = list[i], on = state.form.memo.indexOf(t) > -1;
    h += '<button class="' + (on ? 'on' : '') + '" data-req="' + esc(t) + '">' + esc(t) + '</button>';
  }
  return h + '</div>';
}
function couponCardHtml(){
  var st = couponState(), gap = couponGap();
  var h = '<div class="ticket' + (st === "on" ? ' live' : (st === "used" ? ' used' : '')) + '" id="cpTicket">'
    + '<span class="tk-ico">🎟️</span>'
    + '<div class="tk-t"><b>포장 1,000원 할인 쿠폰</b>'
    + '<small>15,000원 이상 포장 주문 · 오늘 하루 1회</small>';
  if (st === "on")        h += '<p class="tk-s on">이번 주문에 적용됐어요 · -1,000원</p>';
  else if (st === "used")  h += '<p class="tk-s used">오늘 쿠폰 사용 완료 · 내일 다시 쓸 수 있어요</p>';
  else if (st === "need")  h += '<p class="tk-s need">' + money(gap) + '원 더 담으면 포장 1,000원 쿠폰 사용 가능</p>';
  else if (st === "delivery") h += '<p class="tk-s need">포장으로 바꾸면 바로 쓸 수 있어요</p>';
  else                     h += '<p class="tk-s need">포장 주문에 담으면 바로 쓸 수 있어요</p>';
  h += '</div><div class="tk-r">';
  if (st === "on")            h += '<span class="tk-chip on">적용됨</span>';
  else if (st === "used")      h += '<span class="tk-chip used">사용 완료</span>';
  else if (st === "delivery")  h += '<button class="tk-chip btn" data-mode="pickup">포장으로 변경</button>';
  else                         h += '<span class="tk-chip need">15,000원</span>';
  return h + '</div></div>';
}
/* ── 이번 주문 혜택 조건 (장바구니·주문서 공용) ──
   바나나 100원은 배달 전용, 포장 쿠폰은 포장 전용이라 한 주문에 함께 쓸 수 없다.
   최소금액은 일반 상품 합계로 보고, 100원 이벤트 바나나는 여기에 넣지 않는다. */
function benefitChip(text, cls){ return '<span class="bf-s ' + cls + '">' + text + '</span>'; }
function benefitsCardHtml(){
  var bst = bananaState(), cst = couponState();
  var bTxt, bCls, bSub = "배달 전용 · 일반 상품 3만 원 이상 · 하루 1회 · 주문당 1송이";
  if (bst === "used"){ bTxt = "오늘 사용 완료"; bCls = "used"; bSub += " · 내일 다시 쓸 수 있어요"; }
  else if (bst === "off"){ bTxt = "배달 주문에만"; bCls = "off"; }
  else if (bst === "need"){ bTxt = money(eventGap()) + "원 더"; bCls = "need"; bSub += " · " + money(eventGap()) + "원 남았어요"; }
  else if (bst === "on"){ bTxt = "적용됨"; bCls = "on"; }
  else if (bst === "ready"){ bTxt = "담을 수 있어요"; bCls = "ready"; }
  else { bTxt = "담기면 확인"; bCls = "off"; }

  var cSub = "포장 전용 · 1.5만 원 이상 · 하루 1회", cTxt, cCls;
  if (cst === "used"){ cTxt = "오늘 사용 완료"; cCls = "used"; cSub += " · 내일 다시 쓸 수 있어요"; }
  else if (cst === "need"){ cTxt = money(couponGap()) + "원 더"; cCls = "need"; cSub += " · " + money(couponGap()) + "원 남았어요"; }
  else if (cst === "on"){ cTxt = "적용됨"; cCls = "on"; }
  else if (cst === "empty"){ cTxt = "담기면 확인"; cCls = "off"; }
  else { cTxt = "포장 주문에만"; cCls = "off"; }

  return '<div class="bnft">'
    + '<div class="bf-h"><b>🎁 이번 주문 혜택 조건</b><span>각각 하루 1회</span></div>'
    + '<div class="bf-row"><span class="bf-ico">🍌</span>'
    +   '<div class="bf-t"><b>바나나 1송이 100원</b><small>' + bSub + '</small></div>' + benefitChip(bTxt, bCls) + '</div>'
    + '<div class="bf-row"><span class="bf-ico">🎟️</span>'
    +   '<div class="bf-t"><b>포장 1,000원 할인 쿠폰</b><small>' + cSub + '</small></div>' + benefitChip(cTxt, cCls) + '</div>'
    + '<p class="bf-note">· 🍌 배달 전용과 🎟️ 포장 전용은 <b>한 주문에 함께 쓸 수 없어요</b>.<br>'
    + '· 최소 주문금액은 <b>일반 상품 합계</b>로 계산해요 — 100원 이벤트 바나나는 포함되지 않아요.</p>'
    + '</div>';
}
/* ── 오픈 기념 이벤트 카드 (장바구니·주문서 공용) ── */
function bananaEventHtml(){
  if (!state.cart.length) return "";
  var bst = bananaState();
  /* 오늘 이미 써서 다음 주문부터는 담을 수 없다 */
  if (bst === "used"){
    return '<div class="bncard used" id="banCard">'
      + '<span class="bc-ico">🍌</span>'
      + '<div class="bc-t"><b>오늘 바나나 100원 이벤트는 사용했어요</b>'
      + '<small>하루 1회 · 내일 다시 100원에 담을 수 있어요 · 배달 3만 원 이상 · 주문당 1송이</small></div>'
      + '<span class="bc-chip">오늘 사용 완료</span></div>';
  }
  /* 포장(매장픽업) 주문 — 담을 수 없고 안내만 */
  if (bst === "off"){
    return '<div class="bncard off" id="banCard">'
      + '<div class="bc-t"><b>' + OPEN_EVENT.offNote + '</b>'
      + '<small>배달 전용 · 주문당 1송이 · 하루 1회 한정 · 배달로 바꾸면 100원에 담을 수 있어요</small></div>'
      + '</div>';
  }
  if (bst === "need"){
    return '<div class="bncard need" id="banCard">'
      + '<span class="bc-ico">🍌</span>'
      + '<div class="bc-t"><b>' + money(eventGap()) + '원만 더 담으면 바나나 1송이 100원에 추가할 수 있어요!</b>'
      + '<small>배달 전용 · 일반 상품 3만 원 이상 · 하루 1회 · 주문당 1송이 한정</small></div>'
      + '</div>';
  }
  var on = !!state.banana;
  return '<button type="button" class="bncard' + (on ? ' on' : '') + '" id="banCard" data-banana="toggle" role="checkbox" aria-checked="' + (on ? "true" : "false") + '">'
    + '<span class="bc-ico">🍌</span>'
    + '<div class="bc-t"><b>' + OPEN_EVENT.label + '</b>'
    + '<small>' + (on ? "추가됐어요 · 결제 금액에 100원이 더해져요 (주문당 1송이 · 하루 1회)" : "배달 3만 원 이상 · 주문당 1송이 · 하루 1회 한정") + '</small></div>'
    + '<span class="bc-ck" aria-hidden="true">' + (on ? "✓" : "") + '</span></button>';
}
function toggleBanana(){
  if (state.mode !== "delivery"){
    toast(OPEN_EVENT.offNote);
    return;
  }
  if (bananaUsedToday()){
    toast("오늘은 이미 사용했어요 · 바나나 100원은 내일 다시 담을 수 있어요");
    return;
  }
  if (!eventReady()){
    toast("3만 원 이상 담으면 바나나 1송이를 100원에 추가할 수 있어요 (" + money(eventGap()) + "원 남음)");
    return;
  }
  state.banana = !state.banana;
  save();
  renderAll();
  if (state.banana) toast("🍌 바나나 1송이 100원 · 이번 주문에 담았어요");
}
function sumRowsHtml(){
  var sub = subtotal(), disc = pickupDiscount();
  var h = '<div class="srow"><span>상품 금액</span><b>' + money(sub) + '원</b></div>';
  if (disc > 0) h += '<div class="srow disc"><span>🎟️ 포장 할인 쿠폰</span><b>- ' + money(disc) + '원</b></div>';
  else if (state.mode === "pickup" && couponUsedToday()) h += '<div class="srow muted"><span>🎟️ 포장 할인 쿠폰</span><b>오늘 쿠폰 사용 완료</b></div>';
  else if (state.mode === "pickup" && sub < PICKUP_MIN) h += '<div class="srow muted"><span>🎟️ 포장 할인 쿠폰</span><b>' + money(couponGap()) + '원 더 담으면 사용</b></div>';
  if (state.mode === "delivery") h += '<div class="srow"><span>배달비</span><b>' + (meetMin() ? "0원 (무료배달)" : "무료배달 조건 미달") + '</b></div>';
  if (bananaPay() > 0) h += '<div class="srow ev"><span>🍌 [오픈특가] 바나나 1송이</span><b>+ ' + money(bananaPay()) + '원</b></div>';
  h += '<div class="srow total"><span>결제 금액</span><span class="v">' + money(payable()) + '원</span></div>';
  return h;
}
function renderCart(){
  if (state.view !== "cart") return;
  var body = $("#cartBody"), btn = $("#toCheckout");
  if (!state.cart.length){
    body.innerHTML = modeSegHtml()
      + '<div class="cartempty"><span class="em">🧺</span><b>장바구니가 비어 있어요</b>오늘 특가부터 담아 보세요.</div>'
      + (lastOrder() ? '<button class="reorder cart" id="reorderCart">🔁 지난번 시킨 거 그대로 담기</button>' : '')
      + gbadgeHtml();
    btn.disabled = true;
    btn.textContent = "0원 주문하기";
    return;
  }
  var h = modeSegHtml();
  h += '<p class="seghint">' + (state.mode === "pickup"
      ? "🏪 단구로 398 상가동 101호에서 받아 가세요 · 최소주문 없음<br>🕒 포장 가능 " + PICKUP_HOURS
      : (state.zone === "city" ? "🛵 원주 시내권 · 30,000원 이상 무료배달" : "🚛 기업·태장·우산동 · 50,000원 이상 무료배달")) + '</p>';
  if (state.mode === "delivery"){
    h += zoneChipsHtml();
    if (deliveryClosed()) h += deliveryClosedNote(false);
  }
  h += slotBoxHtml();
  h += '<div class="cartlist">';
  for (var i=0;i<state.cart.length;i++) h += cartRowHtml(state.cart[i]);
  h += '</div>';
  h += '<button class="morebtn" id="moreBtn">+ 더 담으러 가기</button>';
  h += bananaEventHtml();
  h += couponCardHtml();
  h += benefitsCardHtml();
  if (state.mode === "delivery" && remaining() > 0){
    var z = zoneInfo();
    h += '<div class="mincard"><b>' + z.short + ' 배달까지 ' + money(remaining()) + '원 남았어요</b>'
      + '<p>' + money(z.min) + '원부터 배달돼요. 포장은 최소주문 없이, 15,000원 넘으면 1,000원 쿠폰!</p>'
      + '<button data-mode="pickup">🏪 포장으로 변경하기</button></div>';
    h += fillCardHtml();
  }
  h += '<div class="sumcard">' + sumRowsHtml() + '</div>';
  h += gbadgeHtml();
  if (lastOrder()) h += '<button class="reorder cart" id="reorderCart">🔁 지난번 시킨 거 그대로 담기</button>';
  h += '<p class="note">포장 1,000원 할인 쿠폰은 15,000원 이상 주문에 하루 1회만 적용됩니다.</p>';
  body.innerHTML = h;

  var re = remaining(), soldP = hasSold();
  if (soldP){
    btn.disabled = true;
    btn.textContent = soldP.name + " 품절 · 장바구니에서 빼 주세요";
  } else if (state.mode !== "pickup" && re > 0){
    btn.disabled = true;
    btn.textContent = money(re) + "원 더 담으면 배달돼요";
  } else {
    btn.disabled = false;
    btn.textContent = money(payable()) + "원 주문하기";
  }
}

/* ────────────────────────────────────────────────
   11. 옵션 바텀시트
   ──────────────────────────────────────────────── */
function openOpt(pid){
  var p = byId(pid);
  if (!p || !p.opts) return;
  state.opt = {pid: pid, oi: 0, qty: 1};
  openSheet();
  renderOpt();
}
function renderOpt(){
  var o = state.opt; if (!o) return;
  var p = byId(o.pid), cur = p.opts[o.oi];
  $("#optTitle").textContent = p.name;
  var h = '<div class="optprod"><div class="th">' + thumb(p) + '</div>'
    + '<div><p class="og">' + esc(p.origin || "") + '</p><h4>' + esc(p.name) + '</h4>'
    + '<p>' + esc(p.desc || "") + ' · ' + esc(p.unit) + '</p></div></div>';
  h += '<div class="opts">';
  for (var i=0;i<p.opts.length;i++){
    var op = p.opts[i];
    h += '<button class="obtn' + (i===o.oi ? ' on' : '') + '" data-oi="' + i + '" role="radio" aria-checked="' + (i===o.oi) + '">'
      + '<span class="rad"></span>'
      + '<span class="ol">' + esc(op.label) + gradeChipHtml(p, i, true) + (op.sub ? '<span class="os">' + esc(op.sub) + '</span>' : '') + '</span>'
      + '<span class="op">' + money(op.price) + '원</span></button>';
  }
  h += '</div>';
  h += '<div class="qrow"><span class="ql">수량</span><span class="qu">' + money(cur.price) + '원 / 개</span>'
    + '<span class="qstp"><button id="optMinus" aria-label="수량 줄이기">−</button><b id="optQty">' + o.qty + '</b>'
    + '<button id="optPlus" aria-label="수량 늘리기">+</button></span></div>';
  if (p.warn) h += '<div class="warn">' + esc(p.warn) + '</div>';
  $("#optBody").innerHTML = h;
  $("#optAdd").textContent = money(cur.price * o.qty) + "원 담기";
  $("#optAdd").disabled = false;
}
function openSheet(){
  var t = $("#toast"); if (t) t.classList.remove("on");
  var el = $("#sheetOpt");
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeSheet(){
  var el = $("#sheetOpt");
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* ── 사진 접수 모달 ── */
function myOrderItems(){
  var o = lastOrder(), out = [];
  if (o && o.items){
    for (var i=0;i<o.items.length;i++){
      var it = o.items[i];
      out.push({pid: it.pid, orderNo: o.no,
        label: it.name + (it.opt ? " · " + it.opt : (it.unit ? " · " + it.unit : ""))});
    }
  }
  return out;
}
function openClaim(pid){
  closeSheet();
  var items = myOrderItems();
  claim = {
    stage: "form", items: items,
    pid: (pid && byId(pid)) ? pid : (items.length ? items[0].pid : ""),
    orderNo: "", reason: "", memo: "", photos: [],
    name: (state.recent && state.recent.name) || state.form.name || "",
    phone: (state.recent && state.recent.phone) || state.form.phone || ""
  };
  for (var i=0;i<items.length;i++) if (items[i].pid === claim.pid){ claim.orderNo = items[i].orderNo; break; }
  var fi = $("#claimFile");
  if (fi) fi.value = "";
  var el = $("#sheetClaim");
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderClaim();
}
function closeClaim(){
  var el = $("#sheetClaim");
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  claim = null;
}

/* ── 약관 · 정책 모달 (PG 심사용) ── */
var POLICIES = {
  terms: {
    title: "이용약관",
    body: '<p class="polmeta">시행일 2026년 11월 22일 · 훈이네과일야채 단구점</p>'
      + '<h4>제1조 (목적)</h4><p>이 약관은 훈이네과일야채 단구점(이하 “가게”)이 운영하는 소매 주문 화면(이하 “사이트”)에서 과일·채소·계란 등 신선식품을 주문하고 받는 데 필요한 조건과 절차를 정합니다.</p>'
      + '<h4>제2조 (상품과 가격)</h4><ul><li>표시 가격은 원화이며 부가세를 포함합니다.</li><li>신선식품은 입고 시세에 따라 가격이 바뀔 수 있고, 주문한 시점의 가격이 적용됩니다.</li><li>품절·입고 중단된 상품은 주문이 취소될 수 있으며, 이때는 고객센터로 먼저 연락드리고 결제 금액을 환불해 드립니다.</li></ul>'
      + '<h4>제3조 (주문과 계약 성립)</h4><ul><li>주문서를 보내면 가게가 내용을 확인한 뒤 접수하며, 그때 계약이 성립합니다.</li><li>배달 주문은 낮 12시까지 접수된 건을 당일 또는 익일 배달합니다. 기업도시·태장·우산동은 전날 주문 시 다음날 오전에 배송합니다.</li><li>주문 내용과 다르거나 연락이 닿지 않으면 가게가 주문을 취소할 수 있습니다.</li></ul>'
      + '<h4>제4조 (결제)</h4><ul><li>현재는 무통장입금(계좌입금)만 이용할 수 있습니다. 입금이 확인된 뒤 상품 준비와 배달이 시작됩니다.</li><li>신용·체크카드, 네이버페이, 카카오페이는 결제대행사(PG) 연결 준비 중이며, 연결이 끝나면 열어 드립니다. 가게는 카드번호 등 결제 정보를 저장하지 않습니다.</li></ul>'
      + '<h4>제5조 (배달과 수령)</h4><p>배달 권역·최소주문 금액·매장 픽업 시간은 <b>배송 및 교환·환불 정책</b>에 따릅니다. 주문서에 적어 주신 연락처로 배달 전에 연락드릴 수 있습니다.</p>'
      + '<h4>제6조 (취소·교환·환불)</h4><p>주문 취소, 교환, 환불은 <b>배송 및 교환·환불 정책</b>에서 정한 기준과 절차에 따릅니다.</p>'
      + '<h4>제7조 (신선식품의 특성)</h4><ul><li>과일·채소는 자연 상태 그대로라 크기·색·당도에 차이가 있을 수 있습니다.</li><li>상품에 표시된 등급(A급·품질보증 / 가정용·실속 가정용 / B급·알뜰 못난이 / C급·당일소진 초특가)은 그 차이를 미리 알려 드리기 위한 기준입니다.</li></ul>'
      + '<h4>제8조 (이용자의 의무)</h4><p>주문자는 받는 사람의 이름·연락처·주소를 정확히 적어 주시고, 받으실 수 있는 시간을 골라 주세요. 잘못된 정보로 배달이 되지 않아 생긴 문제는 가게가 책임지지 않습니다.</p>'
      + '<h4>제9조 (가게의 책임)</h4><p>천재지변, 도로·기상 상황, 주문 폭주 등 가게가 통제하기 어려운 사유로 배달이 늦어지거나 어려울 때는 먼저 연락드리고 일정을 다시 잡거나 결제 금액을 환불해 드립니다.</p>'
      + '<h4>제10조 (개인정보)</h4><p>주문 과정에서 받은 개인정보는 <b>개인정보처리방침</b>에 따라 처리합니다.</p>'
      + '<h4>제11조 (분쟁 해결)</h4><p>이 약관은 대한민국 법률에 따르며, 분쟁이 생기면 가게 소재지(강원특별자치도 원주시)를 관할하는 법원에 제기할 수 있습니다.</p>'
      + '<p class="pv">문의: 고객센터 010-9142-1531 · hhh3350@naver.com</p>'
  },
  privacy: {
    title: "개인정보처리방침",
    body: '<p class="polmeta">시행일 2026년 11월 22일 · 훈이네과일야채 단구점</p>'
      + '<p>훈이네과일야채 단구점(이하 “가게”)은 주문·배달과 사진 접수 응대에 꼭 필요한 정보만 받고 아래와 같이 처리합니다.</p>'
      + '<h4>1. 받는 정보</h4><ul><li><b>주문 시(필수)</b> 이름, 휴대폰번호, 배달 주문인 경우 배달 주소, 주문 상품·수량·금액, 받는 방법·시간, 요청사항</li><li><b>사진 접수 시(선택)</b> 상품 사진(최대 3장), 품목, 사유, 이름·연락처, 주문번호</li><li>광고·추적을 위한 쿠키나 위치정보는 받지 않습니다. 로그인 없이 주문할 수 있습니다.</li></ul>'
      + '<h4>2. 쓰는 목적</h4><ul><li>주문 접수·준비·배달·픽업 안내</li><li>주문 상태 안내와 문의 응대</li><li>사진 접수 확인과 교환·부분환불 처리</li><li>거래 기록 보관과 정산 확인(법령이 요구하는 범위)</li></ul><p>받은 정보를 위 목적 밖으로 쓰거나 광고 발송에 이용하지 않습니다.</p>'
      + '<h4>3. 보관과 파기</h4><ul><li>목적을 다한 정보는 지체 없이 파기합니다.</li><li>다만 전자상거래법에 따라 계약·청약철회 기록 5년, 대금결제·공급 기록 5년, 소비자 불만·분쟁 처리 기록 3년은 보관합니다.</li><li>사진 접수 자료는 보상 처리가 끝난 뒤 3개월 안에 삭제합니다.</li><li>전자 파일은 복구할 수 없게 삭제하고, 종이 문서는 분쇄합니다.</li></ul>'
      + '<h4>4. 다른 사람에게 주는 경우</h4><ul><li>원칙적으로 본인 동의 없이 제3자에게 제공하지 않습니다.</li><li>배달 주문은 배달 담당 기사에게 이름·연락처·주소를 배달에 필요한 만큼만 알려 드립니다.</li><li>법령에 따라 수사기관 등이 적법하게 요청하는 경우에는 제공할 수 있습니다.</li></ul>'
      + '<h4>5. 처리를 맡기는 곳(위탁)</h4><p>주문·재고 기록 보관을 클라우드 서버(Supabase Inc., 미국)에 위탁합니다. 정보는 인터넷을 통해 전송되어 저장되며, 보관 기간은 위 3항과 같습니다.</p>'
      + '<h4>6. 정보주체의 권리</h4><p>본인 정보의 열람·정정·삭제·처리정지를 언제든 요청하실 수 있습니다. 고객센터로 말씀해 주시면 본인 확인 후 지체 없이 처리합니다.</p>'
      + '<h4>7. 안전하게 관리하는 방법</h4><p>주문 정보는 암호화된 통신(HTTPS)으로 주고받고, 가게 관계자만 확인할 수 있도록 접근을 제한합니다.</p>'
      + '<h4>8. 아이의 정보</h4><p>만 14세 미만 아이의 개인정보는 받지 않습니다.</p>'
      + '<h4>9. 바뀔 때</h4><p>이 방침이 바뀌면 시행 7일 전에 이 화면에서 알려 드립니다.</p>'
      + '<p class="pv">개인정보 보호책임자: 황관훈 (대표)<br>문의: 010-9142-1531 · hhh3350@naver.com</p>'
  },
  shipping: {
    title: "배송 및 교환·환불 정책",
    body: '<p class="polmeta">시행일 2026년 11월 22일 · 훈이네과일야채 단구점</p>'
      + '<h4>1. 매장 픽업(포장)</h4><ul><li>받는 곳: 강원특별자치도 원주시 단구로 398, 상가동2동 1층 101호</li><li>최소주문 없음 · 포장 가능 시간 <b>09:00~20:00</b> · 그 안에서 준비되면 바로 수령(보통 30분 이내) 또는 오늘 오후 픽업</li><li>15,000원 이상 포장 주문에는 1,000원 할인 쿠폰을 하루 1회 쓸 수 있습니다.</li></ul>'
      + '<h4>2. 배달</h4><ul><li><b>원주 시내권</b>: 30,000원 이상 무료배달 · 낮 12시 이전 주문은 당일 또는 익일 배달</li><li>낮 12시가 지나 주문하시면 다음날 오전 배송으로 접수됩니다. 매장 포장은 영업시간 09:00~20:00 안에서 가능합니다.</li><li><b>기업도시·태장·우산동</b>: 50,000원 이상 무료배달 · 전날 주문 시 다음날 오전 배송</li><li>최소주문 금액에 못 미치면 배달이 되지 않아 주문 버튼이 잠기고, 포장으로 바꾸는 안내가 나옵니다.</li><li>비·눈이나 도로 사정으로 늦어지면 먼저 연락드립니다.</li></ul>'
      + '<h4>3. 신선식품 교환·환불</h4><p>과일·채소는 신선식품이라 받으신 날 상태를 확인해 주세요. 아래 경우에는 <b>사진 접수</b>로 알려 주시면 확인 후 <b>교환 또는 부분환불</b>로 보상해 드립니다.</p><ul><li>받은 날 상한·무른·곰팡이·파손 등 이상이 있는 경우</li><li>주문한 상품과 다르거나 수량이 모자란 경우</li><li>표시된 등급·규격과 현저히 다른 경우</li></ul>'
      + '<h4>4. 접수와 처리 절차</h4><ul><li>화면의 <b>📷 받은 상품 이상하면 사진 접수</b>를 눌러 사진(최대 3장)·품목·사유·연락처를 보내 주세요.</li><li>사장님이 사진을 확인한 뒤 연락드리고, 교환·부분환불·다음 주문 보상 중에서 알맞은 방법으로 처리합니다.</li><li>급하시면 고객센터 010-9142-1531로 전화 주세요. 접수번호(CL…)를 알려 주시면 바로 확인합니다.</li></ul>'
      + '<h4>5. 교환·환불이 어려운 경우</h4><ul><li>수령한 다음 날 이후에 알려 주신 경우(다만 보관 중 이상이 생긴 것이 확인되면 상담해 드립니다)</li><li>이미 드셨거나 조리하신 경우, 손질·보관을 잘못하신 경우</li><li>단순 변심으로 받으신 날 이후에 요청하신 경우</li></ul>'
      + '<h4>6. 환불 방법과 기한</h4><ul><li>신용·체크카드: 카드사 취소로 처리되며 보통 3~5영업일 걸립니다.</li><li>네이버페이·카카오페이: 해당 서비스의 취소 절차를 따릅니다.</li><li>무통장입금: 환불 계좌를 받아 3영업일 안에 보내 드립니다.</li><li>부분 환불은 실제 결제하신 금액을 기준으로 계산합니다.</li></ul>'
      + '<h4>7. 주문 취소</h4><p>준비를 시작하기 전(접수 단계)까지는 전화로 취소하실 수 있습니다. 준비가 시작된 신선식품은 취소가 어려울 수 있으니 빠르게 연락 주세요.</p>'
      + '<p class="pv">문의: 고객센터 010-9142-1531 · hhh3350@naver.com</p>'
  }
};
function openPolicy(key){
  var p = POLICIES[key];
  if (!p) return;
  var t = $("#toast"); if (t) t.classList.remove("on");
  $("#polTitle").textContent = p.title;
  $("#polBody").innerHTML = p.body;
  var body = $("#polBody").parentNode;
  if (body) body.scrollTop = 0;
  var el = $("#sheetPolicy");
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closePolicy(){
  var el = $("#sheetPolicy");
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function claimItemLabel(pid){
  var p = byId(pid);
  return p ? (p.name + " " + p.unit) : "상품";
}
function renderClaim(){
  if (!claim) return;
  var body = $("#claimBody"), foot = $("#claimFoot");
  if (!body || !foot) return;
  if (claim.stage === "done"){
    var s = claim.saved;
    body.innerHTML = '<div class="cdone"><span class="em">✅</span><b>사진 접수됐어요</b>'
      + '<p><b>' + esc(s.name) + '</b>님, <b>' + esc(s.itemLabel) + '</b> 건으로 접수했어요.<br>'
      + '사장님이 사진을 확인한 뒤 <b>부분환불·교환</b>으로 보상해 드려요.</p>'
      + '<span class="no">접수번호 ' + esc(s.no) + '</span>'
      + '<p style="margin-top:13px;font-size:12.5px;color:#8F8F8F">확인되는 대로 연락드려요 · 급하면 033-765-1531</p></div>';
    foot.innerHTML = '<button class="cta" data-close="claim">닫기</button>';
    return;
  }
  var sel = '<option value=""' + (!claim.pid ? ' selected' : '') + '>상품을 골라 주세요</option>', seen = {}, i, j;
  if (claim.items.length){
    sel += '<optgroup label="최근 주문 상품">';
    for (i=0;i<claim.items.length;i++){
      var it = claim.items[i];
      if (seen[it.pid]) continue;
      seen[it.pid] = 1;
      sel += '<option value="' + esc(it.pid) + '"' + (it.pid === claim.pid ? ' selected' : '') + '>' + esc(it.label) + '</option>';
    }
    sel += '</optgroup>';
  }
  sel += '<optgroup label="전체 상품">';
  for (j=0;j<PRODUCTS.length;j++){
    var p = PRODUCTS[j];
    if (seen[p.id]) continue;
    sel += '<option value="' + esc(p.id) + '"' + (p.id === claim.pid ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(p.unit) + '</option>';
  }
  sel += '</optgroup>';

  var rea = "";
  for (i=0;i<CLAIM_REASONS.length;i++){
    var r = CLAIM_REASONS[i];
    rea += '<button class="' + (claim.reason === r ? 'on' : '') + '" data-reason="' + esc(r) + '">' + esc(r) + '</button>';
  }
  var ph = '<div class="cphotos">';
  for (i=0;i<claim.photos.length;i++){
    ph += '<div class="cph"><img src="' + claim.photos[i] + '" alt="접수 사진 ' + (i+1) + '">'
      + '<button class="x" data-photo-del="' + i + '" aria-label="사진 빼기">✕</button></div>';
  }
  if (claim.photos.length < 3) ph += '<button class="cadd" data-photo-add><span class="ci">📷</span>사진 올리기</button>';
  ph += '</div>';

  body.innerHTML = '<div class="clintro">받으신 날 찍은 사진을 올려 주세요. 사장님이 보고 <b>부분환불·교환</b>으로 보상해 드려요.</div>'
    + '<div class="cfield"><label for="claimItem">어떤 상품인가요?</label><select id="claimItem">' + sel + '</select></div>'
    + '<div class="cfield"><label>어떤 점이 문제인가요? (하나 선택)</label><div class="creasons">' + rea + '</div></div>'
    + '<div class="cfield"><label>사진 (최대 3장 · 한 장 이상 꼭)</label>' + ph + '</div>'
    + '<div class="cfield"><label for="claimMemo">자세한 설명 (선택)</label>'
    + '<textarea id="claimMemo" placeholder="예: 딸기 두 알이 물러서 왔어요">' + esc(claim.memo) + '</textarea></div>'
    + '<div class="crow2"><div class="cfield"><label for="claimName">이름</label>'
    + '<input type="text" id="claimName" value="' + esc(claim.name) + '" placeholder="홍길동"></div>'
    + '<div class="cfield"><label for="claimPhone">연락처</label>'
    + '<input type="tel" id="claimPhone" inputmode="tel" value="' + esc(claim.phone) + '" placeholder="010-0000-0000"></div></div>'
    + '<p style="margin:12px 0 4px;font-size:11.5px;color:#8F8F8F;line-height:1.6">수령 당일 접수해 주시면 바로 확인해 드릴 수 있어요. 상품은 버리지 말고 사진만 남겨 주세요.</p>';
  foot.innerHTML = '<button class="cta" id="claimSend">사진 접수하기</button>';
}
function addClaimPhotos(files){
  if (!claim) return;
  var list = Array.prototype.slice.call(files || []);
  var room = 3 - claim.photos.length;
  if (room <= 0){ toast("사진은 3장까지 올릴 수 있어요"); return; }
  list = list.slice(0, room);
  if (!list.length) return;
  var left = list.length;
  function done(){ if (left === 0) renderClaim(); }
  list.forEach(function(f){
    if (!/^image\//.test(f.type || "")){ left--; done(); return; }
    var rd = new FileReader();
    rd.onload = function(){
      var img = new Image();
      img.onload = function(){
        try {
          var max = 900, w = img.width || max, h = img.height || max;
          var sc = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement("canvas");
          cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          claim.photos.push(cv.toDataURL("image/jpeg", 0.72));
        } catch(e){}
        left--; done();
      };
      img.onerror = function(){ left--; done(); };
      img.src = rd.result;
    };
    rd.onerror = function(){ left--; done(); };
    rd.readAsDataURL(f);
  });
}
function sendClaim(){
  if (!claim || claim.stage !== "form") return;
  if (!claim.pid || !byId(claim.pid)){ toast("어떤 상품인지 골라 주세요"); return; }
  if (!claim.photos.length){ toast("사진을 한 장 올려 주세요"); return; }
  if (!claim.reason){ toast("어떤 점이 문제인지 골라 주세요"); return; }
  if (!String(claim.name).trim()){ toast("이름을 적어 주세요"); return; }
  if (String(claim.phone).replace(/[^0-9]/g, "").length < 9){ toast("연락처를 확인해 주세요"); return; }
  var now = new Date();
  var no = "CL" + now.getFullYear() + String(now.getMonth()+1).padStart(2,"0") + String(now.getDate()).padStart(2,"0")
         + "-" + String(Math.floor(Math.random()*9000)+1000);
  var rec = {
    no: no, at: now.getTime(),
    time: String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0"),
    pid: claim.pid, itemLabel: claimItemLabel(claim.pid), orderNo: claim.orderNo || "",
    reason: claim.reason, memo: String(claim.memo).trim(),
    photos: claim.photos.slice(0),
    name: String(claim.name).trim(), phone: String(claim.phone).trim(),
    status: "checking", statusAt: now.getTime()
  };
  var list = loadClaims();
  list.unshift(rec);
  if (!saveClaims(list)){ toast("사진 저장 공간이 부족해요 · 장수를 줄여 주세요"); return; }
  pushClaim(rec);            /* 공용 DB에 올려 사장님 화면에 바로 보이게 */
  claim.saved = rec;
  claim.stage = "done";
  renderClaim();
  renderClaimBadge();
  toast("사진 접수 완료 · 사장님 확인 중");
}

/* ────────────────────────────────────────────────
   12. 화면 전환
   ──────────────────────────────────────────────── */
function showView(v){
  state.view = v;
  $("#viewShop").hidden = v !== "shop";
  $("#viewCart").hidden = v !== "cart";
  $("#viewCheckout").hidden = v !== "checkout";
  $("#viewDone").hidden = v !== "done";
  document.body.classList.toggle("hasfoot", v === "cart" || v === "checkout");
  if (v !== "shop") window.scrollTo(0, 0);
  renderBar();
}
function openCart(){ showView("cart"); renderCart(); window.scrollTo(0,0); }
function goCheckout(){
  if (!state.cart.length) return;
  showView("checkout");
  renderCheckout();
  window.scrollTo(0,0);
}
function renderAll(){
  renderMode();
  renderDeals();
  renderMenu();
  renderGradeGuide();
  renderClaimBadge();
  renderBar();
  renderCart();
  renderOrderStrip();
  renderReorder();
  if (state.view === "checkout") renderCheckout();
}

/* 지난번 주문 그대로 담기 */
function reorderLast(){
  var o = lastOrder();
  if (!o || !o.items || !o.items.length){ toast("지난 주문이 없어요"); return; }
  var items = [];
  for (var i=0;i<o.items.length;i++){
    var it = o.items[i], p = byId(it.pid);
    if (!p || isSold(p)) continue;
    items.push({pid: it.pid, oi: it.oi || 0, qty: it.qty});
  }
  if (!items.length){ toast("지난번 상품이 지금은 품절이에요"); return; }
  state.cart = items;
  state.mode = o.mode === "pickup" ? "pickup" : "delivery";
  if (o.zone && ZONES[o.zone]) state.zone = o.zone;
  if (o.slot) state.slots[ctxKey()] = o.slot;
  syncBanana(true);
  save(); renderAll();
  toast("지난번 주문 " + count() + "개를 담았어요");
}

/* 진행 중인 내 주문 띠 (사장님이 상태 바꾸면 같이 바뀜) */
function renderOrderStrip(){
  var el = $("#ordStrip");
  if (!el) return;
  var o = lastOrder();
  if (!o){ el.hidden = true; el.innerHTML = ""; return; }
  var st = statusLabel(o), stt = oStatus(o), done = stt === "done", cx = stt === "canceled";
  el.hidden = false;
  el.innerHTML = '<span class="oi">' + (cx ? "❌" : (done ? "✅" : "📦")) + '</span>'
    + '<div class="ot"><b>' + esc(o.no) + ' · ' + st + '</b>'
    + '<small>' + (o.mode === "pickup" ? "🏪 포장" : "🛵 배달") + ' · ' + esc(o.slotLabel || "") + ' · ' + money(o.total) + '원'
    + (cx && o.cancelReason ? ' · 사유 ' + esc(o.cancelReason) : '') + '</small></div>'
    + '<span class="os' + (cx ? " cx" : (done ? " done" : "")) + '">' + st + '</span>'
    + '<button id="stripView">상세</button>';
  var b = $("#stripView");
  if (b) b.addEventListener("click", function(){ showDone(o); window.scrollTo(0,0); });
}

/* ────────────────────────────────────────────────
   13. 주문서
   ──────────────────────────────────────────────── */
function loginBoxHtml(){
  /* 로그인 없이 주문한다 (개인정보처리방침 1항) — 주문자 정보는 아래에 직접 적는다 */
  if (state.user && state.user.name){
    var lab = state.user.provider === "naver" ? "🟢 네이버" : "🟡 카카오";
    return '<div class="who">' + lab + ' ' + esc(state.user.name) + '님으로 주문 중'
      + '<button id="ckLogout">로그아웃</button></div>';
  }
  return '';
}
function renderCheckout(){
  if (state.view !== "checkout") return;
  var f = state.form, z = zoneInfo();
  /* 무통장입금만 받는다 — 다른 값이 남아 있으면 되돌린다 */
  if (f.pay !== PAY_ONLY) f.pay = PAY_ONLY;

  var h = '<section class="csec"><h3><span class="sn">1</span>주문자 정보</h3>'
    + loginBoxHtml()
    + '<div class="field" id="fName"><label for="ckName">이름</label>'
    +   '<input id="ckName" value="' + esc(f.name) + '" placeholder="홍길동" autocomplete="name">'
    +   '<span class="err">이름을 입력해 주세요</span></div>'
    + '<div class="field" id="fPhone"><label for="ckPhone">휴대폰 번호</label>'
    +   '<input id="ckPhone" inputmode="tel" value="' + esc(f.phone) + '" placeholder="010-0000-0000" autocomplete="tel">'
    +   '<span class="err">전화번호를 정확히 입력해 주세요</span></div>'
    + '<div class="field"><label for="ckDepositor">입금자명 (선택)</label>'
    +   '<input id="ckDepositor" value="' + esc(f.depositor) + '" placeholder="주문자와 다를 때만 입력" autocomplete="off">'
    +   '<span class="fhint">무통장입금으로 보낼 때 확인용이에요</span></div>'
    + recentCardHtml()
    + '</section>';

  h += '<div class="band"></div>'
    + '<section class="csec"><h3><span class="sn">2</span>받는 방법</h3>'
    + modeSegHtml();
  if (state.mode === "delivery"){
    h += zoneChipsHtml();
    if (deliveryClosed()) h += deliveryClosedNote(true);
    if (remaining() > 0) h += '<div class="mincard" style="margin:12px 0 0"><b>' + z.short + ' 배달까지 ' + money(remaining()) + '원 남았어요</b>'
      + '<p>' + money(z.min) + '원부터 배달돼요. 포장은 최소주문 없이, 15,000원 넘으면 1,000원 쿠폰!</p>'
      + '<button data-mode="pickup">🏪 포장으로 변경하기</button></div>';
    h += '<div class="field" id="fAddr" style="margin-top:12px"><label for="ckAddr">배달 주소</label>'
      + '<input id="ckAddr" value="' + esc(f.addr) + '" placeholder="예: 단구동 ○○아파트 101동 1001호" autocomplete="street-address">'
      + '<span class="err">배달 주소를 입력해 주세요</span></div>';
  } else {
    h += (pickupOpenNow() ? '' : pickupClosedNote(true))
      + '<div class="warn green" style="margin-top:12px">🏪 <b>포장(매장픽업)</b> · 포장 가능 시간 <b>' + PICKUP_HOURS + '</b><br>' + STORE.addr + '<br>전화 ' + STORE.tel
      + (pickupOpenNow() ? ' · 준비되면 바로 가져가실 수 있어요.' : ' · 지금 주문은 내일 오전 9시 이후 픽업이에요.') + '</div>';
  }
  h += slotBoxHtml();
  h += '<div class="field" style="margin-top:14px"><label for="ckMemo">요청사항 (선택)</label>'
    + '<input id="ckMemo" value="' + esc(f.memo) + '" placeholder="예: 덜 익은 걸로 주세요 / 문 앞에 놔주세요">'
    + reqChipsHtml() + '</div>'
    + gbadgeHtml()
    + '</section>';

  h += '<div class="band"></div>'
    + '<section class="csec"><h3><span class="sn">3</span>주문 메뉴 <Span style="font-size:13px;color:#8F8F8F;font-weight:700">' + count() + '개</Span></h3>'
    + '<div class="oitems">';
  for (var i=0;i<state.cart.length;i++){
    var l = state.cart[i], p = byId(l.pid), o = optOf(p, l.oi);
    h += '<div class="oi"><div class="th">' + thumb(p) + '</div>'
      + '<div><div class="nm">' + esc(p.name) + ' <span class="unit">' + esc(p.unit) + '</span></div>'
      + '<div class="op">' + (o ? esc(o.label) + ' · ' : '') + l.qty + '개</div></div>'
      + '<div class="p">' + money(linePrice(l) * l.qty) + '원</div></div>';
  }
  h += '</div>';
  h += bananaEventHtml();
  h += '</section>';

  h += '<div class="band"></div>'
    + '<section class="csec"><h3><span class="sn">4</span>결제 수단</h3>'
    + '<p class="hint">지금은 <b>무통장입금</b>만 받아요. 아래 계좌로 입금하시면 사장님이 확인한 뒤 준비해서 보내드려요. 카드·간편결제는 PG 준비 중이라 고를 수 없어요.</p><div class="pays">';
  for (var j=0;j<PAYS.length;j++){
    var py = PAYS[j], off = (py.key !== PAY_ONLY);
    h += '<button class="paybtn' + (f.pay===py.key ? ' on' : '') + (off ? ' off' : '') + '" data-pay="' + py.key + '"'
      + (off ? ' disabled aria-disabled="true"' : '') + '>'
      + '<span>' + py.icon + '</span>' + py.label
      + (off ? '<i class="pgsoon">PG 준비 중</i>' : '') + '</button>';
  }
  /* 무통장입금만 받으므로 계좌 박스는 누르지 않아도 항상 보이게 */
  h += '</div>' + bankBoxHtml(payable()) + rcptHtml()
    + '<div class="agree' + (f.agree ? '' : '') + '" id="agreeBox">'
    + '<input type="checkbox" id="agreeCk"' + (f.agree ? ' checked' : '') + '>'
    + '<span><b>주문 내용을 확인했고 주문에 동의합니다.</b><br>주문서를 보내면 사장님이 확인한 뒤 연락드려요.</span>'
    + '</div>'
    + '<p class="agreelinks"><button type="button" data-policy="terms">이용약관</button> · <button type="button" data-policy="privacy">개인정보처리방침</button> · <button type="button" data-policy="shipping">배송 및 교환·환불 정책</button>을 확인한 뒤 주문해 주세요.</p></section>';

  h += '<div class="band"></div>'
    + '<section class="csec"><h3><span class="sn">5</span>결제 금액</h3>'
    + '<div class="sumcard" style="margin:0">' + sumRowsHtml() + '</div>'
    + benefitsCardHtml()
    + '<p class="simnote">🕒 받는 시간: <b>' + curSlot().label + '</b><br>' + (state.mode === "pickup"
        ? (pickupDiscount() > 0
            ? "포장 1,000원 할인 쿠폰이 적용됐어요. 오늘 하루 1번 사용할 수 있어요."
            : (couponUsedToday()
                ? "오늘 쿠폰은 사용 완료했어요. 내일 다시 쓸 수 있어요."
                : "15,000원 이상 주문이면 포장 1,000원 쿠폰을 쓸 수 있어요 · " + money(couponGap()) + "원 남았어요."))
        : z.name + (meetMin() ? " · 무료배달 조건 충족" : " · 최소금액 미달")) + '</p>'
    + '</section>';

  $("#ckBody").innerHTML = h;
  bindCheckout();
  updatePayBtn();
}

function updatePayBtn(){
  var btn = $("#payBtn");
  var re = remaining(), soldP = hasSold();
  if (soldP){
    btn.disabled = true;
    btn.textContent = soldP.name + " 품절 · 장바구니에서 빼 주세요";
  } else if (state.cart.length && state.mode === "delivery" && re > 0){
    btn.disabled = true;
    btn.textContent = money(re) + "원 더 담으면 배달돼요";
  } else {
    btn.disabled = false;
    btn.textContent = money(payable()) + "원 주문하기";
  }
}

function bindCheckout(){
  var f = state.form;
  function bindInput(id, key, wrapId){
    var el = $("#" + id);
    if (!el) return;
    el.addEventListener("input", function(){
      f[key] = el.value;
      var w = $("#" + wrapId);
      if (w) w.classList.remove("bad");
    });
  }
  bindInput("ckName", "name", "fName");
  bindBankCopy();
  bindInput("ckPhone", "phone", "fPhone");
  bindInput("ckAddr", "addr", "fAddr");
  bindInput("ckMemo", "memo", "");
  bindInput("ckDepositor", "depositor", "");
  bindInput("ckRcptNo", "receiptNo", "");

  var ab = $("#agreeBox");
  if (ab) ab.addEventListener("click", function(e){
    if (e.target && e.target.id === "agreeCk") return;
    f.agree = !f.agree;
    $("#agreeCk").checked = f.agree;
  });
  var ck = $("#agreeCk");
  if (ck) ck.addEventListener("change", function(){ f.agree = ck.checked; });
  var lo = $("#ckLogout");
  if (lo) lo.addEventListener("click", logout);
}

function pay(){
  if (!state.cart.length){ toast("장바구니가 비어 있어요"); return; }
  var f = state.form;
  if (hasSold()){ toast(hasSold().name + "은(는) 품절이에요. 장바구니에서 빼 주세요"); return; }
  var bad = false;
  if (!f.name.trim()){ $("#fName").classList.add("bad"); bad = true; }
  var digits = f.phone.replace(/[^0-9]/g, "");
  if (digits.length < 9){ $("#fPhone").classList.add("bad"); bad = true; }
  if (state.mode === "delivery" && !f.addr.trim()){ $("#fAddr").classList.add("bad"); bad = true; }
  if (bad){ toast("주문자 정보를 확인해 주세요"); return; }
  if (f.receiptType && f.receiptType !== "none" && String(f.receiptNo || "").replace(/[^0-9]/g, "").length < 10){
    toast(f.receiptType === "expense" ? "현금영수증 사업자번호 10자리를 확인해 주세요" : "현금영수증 휴대폰번호를 확인해 주세요");
    return;
  }

  if (state.mode === "delivery" && remaining() > 0){
    toast(money(remaining()) + "원 더 담으면 배달돼요 · 포장은 " + PICKUP_HOURS + "에 가능!");
    return;
  }
  if (!f.agree){ toast("주문 내용 확인에 동의해 주세요"); $("#agreeBox").classList.add("bad"); return; }

  /* 제출 방어 — 어떤 경로로 값이 들어와도 무통장입금으로만 접수한다 */
  f.pay = PAY_ONLY;
  var btn = $("#payBtn");
  var payName = "무통장입금";
  for (var i=0;i<PAYS.length;i++) if (PAYS[i].key === PAY_ONLY) payName = PAYS[i].label;
  btn.disabled = true;
  btn.textContent = "주문 접수 중…";

  var usedCoupon = pickupDiscount() > 0;
  var usedBanana = bananaPay() > 0;      /* 이 주문에 100원 바나나를 썼으면 오늘은 더 못 쓴다 */
  var slot = curSlot();
  setTimeout(function(){
    var now = new Date();
    var no = "HN" + now.getFullYear() + String(now.getMonth()+1).padStart(2,"0") + String(now.getDate()).padStart(2,"0")
           + "-" + String(Math.floor(Math.random()*9000)+1000);
    var items = state.cart.map(function(l){
      var p = byId(l.pid), o = optOf(p, l.oi);
      return {pid: p.id, oi: l.oi, qty: l.qty, name: p.name, unit: p.unit,
              opt: o ? o.label : "", price: linePrice(l), sum: linePrice(l) * l.qty};
    });
    /* 오픈 기념 이벤트 바나나 — 일반 상품과 따로 한 줄로 기록 (재고 8송이 제한과 분리) */
    if (state.banana && eventReady()){
      items.push({pid: OPEN_EVENT.pid, oi: 0, qty: 1, name: OPEN_EVENT.name, unit: "",
                  opt: "", price: OPEN_EVENT.price, sum: OPEN_EVENT.price, event: true});
    }
    var ord = {
      no: no, at: now.getTime(),
      time: String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0"),
      mode: state.mode, zone: state.mode === "delivery" ? state.zone : "pickup",
      slot: slot.key, slotLabel: slot.label, eta: slot.eta,
      sub: subtotal(), disc: pickupDiscount(), pay: payName, total: payable(),
      eventBanana: bananaPay() > 0, eventName: (bananaPay() > 0 ? OPEN_EVENT.name : ""),
      name: f.name, phone: f.phone,
      depositor: String(f.depositor || "").trim(),
      receiptType: (f.receiptType || "none"),
      receiptNo: (f.receiptType && f.receiptType !== "none") ? String(f.receiptNo || "").trim() : "",
      receiptLabel: receiptLabel(f.receiptType),
      addr: state.mode === "delivery" ? f.addr : STORE.addr,
      memo: f.memo || "", items: items,
      status: "received", statusAt: now.getTime()
    };
    state.order = ord;
    state.orders.unshift(ord);
    rememberMyOrder(ord.no);
    saveOrders();
    pushOrder(ord);          /* 공용 DB에 올려 사장님 화면에 바로 보이게 */
    pushNewOrderAlert(ord);  /* 사장님 폰으로 새 주문 푸시 (실패해도 주문은 그대로) */
    saveRecent();
    decStock();
    if (usedCoupon) markCouponUsed();
    if (usedBanana) markBananaUsed();
    showDone(ord);
  }, 700);
}
/* 주문된 만큼 남은 수량 줄이기 — 사장님 페이지에 바로 반영 */
function decStock(){
  loadCatalog();
  var changed = false, patch = {};
  for (var i=0;i<state.cart.length;i++){
    var l = state.cart[i], p = byId(l.pid);
    var s = stockOf(p);
    if (s === null) continue;
    var o = state.catalog[p.id] || {};
    o.stock = Math.max(0, s - l.qty);
    state.catalog[p.id] = o;
    patch[p.id] = o.stock;
    changed = true;
  }
  if (!changed) return;
  try {
    var d = JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}") || {};
    d.items = state.catalog; d.updatedAt = Date.now();
    localStorage.setItem(CATALOG_KEY, JSON.stringify(d));
  } catch(e){}
  pushStockPatch(patch);    /* 줄어든 수량을 사장님 화면과 공용 DB에 같이 알린다 */
}

/* ────────────────────────────────────────────────
   14. 주문 완료
   ──────────────────────────────────────────────── */
function findOrder(no){
  for (var i=0;i<state.orders.length;i++) if (state.orders[i].no === no) return state.orders[i];
  return null;
}
function showDone(ord){
  var o = ord || state.order;
  if (!o) return;
  state.order = o;
  var live = findOrder(o.no) || o;
  var st = oStatus(live);
  var pick = o.mode === "pickup";
  var st2 = pick ? "픽업 가능" : "배달 시작";
  var moved = (st === "delivering" || st === "ready" || st === "done");
  var z = o.mode === "pickup" ? ZONES.pickup : ZONES[o.zone];
  var h = '<div class="dchk' + (st === "canceled" ? " cx" : "") + '">' + (st === "canceled" ? "✕" : (st === "delivering" ? "🛵" : (st === "ready" ? "🛍️" : "✓"))) + '</div>'
    + '<h1>' + statusHead(o, st) + '</h1>'
    + '<p class="sub">' + (st === "canceled"
        ? '<b>' + esc(o.name) + '</b>님, 주문이 취소되었어요.'
          + (o.cancelReason ? '<br><span>취소 사유: <b>' + esc(o.cancelReason) + '</b></span>' : '')
        : '<b>' + esc(o.name) + '</b>님, ' + (st === "received" ? '주문 고맙습니다.<br><span>' + statusMsg(live) + '</span>' : statusMsg(live))) + '</p>';

  if (st === "canceled"){
    h += '<div class="dtrack cx"><span class="on">접수</span><span class="on cx">취소</span><span>완료</span></div>';
  } else {
    h += '<div class="dtrack">'
      + '<span class="on">접수</span>'
      + '<span class="' + (moved ? 'on' : '') + '">' + st2 + '</span>'
      + '<span class="' + (st === "done" ? 'on' : '') + '">완료</span></div>';
  }
  h += '<div class="dcard">'
    + '<div class="drow no"><span>주문번호</span><b>' + o.no + '</b></div>'
    + '<div class="drow"><span>받는 방법</span><b>' + z.icon + ' ' + z.name + '</b></div>';
  if (o.mode === "pickup"){
    h += '<div class="drow"><span>수령 장소</span><b>' + STORE.addr + '</b></div>';
  } else {
    h += '<div class="drow"><span>배달 주소</span><b>' + esc(o.addr) + '</b></div>';
  }
  h += '<div class="drow"><span>받는 시간</span><b>' + esc(o.slotLabel || z.eta) + '</b></div>'
    + '<div class="drow"><span>진행 상태</span><b id="liveStatus">' + statusLabel(live) + '</b></div>'
    + '<div class="dmsg' + (st === "canceled" ? " cx" : "") + '" id="liveMsg">' + statusMsg(live) + '</div>'
    + '<div class="drow"><span>결제 수단</span><b>' + esc(o.pay) + '</b></div>'
    + (o.depositor ? '<div class="drow"><span>입금자명</span><b>' + esc(o.depositor) + '</b></div>' : '')
    + (o.receiptNo ? '<div class="drow"><span>현금영수증</span><b>' + esc(o.receiptLabel || receiptLabel(o.receiptType)) + ' ' + esc(o.receiptNo) + '</b></div>' : '')
    + '<div class="drow"><span>상품 금액</span><b>' + money(o.sub) + '원</b></div>'
    + (o.disc > 0 ? '<div class="drow disc"><span>🎟️ 포장 할인 쿠폰</span><b>- ' + money(o.disc) + '원</b></div>' : '')
    + '<div class="drow big"><span>결제 금액</span><b>' + money(o.total) + '원</b></div>'
    + '<div class="ditems">';
  for (var i=0;i<o.items.length;i++){
    var it = o.items[i];
    var lineNm = esc(it.name);
    if (it.opt && it.unit && it.opt.indexOf(it.unit) > -1) lineNm += ' · ' + esc(it.opt);
    else lineNm += (it.unit ? ' ' + esc(it.unit) : '') + (it.opt ? ' · ' + esc(it.opt) : '');
    h += '<div class="it"><span>' + lineNm + ' × ' + it.qty + '</span>'
      + '<span>' + money(it.sum) + '원</span></div>';
  }
  h += '</div></div>';
  /* 무통장입금 주문이면 완료 화면에도 계좌를 크게 보여 준다 — 단, 취소된 주문은 입금하지 말라고 알린다 */
  if (st === "canceled"){
    if (String(o.pay || "").indexOf("무통장") > -1){
      h += '<div class="cxpay">🏦 무통장입금 주문이에요 · <b>취소된 주문이니 입금하지 마세요.</b>'
        + '<span>이미 입금하셨다면 매장(' + STORE.tel + ')으로 연락 주세요.</span></div>';
    }
  } else if (String(o.pay || "").indexOf("무통장") > -1) h += bankBoxHtml(o.total);

  var guide = "";
  if (o.mode === "pickup"){
    guide = (st === "ready" || st === "done")
      ? "🏪 <b>매장에서 받아 가시면 됩니다.</b><br>단구로 398 상가동 101호 · 033-765-1531 · 포장 가능 시간 09:00~20:00"
      : "🏪 <b>포장 준비되면 문자로 알려 드려요.</b><br>단구로 398 상가동 101호 · 033-765-1531 · 포장 가능 시간 09:00~20:00";
    if (o.disc > 0) guide += "<br>1,000원 포장 할인 쿠폰은 오늘 하루 1번 사용할 수 있어요.";
  } else if (o.zone === "city"){
    guide = "🛵 <b>낮 12시 이전 주문은 당일 또는 익일 배달</b>이에요.<br>배달 전에 기사님이 " + esc(o.phone) + "로 연락드려요.";
  } else {
    guide = "🚛 <b>전날 발주 → 다음날 오전 배송</b>이에요.<br>배달 전에 기사님이 " + esc(o.phone) + "로 연락드려요.";
  }
  if (o.memo) guide += "<br><br>📝 요청사항: " + esc(o.memo);
  if (st === "done"){
    guide += "<br><br>맛있게 드세요! 다음에 또 뵙겠습니다.";
  } else if (st === "delivering"){
    guide += "<br><br>도착하면 기사님이 연락드려요. 위 진행 상태는 가게에서 <b>배달 완료</b>를 누르면 자동으로 바뀝니다.";
  } else if (st === "ready"){
    guide += "<br><br>오시는 길: 단구로 398 상가동2동 1층 101호. 위 진행 상태는 가게에서 <b>픽업 완료</b>를 누르면 자동으로 바뀝니다.";
  } else if (st === "accepted"){
    guide += "<br><br>✅ 가게에서 주문을 확인했어요. 준비가 끝나면 위 진행 상태가 자동으로 바뀝니다.";
  } else {
    guide += "<br><br>📦 가게에서 확인 중이에요. 위 진행 상태는 새로고침하지 않아도 자동으로 바뀝니다.";
  }
  if (st === "canceled"){
    /* 취소된 주문은 다른 안내 대신 취소 안내만 보여 준다 */
    guide = "❌ <b>주문이 취소되었어요.</b>"
      + (o.cancelReason ? "<br>취소 사유: <b>" + esc(o.cancelReason) + "</b>" : "")
      + "<br>무통장입금으로 입금하셨다면 매장(" + STORE.tel + ")으로 연락 주세요."
      + (o.memo ? "<br><br>📝 요청사항: " + esc(o.memo) : "");
  }
  h += '<div class="dguide' + (st === "canceled" ? " cx" : "") + '">' + guide + '</div>'
    + (st === "canceled" ? "" : '<button class="ghost" id="doneClaim">📷 받은 상품 이상하면 사진 접수</button>')
    + '<button class="cta" id="doneOk">확인</button>'
    + '<button class="ghost" id="doneAgain">장바구니 다시 보기</button>'
    + '<p class="dfoot">훈이네과일야채 단구점 · ' + STORE.addr + '<br>문의 ' + STORE.tel + '</p>';

  $("#doneBody").innerHTML = h;
  showView("done");
  window.scrollTo(0,0);
  bindBankCopy();
  var dc = $("#doneClaim");
  if (dc) dc.addEventListener("click", function(){
    var first = (o.items && o.items.length) ? o.items[0].pid : "";
    openClaim(first);
  });
  $("#doneOk").addEventListener("click", function(){
    state.cart = [];
    state.banana = false;
    state.form = {name: state.form.name, phone: state.form.phone, addr: "", memo: "", pay: state.form.pay, agree: false,
                  depositor: "", receiptType: "none", receiptNo: ""};
    save();
    renderAll();
    showView("shop");
    window.scrollTo(0,0);
  });
  $("#doneAgain").addEventListener("click", function(){
    showView("shop");
    renderAll();
    openCart();
  });
}

/* 메뉴 목록 · 상단 행사 카드 공통 클릭 처리 */
function menuTap(e){
  var addB = e.target.closest("[data-add]");
  if (addB){
    var p = byId(addB.getAttribute("data-add"));
    if (!p) return;
    if (p.opts) openOpt(p.id); else add(p.id, 0, 1);
    return;
  }
  var inc = e.target.closest("[data-inc]");
  if (inc){ bump(inc.getAttribute("data-inc"), 1); return; }
  var dec = e.target.closest("[data-dec]");
  if (dec){ bump(dec.getAttribute("data-dec"), -1); return; }
  var row = e.target.closest(".mrow, .dcard");
  if (row){
    var rp = byId(row.getAttribute("data-id"));
    if (rp && rp.opts) openOpt(rp.id);
  }
}

/* ────────────────────────────────────────────────
   15. 이벤트
   ──────────────────────────────────────────────── */
function bind(){
  /* 배달 / 포장 탭 */
  $("#modeTabs").addEventListener("click", function(e){
    var b = e.target.closest("[data-mode]");
    if (!b) return;
    setMode(b.getAttribute("data-mode"));
    if (state.view === "cart") renderCart();
  });

  /* 구역 칩 · 받는 시간 칩 */
  $("#modeBanner").addEventListener("click", function(e){
    var mb = e.target.closest("[data-mode]");
    if (mb){
      var mbDropped = setMode(mb.getAttribute("data-mode"), true);
      toast(state.mode === "pickup"
        ? (mbDropped ? "포장으로 바꿨어요 · 바나나 100원은 배달 전용이라 뺐어요"
                     : (pickupOpenNow() ? "포장 주문으로 바꿨어요 · 영업시간 " + PICKUP_HOURS + " 안에서 준비해 드려요"
                                        : "포장 주문으로 바꿨어요 · 지금은 영업시간이 아니라 내일 오전 9시 이후 픽업으로 예약돼요"))
        : "배달 주문으로 바꿨어요");
      return;
    }
    var b = e.target.closest("[data-zone]");
    if (b){
      state.zone = b.getAttribute("data-zone");
      save(); renderAll();
      return;
    }
    var sl = e.target.closest("[data-slot]");
    if (sl){
      state.slots[ctxKey()] = sl.getAttribute("data-slot");
      save(); renderAll();
    }
  });

  /* 지난번 주문 그대로 담기 */
  if ($("#reorderBtn")) $("#reorderBtn").addEventListener("click", reorderLast);

  /* 카테고리 */
  $("#catIn").addEventListener("click", function(e){
    var b = e.target.closest("[data-cat]");
    if (!b) return;
    state.filter = b.getAttribute("data-cat");
    renderCats(); renderDeals(); renderMenu();
    /* 고른 탭이 화면 밖에 있으면 가운데로 당겨 온다 */
    var nb = $("#catIn [data-cat='" + state.filter + "']");
    if (nb && nb.scrollIntoView){ try { nb.scrollIntoView({block:"nearest", inline:"center", behavior:"smooth"}); } catch(err){} }
  });

  /* 검색 */
  var q = $("#q"), t = null;
  q.addEventListener("input", function(){
    $("#qClear").hidden = !q.value;
    clearTimeout(t);
    t = setTimeout(function(){ state.q = q.value; renderDeals(); renderMenu(); }, 110);
  });
  q.addEventListener("keydown", function(e){ if (e.key === "Enter") q.blur(); });
  $("#qClear").addEventListener("click", function(){
    q.value = ""; state.q = ""; $("#qClear").hidden = true; renderDeals(); renderMenu(); q.focus();
  });

  /* 메뉴 담기 · 수량 · 옵션 열기 — 목록과 상단 행사 카드가 같은 동작 */
  $("#menuList").addEventListener("click", menuTap);
  if ($("#dealSec")) $("#dealSec").addEventListener("click", menuTap);

  /* 하단 장바구니 바 */
  $("#cartbar").addEventListener("click", openCart);
  $("#callBtn").addEventListener("click", function(){ toast("가게 전화 033-765-1531"); });

  /* 장바구니 화면 */
  $("#cartBody").addEventListener("click", function(e){
    var modeB = e.target.closest("[data-mode]");
    if (modeB){ setMode(modeB.getAttribute("data-mode")); return; }
    var zoneB = e.target.closest("[data-zone]");
    if (zoneB){ state.zone = zoneB.getAttribute("data-zone"); save(); renderAll(); return; }
    var slotB = e.target.closest("[data-slot]");
    if (slotB){ state.slots[ctxKey()] = slotB.getAttribute("data-slot"); save(); renderAll(); return; }
    var fillB = e.target.closest("[data-fillbtn]");
    if (fillB){ add(fillB.getAttribute("data-fillbtn"), 0, 1); return; }
    if (e.target.closest("#reorderCart")){ reorderLast(); return; }
    var inc = e.target.closest("[data-inc]");
    if (inc){ setQty(inc.getAttribute("data-inc"), 1); return; }
    var dec = e.target.closest("[data-dec]");
    if (dec){ setQty(dec.getAttribute("data-dec"), -1); return; }
    var rm = e.target.closest("[data-rm]");
    if (rm){ removeLine(rm.getAttribute("data-rm")); return; }
    if (e.target.closest("#moreBtn")){ showView("shop"); window.scrollTo(0,0); return; }
    if (e.target.closest("[data-banana]")){ toggleBanana(); return; }
  });
  $("#cartBack").addEventListener("click", function(){ showView("shop"); renderAll(); });
  $("#toCheckout").addEventListener("click", goCheckout);
  $("#ckBack").addEventListener("click", function(){ openCart(); });

  /* 옵션 시트 */
  $("#optBody").addEventListener("click", function(e){
    var ob = e.target.closest("[data-oi]");
    if (ob){ state.opt.oi = Number(ob.getAttribute("data-oi")); renderOpt(); return; }
    if (e.target.closest("#optMinus")){ if (state.opt.qty > 1) state.opt.qty--; renderOpt(); return; }
    if (e.target.closest("#optPlus")){ if (state.opt.qty < 99) state.opt.qty++; renderOpt(); return; }
  });
  $("#optAdd").addEventListener("click", function(){
    if (!state.opt) return;
    var o = state.opt;
    add(o.pid, o.oi, o.qty);
    closeSheet();
  });
  document.addEventListener("click", function(e){
    var pv = e.target.closest("[data-policy]");
    if (pv){
      openPolicy(pv.getAttribute("data-policy"));
      return;
    }
    var cl = e.target.closest("[data-claim]");
    if (cl){
      var want = cl.getAttribute("data-claim");
      openClaim(want && want !== "1" ? want : "");
      return;
    }
    var c = e.target.closest("[data-close]");
    if (c){
      var which = c.getAttribute("data-close");
      if (which === "claim") closeClaim();
      else if (which === "policy") closePolicy();
      else closeSheet();
    }
  });
  document.addEventListener("keydown", function(e){
    var el = $("#sheetPolicy");
    if (e.key === "Escape" && el && el.classList.contains("open")) closePolicy();
  });

  /* 사진 접수 */
  var cf = $("#claimFile");
  if (cf) cf.addEventListener("change", function(){ addClaimPhotos(cf.files); });
  $("#claimBody").addEventListener("click", function(e){
    var rs = e.target.closest("[data-reason]");
    if (rs && claim){ claim.reason = rs.getAttribute("data-reason"); renderClaim(); return; }
    if (e.target.closest("[data-photo-add]")){
      var f = $("#claimFile");
      if (f) f.click();
      return;
    }
    var del = e.target.closest("[data-photo-del]");
    if (del && claim){ claim.photos.splice(Number(del.getAttribute("data-photo-del")), 1); renderClaim(); return; }
  });
  $("#claimBody").addEventListener("change", function(e){
    if (e.target.id === "claimItem" && claim){
      claim.pid = e.target.value;
      claim.orderNo = "";
      for (var i=0;i<claim.items.length;i++) if (claim.items[i].pid === claim.pid) claim.orderNo = claim.items[i].orderNo || "";
    }
  });
  $("#claimBody").addEventListener("input", function(e){
    if (!claim) return;
    var t = e.target;
    if (t.id === "claimMemo") claim.memo = t.value;
    else if (t.id === "claimName") claim.name = t.value;
    else if (t.id === "claimPhone") claim.phone = t.value;
  });
  $("#claimFoot").addEventListener("click", function(e){
    if (e.target.closest("#claimSend")) sendClaim();
  });

  /* 결제 · 로그인 */
  $("#payBtn").addEventListener("click", pay);
  $("#ckBody").addEventListener("click", function(e){
    if (e.target.closest("[data-banana]")){ toggleBanana(); return; }
    var lg = e.target.closest("[data-login]");
    if (lg){ login(lg.getAttribute("data-login")); return; }
    var payB = e.target.closest("[data-pay]");
    if (payB){
      if (payB.getAttribute("data-pay") !== PAY_ONLY){
        toast("지금은 무통장입금만 받아요 · 카드·간편결제는 PG 준비 중이에요");
        return;
      }
      state.form.pay = PAY_ONLY; renderCheckout(); return;
    }
    var rcB = e.target.closest("[data-rcpt]");
    if (rcB){
      state.form.receiptType = rcB.getAttribute("data-rcpt");
      if (state.form.receiptType === "none") state.form.receiptNo = "";
      renderCheckout();
      return;
    }
    var modeB = e.target.closest("[data-mode]");
    if (modeB){ setMode(modeB.getAttribute("data-mode")); renderCheckout(); return; }
    var zoneB = e.target.closest("[data-zone]");
    if (zoneB){ state.zone = zoneB.getAttribute("data-zone"); save(); renderAll(); return; }
    var slotB = e.target.closest("[data-slot]");
    if (slotB){ state.slots[ctxKey()] = slotB.getAttribute("data-slot"); save(); renderCheckout(); return; }
    if (e.target.closest("#loadRecent")){ applyRecent(); renderCheckout(); toast("최근 주문 정보로 채웠어요"); return; }
    var rq = e.target.closest("[data-req]");
    if (rq){
      var t = rq.getAttribute("data-req"), memo = state.form.memo || "";
      if (memo.indexOf(t) > -1){
        state.form.memo = memo.split(" / ").filter(function(s){ return s && s !== t; }).join(" / ");
      } else {
        state.form.memo = memo ? memo + " / " + t : t;
      }
      var mi = $("#ckMemo");
      if (mi) mi.value = state.form.memo;
      rq.classList.toggle("on", state.form.memo.indexOf(t) > -1);
      return;
    }
  });

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ closeSheet(); closeClaim(); }
  });
}

/* ────────────────────────────────────────────────
   16. 시작
   ──────────────────────────────────────────────── */
function init(){
  load();
  loadCatalog();
  syncBanana(true);     /* 지난번에 담아 둔 이벤트 바나나가 조건에 안 맞으면 조용히 뺀다 */
  loadOrders();
  loadRecent();
  applyRecent();
  renderCats();
  renderMode();
  renderDeals();
  renderMenu();
  renderGradeGuide();
  renderClaimBadge();
  renderBar();
  renderCart();
  renderOrderStrip();
  renderReorder();
  bind();
  /* 사장님 페이지에서 가격·품절·주문 상태를 바꾸면 이 화면도 바로 바뀜 */
  window.addEventListener("storage", function(e){
    if (!e.key) return;
    if (e.key === CATALOG_KEY){
      loadCatalog(); renderAll();
      if (state.view === "checkout") renderCheckout();
    } else if (e.key === ORDERS_KEY){
      loadOrders(); renderOrderStrip();
      if (state.view === "done" && state.order) showDone(state.order);
    } else if (e.key === CLAIM_KEY){
      renderClaimBadge();
      if (state.view === "cart") renderCart();
      if (state.view === "checkout") renderCheckout();
    }
  });
  /* 다른 기기의 사장님·손님 화면과 공용 DB로 맞추기 (5초마다) */
  syncStart();
  /* 화면을 켜 둔 채 낮 12시를 넘기면 배달 안내를 자동으로 바꾼다 */
  var wasClosed = deliveryClosed(), wasPickupOpen = pickupOpenNow();
  setInterval(function(){
    var c = deliveryClosed(), po = pickupOpenNow();
    if (c === wasClosed && po === wasPickupOpen) return;
    wasClosed = c; wasPickupOpen = po;
    renderAll();
    if (state.view === "checkout") renderCheckout();
    if (c && state.mode === "delivery") toast("낮 12시가 지나 오늘 배달이 마감됐어요 · 포장은 " + (pickupOpenNow() ? PICKUP_HOURS + " 안에서 가능해요" : "내일 09:00부터 가능해요"));
    if (!po && state.mode === "pickup") toast("지금은 영업시간(" + PICKUP_HOURS + ")이 아니에요 · 내일 오전 9시 이후 픽업으로 바뀌었어요");
  }, 30000);
}

init();
