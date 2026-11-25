/* catalog.js — 상품 목록 · 사진 경로 · 카테고리 (손님·사장님 공용)
   사진은 assets/img/*.webp 파일. HTML 안에 base64 로 넣지 않습니다. */
/* 상품 사진 — 단일 HTML 안 base64(471KB)였던 35장을 파일로 분리 (lazy loading 실제 동작) */
var IMG = {
  strawberry: "assets/img/strawberry.webp?v=20261125-sale1",
  tangerine: "assets/img/tangerine.webp?v=20261125-sale1",
  goldenhwang: "assets/img/goldenhwang.webp?v=20261125-sale1",
  apple: "assets/img/apple.webp?v=20261125-sale1",
  banana: "assets/img/banana.webp?v=20261125-sale1",
  cabbage: "assets/img/cabbage.webp?v=20261125-sale1",
  fig: "assets/img/fig.webp?v=20261125-sale1",
  persimmon: "assets/img/persimmon.webp?v=20261125-sale1",
  daebong: "assets/img/daebong.webp?v=20261125-sale1",
  kiwi: "assets/img/kiwi.webp?v=20261125-sale1",
  mango: "assets/img/mango.webp?v=20261125-sale1",
  shine: "assets/img/shine.webp?v=20261125-sale1",
  pineapple: "assets/img/pineapple.webp?v=20261125-sale1",
  jujube: "assets/img/jujube.webp?v=20261125-sale1",
  chestnut: "assets/img/chestnut.webp?v=20261125-sale1",
  blueberry: "assets/img/blueberry.webp?v=20261125-sale1",
  campbell: "assets/img/campbell.webp?v=20261125-sale1",
  pomegranate: "assets/img/pomegranate.webp?v=20261125-sale1",
  orange: "assets/img/orange.webp?v=20261125-sale1",
  tomato: "assets/img/tomato.webp?v=20261125-sale1",
  cheonggat: "assets/img/cheonggat.webp?v=20261125-sale1",
  altari: "assets/img/altari.webp?v=20261125-sale1",
  daepa: "assets/img/daepa.webp?v=20261125-sale1",
  aehobak: "assets/img/aehobak.webp?v=20261125-sale1",
  buchu: "assets/img/buchu.webp?v=20261125-sale1",
  cheongyang: "assets/img/cheongyang.webp?v=20261125-sale1",
  kkwari: "assets/img/kkwari.webp?v=20261125-sale1",
  potato: "assets/img/potato.webp?v=20261125-sale1",
  carrot: "assets/img/carrot.webp?v=20261125-sale1",
  mu: "assets/img/mu.webp?v=20261125-sale1",
  onion: "assets/img/onion.webp?v=20261125-sale1",
  lettuce: "assets/img/lettuce.webp?v=20261125-sale1",
  sangchu: "assets/img/sangchu.webp?v=20261125-sale1",
  perilla: "assets/img/perilla.webp?v=20261125-sale1",
  egg: "assets/img/egg.webp?v=20261125-sale1"
};

function P(o){ return o; }

/* ── 남은 수량(stock) 표기 기준 ──
   stock 은 '사장님이 직접 잡는 한정 수량'이다. 5 이하일 때만 손님 화면에 `오늘 N팩 남음` 배지가 뜬다.
   매일 들여오는 상시 품목(딸기·귤·사과·블루베리 등)은 여유 있는 수량으로 두어
   실제로 임박하지 않았는데 `2팩 남음` 같은 경고가 뜨지 않게 한다(2026-11-23 사장님 지적).
   품절·임박을 알리고 싶으면 사장님 페이지에서 그 품목의 남은 수량을 직접 낮추면 된다. */

var SALE_DATE = "2026-11-24";
var STRAWBERRY_BOX = "strawberry-box-20261125";
var WHOLESALE_MIN = { "bulk-veg":50000, "bulk-fruit":100000 };

