/* catalog.js — 상품 목록 · 사진 경로 · 카테고리 (손님·사장님 공용)
   사진은 assets/img/*.webp 파일. HTML 안에 base64 로 넣지 않습니다. */
/* 상품 사진 — 단일 HTML 안 base64(471KB)였던 35장을 파일로 분리 (lazy loading 실제 동작) */
var IMG = {
  strawberry: "assets/img/strawberry.webp?v=20261124b",
  tangerine: "assets/img/tangerine.webp?v=20261124b",
  goldenhwang: "assets/img/goldenhwang.webp?v=20261124b",
  apple: "assets/img/apple.webp?v=20261124b",
  banana: "assets/img/banana.webp?v=20261124b",
  cabbage: "assets/img/cabbage.webp?v=20261124b",
  fig: "assets/img/fig.webp?v=20261124b",
  persimmon: "assets/img/persimmon.webp?v=20261124b",
  daebong: "assets/img/daebong.webp?v=20261124b",
  kiwi: "assets/img/kiwi.webp?v=20261124b",
  mango: "assets/img/mango.webp?v=20261124b",
  shine: "assets/img/shine.webp?v=20261124b",
  pineapple: "assets/img/pineapple.webp?v=20261124b",
  jujube: "assets/img/jujube.webp?v=20261124b",
  chestnut: "assets/img/chestnut.webp?v=20261124b",
  blueberry: "assets/img/blueberry.webp?v=20261124b",
  campbell: "assets/img/campbell.webp?v=20261124b",
  pomegranate: "assets/img/pomegranate.webp?v=20261124b",
  orange: "assets/img/orange.webp?v=20261124b",
  tomato: "assets/img/tomato.webp?v=20261124b",
  cheonggat: "assets/img/cheonggat.webp?v=20261124b",
  altari: "assets/img/altari.webp?v=20261124b",
  daepa: "assets/img/daepa.webp?v=20261124b",
  aehobak: "assets/img/aehobak.webp?v=20261124b",
  buchu: "assets/img/buchu.webp?v=20261124b",
  cheongyang: "assets/img/cheongyang.webp?v=20261124b",
  kkwari: "assets/img/kkwari.webp?v=20261124b",
  potato: "assets/img/potato.webp?v=20261124b",
  carrot: "assets/img/carrot.webp?v=20261124b",
  mu: "assets/img/mu.webp?v=20261124b",
  onion: "assets/img/onion.webp?v=20261124b",
  lettuce: "assets/img/lettuce.webp?v=20261124b",
  sangchu: "assets/img/sangchu.webp?v=20261124b",
  perilla: "assets/img/perilla.webp?v=20261124b",
  egg: "assets/img/egg.webp?v=20261124b"
};

function P(o){ return o; }

/* ── 남은 수량(stock) 표기 기준 ──
   stock 은 '사장님이 직접 잡는 한정 수량'이다. 5 이하일 때만 손님 화면에 `오늘 N팩 남음` 배지가 뜬다.
   매일 들여오는 상시 품목(딸기·귤·사과·블루베리 등)은 여유 있는 수량으로 두어
   실제로 임박하지 않았는데 `2팩 남음` 같은 경고가 뜨지 않게 한다(2026-11-23 사장님 지적).
   품절·임박을 알리고 싶으면 사장님 페이지에서 그 품목의 남은 수량을 직접 낮추면 된다. */

var PRODUCTS = [
  /* ── 오늘특가 ── */

  P({id:"banana-deal", name:"바나나", unit:"1송이", cats:["deal"], img:"banana", grade:"normal",
     badges:[["행사","hot"]], origin:"필리핀산", desc:"일반 바나나 · 1송이 1,000원 · 오늘만 이 가격", price:1000, stock:8,
     tip:"노랗게 익으면 냉장 보관하세요", tags:["일반 바나나 행사"]}),

  P({id:"pineapple-deal", name:"감숙왕 파인애플", unit:"4개", cats:["deal"], img:"pineapple", grade:"home",
     badges:[["행사","hot"]], origin:"필리핀산", desc:"달콤한 감숙왕 4개 · 행사가", price:9900, tags:["파인애플"],
     tip:"뒤집어 하루 두면 더 달아져요"}),

  P({id:"daebong-15", name:"대봉감", unit:"15알", cats:["deal"], img:"daebong", grade:"C",
     badges:[["행사","hot"]], origin:"국내산", desc:"15알 행사 · 익혀 드세요", price:9900, tags:["감"]}),

  P({id:"blueberry", name:"블루베리", unit:"3팩", cats:["deal"], img:"blueberry", grade:"home",
     badges:[["행사","hot"]], origin:"칠레산", desc:"3팩 묶음 특가", price:9900, stock:30, tags:["베리"]}),

  /* ── 과일 ── */
  P({id:"strawberry", name:"딸기", unit:"1팩", cats:["fruit","deal"], img:"strawberry", grade:"A",
     ogrades:["home","A","A"],
     badges:[["행사","hot"],["오늘입고","fresh"]], origin:"국내산", desc:"향·당도 좋은 생딸기 · 4x5 1팩 7,900원", stock:60,
     tip:"냉장 2시간 뒤 드시면 더 달아요",
     opts:[{label:"4x5 · 1팩", sub:"가장 많이 담기는 사이즈", price:7900},
           {label:"3x5 · 1팩", sub:"알이 큰 사이즈", price:9900},
           {label:"3x4 · 1팩", sub:"선물용 큰 알", price:13800}],
     tags:["딸기"]}),

  /* 무화과 2가지 — 가정용(실속) 5,900원 · A급(품질보증) 9,900원 */
  P({id:"fig", name:"무화과 가정용", unit:"1kg", cats:["fruit"], img:"fig", grade:"home",
     badges:[["국내산","dom"]], origin:"국내산", desc:"실속 가정용 · 달콤한 무화과", price:5900, tags:["무화과"],
     tip:"냉장 1~2일 안에 드세요"}),

  P({id:"fig-a", name:"무화과 A급", unit:"1kg", cats:["fruit"], img:"fig", grade:"A",
     badges:[["국내산","dom"]], origin:"국내산", desc:"엄선한 품질보증 · 선물에도 좋은 A급", price:9900, tags:["무화과"],
     tip:"냉장 1~2일 안에 드세요"}),

  P({id:"mango", name:"골드망고", unit:"4개", cats:["fruit","deal"], img:"mango", grade:"home",
     badges:[["행사","hot"]], origin:"태국산", desc:"4개 한 세트 · 오늘 행사가", price:9900, tags:["망고"]}),

  P({id:"persimmon", name:"부유 단감", unit:"20알", cats:["fruit"], img:"persimmon", grade:"home",
     badges:[["정품","fresh"]], origin:"국내산", desc:"아삭한 부유 단감 20알", price:7900, tags:["감 부유"]}),

  P({id:"daebong-gift", name:"대봉감", unit:"4kg", cats:["fruit"], img:"daebong", grade:"A",
     badges:[["선물용","gift"]], origin:"국내산", desc:"선물용 박스 포장", price:15000, tags:["감"]}),

  P({id:"hwanggeumhyang", name:"황금향", unit:"3kg", cats:["fruit","deal"], img:"goldenhwang", grade:"A",
     badges:[["행사","hot"]], origin:"제주산", desc:"새콤달콤 황금향 · 3kg 행사가", price:12800, tags:["귤 감귤"]}),

  P({id:"tangerine", name:"제주 귤", unit:"5kg", cats:["fruit"], img:"tangerine", grade:"home",
     ogrades:["A","A","B","B"],
     badges:[], origin:"제주산", desc:"사이즈·품종 골라 담기", stock:40,
     tip:"한두 알 껍질을 벗겨 두었다 드세요",
     opts:[{label:"다우렁 M · 5kg", price:20000},
           {label:"유라조생 M · 5kg", price:30000},
           {label:"서귀포 B급 M · 5kg", price:12800},
           {label:"서귀포 B급 S/2S · 5kg", price:15000}],
     tags:["귤 감귤"]}),

  P({id:"emperor", name:"중문 황제귤", unit:"5kg · M", cats:["fruit"], img:"tangerine", grade:"A",
     badges:[["프리미엄","gift"]], origin:"제주 중문", desc:"중문 명품 귤 M 사이즈", price:36000, tags:["귤 감귤"]}),

  P({id:"newstein", name:"윤홍희 뉴스틴 포도", unit:"2kg", cats:["fruit"], img:"shine", grade:"A",
     badges:[], origin:"국내산", desc:"샤인머스켓과 비슷한 포도 · 망고스틴 맛과 식감", price:15000, tags:["포도 샤인 뉴스틴"],
     tip:"망고스틴을 연상시키는 맛과 식감! 샤인머스켓과 비슷한 포도 · 당도 자신!"}),

  P({id:"bansee", name:"반시", unit:"2.5kg · M", cats:["fruit"], img:"persimmon", grade:"C",
     badges:[], origin:"국내산", desc:"M 사이즈 2.5kg", price:5000, tags:["감 홍시"]}),

  P({id:"shine", name:"샤인머스켓", unit:"송이", cats:["fruit"], img:"shine", grade:"home",
     ogrades:["home","A","A"],
     badges:[], origin:"국내산", desc:"수·중량 골라 담기", tip:"씻지 말고 먹기 직전에 씻으세요",
     opts:[{label:"2kg · 4수", price:7900},
           {label:"3kg · A급", price:20000},
           {label:"4kg · 6수", price:20000}],
     tags:["포도 샤인머스켓"]}),

  P({id:"pineapple", name:"파인애플", unit:"1통", cats:["fruit"], img:"pineapple", grade:"home",
     badges:[], origin:"필리핀산", desc:"1통 그대로", price:7500, tags:["파인애플"]}),

  P({id:"pomegranate", name:"석류", unit:"1통", cats:["fruit"], img:"pomegranate", grade:"home",
     badges:[], origin:"미국산", desc:"알 굵은 석류", price:5000, tags:["석류"]}),

  P({id:"apple", name:"안동 부사사과", unit:"15개", cats:["fruit"], img:"apple", grade:"home",
     ogrades:["home","A"],
     badges:[], origin:"안동", desc:"아삭한 안동 부사", stock:40, tip:"흐르는 물에 씻어 껍질째 드세요",
     opts:[{label:"15개", sub:"가정용", price:9900},
           {label:"10kg", sub:"한 상자", price:25000}],
     tags:["사과 부사"]}),

  P({id:"orange", name:"오렌지", unit:"1봉지", cats:["fruit"], img:"orange", grade:"home",
     badges:[], origin:"호주산", desc:"1봉지 특가", price:9900, tags:["오렌지"]}),

  P({id:"greenkiwi", name:"그린키위", unit:"1팩", cats:["fruit"], img:"kiwi", grade:"home",
     badges:[], origin:"뉴질랜드산", desc:"새콤한 그린키위", price:8000, tags:["키위"]}),

  P({id:"goldkiwi", name:"골드키위", unit:"1팩", cats:["fruit"], img:"kiwi", grade:"A",
     badges:[], origin:"뉴질랜드산", desc:"달콤한 골드키위", price:9000, tags:["키위"]}),

  P({id:"tomato", name:"토마토", unit:"5kg · 1번", cats:["fruit"], img:"tomato", grade:"home",
     badges:[], origin:"국내산", desc:"완숙 토마토 1번과", price:15000, tags:["토마토"],
     tip:"상온에서 하루 두면 더 익어요"}),

  /* ── 신선 채소 ── */
  P({id:"cabbage", name:"배추", unit:"1망", cats:["veg"], img:"cabbage",
     badges:[], origin:"국내산", desc:"김장 배추 1망", price:7900, tags:["배추 김장"],
     tip:"김장 배추는 4일 전 예약하세요"}),
  P({id:"altari", name:"알타리", unit:"5단", cats:["veg"], img:"altari", badges:[], origin:"국내산", desc:"5단 묶음", price:9900, tags:["무 총각김치"]}),
  P({id:"jjokpa", name:"흙쪽파", unit:"1단", cats:["veg"], img:"daepa", badges:[], origin:"국내산", desc:"흙 묻은 쪽파 1단", price:3000, tags:["쪽파 파 김장"]}),
  P({id:"byeongma", name:"병마", unit:"1kg", cats:["veg"], img:"chestnut", grade:"B",
     badges:[], origin:"국내산", desc:"1kg · 알밤", price:3000, tags:["밤"]}),
  P({id:"daepa", name:"대파", unit:"1단", cats:["veg"], img:"daepa", badges:[], origin:"국내산", desc:"1단", price:2000, stock:20, tags:["파"], tip:"뿌리째 세워 두면 오래가요"}),
  P({id:"aehobak", name:"애호박", unit:"1개", cats:["veg"], img:"aehobak", badges:[], origin:"국내산", desc:"1개", price:1000, tags:["호박"]}),
  P({id:"buchu", name:"부추", unit:"1단", cats:["veg"], img:"buchu", badges:[], origin:"국내산", desc:"1단", price:3000, tags:["부추"]}),
  P({id:"cheongyang", name:"청양고추", unit:"1팩", cats:["veg"], img:"cheongyang", badges:[], origin:"국내산", desc:"매콤한 청양고추", price:2000, tags:["고추"]}),
  P({id:"kkwari", name:"꽈리고추", unit:"1팩", cats:["veg"], img:"kkwari", badges:[], origin:"국내산", desc:"1팩", price:2000, tags:["고추"]}),
  P({id:"potato", name:"감자", unit:"1봉지", cats:["veg"], img:"potato", badges:[], origin:"국내산", desc:"1봉지", price:3000, tags:["감자"]}),
  P({id:"carrot", name:"흙당근", unit:"1봉지", cats:["veg"], img:"carrot", badges:[], origin:"국내산", desc:"흙 묻은 당근", price:3500, tags:["당근"]}),
  P({id:"mu", name:"무", unit:"1개", cats:["veg"], img:"mu", badges:[], origin:"국내산", desc:"1개", price:2000, tags:["무"]}),
  P({id:"onion", name:"양파", unit:"1봉 (1.5kg)", cats:["veg"], img:"onion", badges:[], origin:"국내산", desc:"1.5kg 봉", price:3980, tags:["양파"]}),
  P({id:"lettuce", name:"양상추", unit:"1통", cats:["veg"], img:"lettuce", badges:[], origin:"국내산", desc:"1통", price:2000, tags:["상추"]}),
  P({id:"sangchu", name:"상추", unit:"1봉지", cats:["veg"], img:"sangchu", badges:[], origin:"국내산", desc:"1봉지", price:2000, tags:["상추"]}),
  P({id:"perilla", name:"깻잎", unit:"1봉지", cats:["veg"], img:"perilla", badges:[], origin:"국내산", desc:"1봉지", price:1500, tags:["깻잎"], tip:"씻지 말고 냉장 보관하세요"}),

  /* ── 계란 ── */
  P({id:"egg-xl", name:"특란", unit:"1판 (30구)", cats:["egg"], img:"egg", badges:[], origin:"국내산", desc:"30구 1판", price:6000, stock:8, tags:["계란 달걀"], tip:"냉장고 안쪽 칸에 두세요"}),
  P({id:"egg-king", name:"판없는 왕란", unit:"1판 (30구)", cats:["egg"], img:"egg", grade:"home",
     badges:[["특가","hot"]], origin:"국내산", desc:"판 없이 알만 담은 왕란 30구", price:6000, tags:["계란 달걀 왕란"],
     tip:"냉장고 안쪽 칸에 두세요"})
];

var CATS = [
  {key:"all", label:"전체", title:"오늘 입고 상품"},
  {key:"deal", label:"🔥 오늘특가", title:"오늘의 특가"},
  {key:"fruit", label:"🍓 과일", title:"과일"},
  {key:"veg", label:"🥦 채소", title:"신선 채소"},
  {key:"egg", label:"🥚 계란", title:"계란"}
];