function koreanDateKey(date){
  return new Date((date || new Date()).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function saleStarted(){ return koreanDateKey() >= SALE_DATE; }

function productAvailable(p){
  var started = saleStarted();
  return (!p.startsOnSale || started) && (!p.endsOnSale || !started);
}

var PRODUCTS = [
  /* 4만 원 딸기 행사는 2026-11-25 사장님 지시로 종료 — 판매 내리고 남은 수량 0(품절)으로 둔다.
     다시 열 때는 endsOnSale 을 빼고 stock 을 채우면 된다. */
  P({id:STRAWBERRY_BOX, name:"딸기 2kg 특가", unit:"1박스 · 4팩 · 3×4", endsOnSale:true,
     cats:["deal","fruit"], img:"strawberry", price:40000, stock:0,
     badges:[["50박스 한정","hot"]], desc:"포장 단독 구매 가능 · 배달은 다른 상품 15,000원 이상 함께 주문"}),
  /* ── 내일(11/26) 특가 5종 ── 이 순서대로 '오늘의 행사'와 상품 목록 맨 위에 노출한다.
     사과 10kg만 최소주문금액에서 빠지고(shop.js APPLE_DEAL_ID), 단감·토마토·반시·귤은 일반 상품처럼 최소주문금액에 들어간다. */

  /* 사과 10kg 특가 — 다른 상품 30,000원 이상 함께 주문해야 하고, 최소주문금액 계산에서는 빠진다 (shop.js APPLE_DEAL_ID) */
  P({id:"apple-10kg-deal", name:"사과 10kg 특가", unit:"1박스 (10kg)", cats:["deal","fruit"], img:"apple",
     badges:[["특가","hot"],["최대 3박스","fresh"]], price:16800, stock:50, maxQty:3,
     desc:"다른 상품 30,000원 이상 함께 주문 시 구매 가능 · 1주문 최대 3박스", tags:["사과 부사"]}),

  P({id:"persimmon-5dai-deal", name:"단감 5다이", unit:"10kg · 5다이", cats:["deal","fruit"], img:"persimmon",
     badges:[["특가","hot"]], origin:"국내산", desc:"아삭한 단감 10kg · 5다이 한 상자", price:15000, tags:["감 단감"]}),

  P({id:"tomato-retail-23", name:"완숙 토마토", unit:"5kg · 2~3번", cats:["deal","fruit"], img:"tomato",
     badges:[["오늘 특가","hot"]], desc:"가격 거품 뺀 실속 5kg (2~3번과)", price:6900, tags:["토마토"]}),

  P({id:"bansee-5kg-deal", name:"반시", unit:"5kg", cats:["deal","fruit"], img:"persimmon",
     badges:[["특가","hot"]], origin:"국내산", desc:"부드럽게 익은 반시 5kg 특가", price:6900, tags:["감 홍시"]}),

  /* 가정용 감귤 B급 2L — 내일 행사 7,900원. L(5kg)은 일반 과일 목록에 9,900원으로 따로 둔다(tangerine-home-l) */
  P({id:"tangerine-home-2l", name:"가정용 감귤 B급", unit:"5kg · 2L", cats:["deal","fruit"], img:"tangerine",
     grade:"B", origin:"제주산", price:7900, badges:[["특가","hot"]]}),

  /* ── 다른 행사 ── */
  P({id:"banana-deal", name:"바나나", unit:"1송이", cats:["deal"], img:"banana", grade:"normal",
     badges:[["행사","hot"]], origin:"베트남/필리핀산", desc:"일반 바나나 · 1송이 1,000원 · 오늘만 이 가격", price:1000, stock:8,
     tip:"노랗게 익으면 냉장 보관하세요", tags:["일반 바나나 행사"]}),

  P({id:"pineapple-deal", name:"감숙왕 파인애플", unit:"4개", cats:["deal"], img:"pineapple", grade:"home",
     badges:[["행사","hot"]], origin:"필리핀산", desc:"달콤한 감숙왕 4개 · 행사가", price:9900, tags:["파인애플"],
     tip:"뒤집어 하루 두면 더 달아져요"}),

  P({id:"daebong-15", name:"대봉감 가정용", unit:"15알", cats:["deal"], img:"daebong", grade:"C",
     badges:[["행사","hot"]], origin:"국내산", desc:"15알 행사 · 익혀 드세요", price:9900, tags:["감"]}),

  P({id:"blueberry", name:"블루베리", unit:"3팩", cats:["deal"], img:"blueberry", grade:"home",
     badges:[["행사","hot"]], origin:"칠레산", desc:"3팩 묶음 특가", price:9900, stock:30, tags:["베리"]}),

  /* ── 과일 ── */
  P({id:"strawberry-4x5", name:"딸기 4×5", unit:"1팩", cats:["fruit","deal"], img:"strawberry", grade:"normal",
     badges:[["행사","hot"],["오늘입고","fresh"]], origin:"국내산", desc:"4×5 크기 딸기 1팩", price:7900, stock:37,
     tip:"냉장 2시간 뒤 드시면 더 달아요", tags:["딸기","4x5"]}),
  P({id:"strawberry-3x5", name:"딸기 3×5", unit:"1팩", cats:["fruit","deal"], img:"strawberry", grade:"normal",
     badges:[["행사","hot"],["오늘입고","fresh"]], origin:"국내산", desc:"3×5 크기 딸기 1팩", price:10800, stock:30,
     tip:"냉장 2시간 뒤 드시면 더 달아요", tags:["딸기","3x5"]}),
  P({id:"strawberry-3x4", name:"딸기 3×4", unit:"1팩", cats:["fruit","deal"], img:"strawberry", grade:"normal",
     badges:[["행사","hot"],["오늘입고","fresh"]], origin:"국내산", desc:"3×4 크기 딸기 1팩", price:11800, stock:30,
     tip:"냉장 2시간 뒤 드시면 더 달아요", tags:["딸기","3x4"]}),

  /* 무화과 2가지 — 가정용(실속) 5,900원 · A급(품질보증) 9,900원 */
  P({id:"fig", endsOnSale:true, name:"무화과 가정용", unit:"1kg", cats:["fruit"], img:"fig", grade:"home",
     badges:[["국내산","dom"]], origin:"국내산", desc:"실속 가정용 · 달콤한 무화과", price:5900, tags:["무화과"],
     tip:"냉장 1~2일 안에 드세요"}),

  P({id:"fig-a", endsOnSale:true, name:"무화과 A급", unit:"1kg", cats:["fruit"], img:"fig", grade:"A",
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

  P({id:"tangerine", endsOnSale:true, name:"제주 귤", unit:"5kg", cats:["fruit"], img:"tangerine", grade:"home",
     ogrades:["A","A","B","B"],
     badges:[], origin:"제주산", desc:"사이즈·품종 골라 담기", stock:40,
     tip:"한두 알 껍질을 벗겨 두었다 드세요",
     opts:[{label:"다우렁 M · 5kg", price:20000},
           {label:"유라조생 M · 5kg", price:30000},
           {label:"서귀포 B급 M · 5kg", price:12800},
           {label:"서귀포 B급 S/2S · 5kg", price:15000}],
     tags:["귤 감귤"]}),

  P({id:"tangerine-home-l", name:"가정용 감귤 B급", unit:"5kg · L", cats:["fruit"], img:"tangerine",
     grade:"B", origin:"제주산", price:9900}),
  P({id:"tangerine-seogwipo-m", name:"서귀포 감귤 B급", unit:"5kg · M", cats:["fruit"], img:"tangerine",
     grade:"B", origin:"제주 서귀포", price:12800, startsOnSale:true}),
  P({id:"tangerine-small", name:"제주 감귤", unit:"5kg · S·2S", cats:["fruit"], img:"tangerine",
     origin:"제주산", price:15000, startsOnSale:true}),

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
     ogrades:["home","home","A"],
     badges:[], origin:"안동", desc:"아삭한 안동 부사", stock:40, tip:"흐르는 물에 씻어 껍질째 드세요",
     opts:[{label:"15개", sub:"가정용", price:9900},
           {label:"10kg", sub:"한 상자", price:25000},
           {label:"A급 · 10kg", sub:"품질보증", price:35000, startsOnSale:true}],
     tags:["사과 부사"]}),

  P({id:"orange", name:"오렌지", unit:"1봉지", cats:["fruit"], img:"orange", grade:"home",
     badges:[], origin:"호주산", desc:"1봉지 특가", price:9900, tags:["오렌지"]}),

  P({id:"greenkiwi", name:"그린키위", unit:"1팩", cats:["fruit"], img:"kiwi", grade:"home",
     badges:[], origin:"뉴질랜드산", desc:"새콤한 그린키위", price:8000, tags:["키위"]}),

  P({id:"goldkiwi-local-12", name:"국내산 골드키위", unit:"12개", cats:["fruit"], img:"kiwi",
     badges:[], origin:"국내산", price:9900, tags:["키위"]}),

  P({id:"tomato", name:"완숙 토마토", unit:"5kg · 1번", cats:["fruit"], img:"tomato", grade:"home",
     badges:[], origin:"국내산", desc:"완숙 토마토 1번과", price:15000, tags:["토마토"],
     tip:"상온에서 하루 두면 더 익어요"}),

  /* ── 신선 채소 ── */
  P({id:"cabbage", name:"배추", unit:"1망 · 55사이즈 정품", cats:["veg"], img:"cabbage",
     badges:[], origin:"국내산", desc:"김장 배추 1망", price:7900, tags:["배추 김장"],
     tip:"김장 배추는 4일 전 예약하세요"}),
  P({id:"cabbage-retail-deal", name:"행사용 배추", unit:"1망", cats:["veg","deal"], img:"cabbage",
     badges:[["행사","hot"]], price:5000, tags:["배추 김장"]}),
  P({id:"altari", name:"알타리", unit:"5단", cats:["veg"], img:"altari", origin:"국내산", desc:"5단 묶음", badges:[["떨이","hot"]], price:9900, tags:["무 총각김치"]}),
  P({id:"jjokpa", name:"흙쪽파", unit:"1단", cats:["veg"], img:"daepa", badges:[], origin:"국내산", desc:"흙 묻은 쪽파 1단", price:3000, tags:["쪽파 파 김장"]}),
  P({id:"byeongma", name:"병마", unit:"1kg", cats:["veg"],
     price:3000, startsOnSale:true}),
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
  P({id:"gangneung-tofu-850g", name:"강릉두부", unit:"850g", cats:["veg"], price:2700, tags:["두부","강릉두부"]}),
  P({id:"gangneung-tofu-domestic-300g", name:"강릉두부 국산", unit:"300g", cats:["veg"], origin:"국산", price:2900, tags:["두부","국산두부"]}),
  P({id:"gangneung-chodang-tofu-550g", name:"강릉초당두부", unit:"550g", cats:["veg"], price:2700, tags:["두부","초당두부"]}),
  P({id:"dotori-muk-400g", name:"도토리묵", unit:"400g", cats:["veg"], price:1300, tags:["묵","도토리묵"]}),
  P({id:"gangneung-soft-tofu-350g", name:"강릉순두부", unit:"350g", cats:["veg"], price:600, tags:["두부","순두부"]}),
  P({id:"gangneung-chodang-soft-tofu-400g", name:"강릉초당순두부", unit:"400g", cats:["veg"], price:1800, tags:["두부","순두부","초당순두부"]}),
  P({id:"haechunsu-tofu-3kg", name:"해천수 두부", unit:"3kg", cats:["veg"], price:6500, tags:["두부","해천수"]}),
  P({id:"kong-sari-sprouts-600g", name:"콩살이 콩나물", unit:"600g", cats:["veg"], price:1800, tags:["콩나물","콩살이"]}),
  P({id:"chamsari-sprouts-300g", name:"참살이 콩나물", unit:"300g", cats:["veg"], price:1000, tags:["콩나물","참살이"]}),
  P({id:"chamsari-domestic-sprouts-300g", name:"참살이 국산콩나물", unit:"300g", cats:["veg"], origin:"국산", price:1800, tags:["콩나물","국산콩나물","참살이"]}),
  P({id:"seasoned-soup-sprouts-340g", name:"양념스프담은 콩나물", unit:"340g", cats:["veg"], price:1600, tags:["콩나물","양념스프"]}),
  P({id:"chamsari-mung-sprouts-400g", name:"참살이 숙주", unit:"400g", cats:["veg"], price:1700, tags:["숙주","참살이"]}),

  /* ── 계란 ── */
  P({id:"egg-large-20261125", name:"대란", unit:"1판 (30구)", cats:["egg"], img:"egg",
     origin:"국내산", price:5000, stock:4, startsOnSale:true}),
  P({id:"egg-xl-20261125", name:"특란", unit:"1판 (30구)", cats:["egg"], img:"egg",
     origin:"국내산", price:6000, stock:0, startsOnSale:true}),
  P({id:"egg-xl", endsOnSale:true, name:"특란", unit:"1판 (30구)", cats:["egg"], img:"egg", badges:[], origin:"국내산", desc:"30구 1판", price:6000, stock:8, tags:["계란 달걀"], tip:"냉장고 안쪽 칸에 두세요"}),
  P({id:"egg-king", name:"판없는 왕란", unit:"1판 (30구)", cats:["egg"], img:"egg", grade:"home",
     badges:[["특가","hot"]], origin:"국내산", desc:"판 없이 알만 담은 왕란 30구", price:6000, tags:["계란 달걀 왕란"],
     tip:"냉장고 안쪽 칸에 두세요"})
];

function bulkProduct(category, item){
  return {
    id: category + "-" + item[0], name:item[1], unit:item[2], price:item[3],
    desc:item[4] || "", img:item[5], cats:[category], startsOnSale:true
  };
}

var BULK_VEGETABLES = [
  ["onion","양파","15kg · 국내산 A급",23800,"","onion"],
  ["cabbage-green","양배추","1망",7900],
  ["garlic","깐마늘","1kg",9900],
  ["carrot","세척당근","10kg 1박스 · 중국산",7900],
  ["scallion","대파","1관",7900,"","daepa"],
  ["lettuce","양상추","12수 1박스",15000,"","lettuce"],
  ["leaf-lettuce","상추","4kg",19800,"","sangchu"],
  ["cabbage","배추","1망 · 55사이즈 중품",5000,"","cabbage"],
  ["bell-pepper","피망","1kg",9900],
  ["hot-pepper","청양고추","1kg",7500,"","cheongyang"],
  ["crunch-pepper","아삭이고추","1kg",8000],
  ["enoki","팽이버섯","1박스",9900],
  ["potato-l","감자","20kg · 대",20000,"","potato"],
  ["potato-xl","감자","20kg · 왕특",36000,"","potato"],
  ["potato-xxl","감자","20kg · 왕왕",38000,"","potato"],
  ["cucumber","백오이","100개입 1박스",90000],
  ["chapchapi","찹찹이","1kg",13000],
  ["sweet-potato","고구마","10kg · 튀김용",25000],
  ["eggplant","가지","1박스",20000],
  ["squash","애호박","20개입 1박스 · 특",20000,"","aehobak"],
  ["oyster-mushroom","느타리버섯","2kg",9900],
  ["baby-cabbage","알배기","1박스 · 상",15000],
  ["chicory","치커리","1박스",9900],
  ["garlic-stem","수입마늘쫑","1단 · 중국산",3000],
  ["ground-garlic","간마늘","1kg",8500],
  ["ground-ginger","간생강","1kg",11000],
  ["curly-sprouts","곱슬이","1박스",3500],
  ["soy-sprouts","일자콩나물","1박스",3500],
  ["mung-sprouts","숙주","1박스",5500],
  ["tofu","강릉심해순두부","1kg 식자재용 · 1박스",18000]
];

var BULK_FRUITS = [
  ["lemon","레몬","50개입",25000],
  ["grapefruit","자몽","25개입",37500],
  ["banana","바나나","12/14발 1박스 · 필리핀/베트남산",14000,"","banana"],
  ["pineapple","골드파인애플","6수 1박스",43000,"","pineapple"],
  ["pineapple-b","골드파인애플","7~9수 · B급",18000,"","pineapple"],
  ["apple-3","안동 사과","20kg · 상 3번",40000,"","apple"],
  ["apple-56","안동 사과","20kg · 특 5~6번",70000,"","apple"],
  ["persimmon-6","단감","10kg · 6다이",20000,"","persimmon"],
  ["persimmon-5","단감","10kg · 5다이",25000,"","persimmon"],
  ["tomato-23","완숙 토마토","5kg · 2~3번",6900,"시기상 A급이 아닙니다","tomato"],
  ["tomato-1","완숙 토마토","5kg · 1번",15000,"시기상 A급이 아닙니다","tomato"],
  ["kiwi","골드키위","5kg · 국내산",20000,"조금 익은 상품","kiwi"],
  ["bansee-m","반시","5kg · M",8500,"","persimmon"],
  ["bansee-s","반시","5kg · S",7000,"","persimmon"]
];

BULK_VEGETABLES.forEach(function(item){ PRODUCTS.push(bulkProduct("bulk-veg", item)); });
BULK_FRUITS.forEach(function(item){ PRODUCTS.push(bulkProduct("bulk-fruit", item)); });

var CATS = [
  {key:"all", label:"전체", title:"오늘 입고 상품"},
  {key:"deal", label:"🔥 오늘특가", title:"오늘의 특가"},
  {key:"fruit", label:"🍓 과일", title:"과일"},
  {key:"veg", label:"🥦 채소", title:"신선 채소"},
  {key:"egg", label:"🥚 계란", title:"계란"},
  {key:"bulk-veg", label:"식자재 채소", title:"식자재 채소 · 원주 시내 배달 5만 원 이상", startsOnSale:true},
  {key:"bulk-fruit", label:"식자재 과일", title:"식자재 과일 · 원주 시내 배달 10만 원 이상", startsOnSale:true}
];
