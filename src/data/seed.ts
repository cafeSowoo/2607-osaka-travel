import type { ChecklistItem, ItineraryItem, PackingCategory, Reservation, TravelData, Trip, TripDay } from '../types'

export const categories = ['이동', '식사', '카페', '관광', '쇼핑', '휴식', '기타'] as const
export const packingCategories: PackingCategory[] = ['필수품', '의류', '전자기기', '세면용품', '의약품', '기타']
export const BACKUP_DAY_INDEX = 6

export const tripDays: TripDay[] = [
  { dayIndex: 1, date: '2026-11-06', label: 'Day 1 · 11/6 금' },
  { dayIndex: 2, date: '2026-11-07', label: 'Day 2 · 11/7 토' },
  { dayIndex: 3, date: '2026-11-08', label: 'Day 3 · 11/8 일' },
  { dayIndex: BACKUP_DAY_INDEX, date: '2026-11-09', label: '후보 · 백업 일정', isBackup: true },
]

// 2607 여행 데이터는 DB에 'osaka-2026'으로 남아 있고, 첫 로그인 때 체크리스트·메모를 여기로 복사한다.
export const legacyTripId = 'osaka-2026'

export const seedTrip: Trip = {
  id: 'osaka-2611',
  title: '2611 Osaka',
  destination: '오사카',
  startDate: '2026-11-06',
  endDate: '2026-11-08',
  exchangeRate: 9.5,
}

export const seedReservations: Reservation[] = [
  {
    id: 'reservation-2611-flight-peach',
    tripId: seedTrip.id,
    kind: 'flight',
    title: '피치항공 왕복 여정',
    reference: '',
    primaryDate: '2026-11-06',
    subtitle: '김포 → 간사이 T2 / 간사이 T2 → 김포',
    sortOrder: 10,
    details: [
      '가는 편 11/6(금) MM736 김포 11:20 → 간사이 T2 13:05',
      '오는 편 11/8(일) MM739 간사이 T2 14:10 → 김포 16:10',
      '기본 운임: 위탁수하물 없음, 기내 합계 7kg',
      '공항 도착: 출발 2시간 30분 전 (김포 08:50 / 간사이 11:40)',
    ],
    meta: {
      airline: '피치항공',
    },
  },
  {
    id: 'reservation-2611-hotel-airbnb',
    tripId: seedTrip.id,
    kind: 'hotel',
    title: '스미요시타이샤 단독주택',
    reference: '',
    primaryDate: '2026-11-06',
    subtitle: '2박 · 에어비앤비 집 전체 · 성인 6명',
    sortOrder: 20,
    details: [
      '大阪市住之江区粉浜3-15-35',
      '체크인 11/6(금) 15:00 · 셀프 체크인(열쇠 보관함)',
      '체크아웃 11/8(일) 10:00',
      '스미요시타이샤역 도보 약 5분',
    ],
    meta: {
      platform: '에어비앤비',
    },
  },
]

export const seedChecklist: ChecklistItem[] = [
  { id: 'check-divider-docs', tripId: seedTrip.id, section: '출국 전', kind: 'divider', listType: 'todo', packingCategory: null, title: '서류', done: false, sortOrder: 5 },
  { id: 'check-passport', tripId: seedTrip.id, section: '출국 전', kind: 'task', listType: 'todo', packingCategory: null, title: '여권 만료일과 여권 지참 확인', done: false, sortOrder: 10 },
  { id: 'check-divider-connectivity', tripId: seedTrip.id, section: '출국 전', kind: 'divider', listType: 'todo', packingCategory: null, title: '통신 · 결제', done: false, sortOrder: 15 },
  { id: 'check-esim', tripId: seedTrip.id, section: '출국 전', kind: 'task', listType: 'todo', packingCategory: null, title: 'eSIM 또는 로밍 준비', done: false, sortOrder: 20 },
  { id: 'check-cash', tripId: seedTrip.id, section: '출국 전', kind: 'task', listType: 'todo', packingCategory: null, title: 'JPY 현금과 해외 결제 카드 준비', done: false, sortOrder: 30 },
  { id: 'check-kobe-route', tripId: seedTrip.id, section: '여행 중', kind: 'task', listType: 'todo', packingCategory: null, title: '고베공항 → 숙소 이동 동선 확인', done: false, sortOrder: 40 },
  { id: 'check-kix-route', tripId: seedTrip.id, section: '귀국 전', kind: 'task', listType: 'todo', packingCategory: null, title: '숙소 → 간사이공항 T2 이동 시간 확인', done: false, sortOrder: 50 },
]

type SeedItinerary = Pick<ItineraryItem, 'id' | 'dayIndex' | 'date' | 'startTime' | 'endTime' | 'place' | 'category' | 'title' | 'note' | 'budgetJpy' | 'googlePlaceQuery' | 'googleMapsUri' | 'sortOrder'>

const item = (value: SeedItinerary): ItineraryItem => ({
  ...value,
  tripId: seedTrip.id,
  googlePlaceId: '',
  formattedAddress: '',
  lat: null,
  lng: null,
  confirmed: false,
})

// osaka-board 일정표(11/6~11/8)에서 가져온 일정
export const seedItineraryItems: ItineraryItem[] = [
  item({"id": "it-2611-d1-01", "dayIndex": 1, "date": "2026-11-06", "startTime": "13:05", "endTime": "", "place": "関西国際空港 第2ターミナル", "category": "이동", "title": "김포 → 간사이 도착 (피치 MM736)", "note": "김포 11:20 출발 → 간사이 제2터미널 13:05 도착.\n위탁수하물 없음, 기내는 개인 소지품+휴대 수하물 합쳐 7kg까지.\n트립닷컴 안내: 김포공항에는 출발 2시간 30분 전(08:50)까지 도착.\n※ 지석 예약 기준이에요. 다른 편이면 댓글로 알려주세요.", "budgetJpy": 0, "googlePlaceQuery": "関西国際空港 第2ターミナル", "googleMapsUri": "", "sortOrder": 10}),
  item({"id": "it-2611-d1-02", "dayIndex": 1, "date": "2026-11-06", "startTime": "14:09", "endTime": "", "place": "住吉大社駅", "category": "이동", "title": "간사이공항 → 숙소 (공항급행 + 보통열차)", "note": "남해 공항급행 + 보통열차 (예약 없음, 1인 920엔)\n· 간사이공항역 14:09 출발 (공항급행, 난바행)\n· 사카이(堺) 14:43 하차 → 보통열차(난바 방면) 14:48\n· 스미요시타이샤 14:54 도착 (사카이에서 3정거장)\n· 역에서 숙소까지 도보 약 5분\n\n· 간사이공항역이 출발역이라 타는 순간엔 대부분 앉아서 갈 수 있어요. 다만 6명이 나란히 앉는 건 보장이 안 되니까 줄을 일찍 서요.\n· 공항급행은 대략 15분 간격이라 놓치면 다음 열차 타면 돼요.\n· 교통카드(ICOCA 등)나 승차권으로 타요.\n\n※ 스미요시타이샤역은 보통열차만 서서 사카이에서 꼭 갈아타야 해요.\n※ 제2터미널 도착이라 무료 셔틀로 공항역(에어로플라자)까지 이동해요.\n※ 11/6(금) 기준 Yahoo 환승검색 결과예요. 출발 전에 한 번 더 확인하기.\n\n(대안) 지정석 원하면 라피트β 14:35 → 사카이 환승 → 15:11 도착, 1,620엔", "budgetJpy": 920, "googlePlaceQuery": "住吉大社駅", "googleMapsUri": "", "sortOrder": 20}),
  item({"id": "it-2611-d1-03", "dayIndex": 1, "date": "2026-11-06", "startTime": "15:00", "endTime": "", "place": "大阪市住之江区粉浜3-15-35", "category": "이동", "title": "숙소 체크인 (스미요시타이샤 단독주택)", "note": "에어비앤비 집 전체, 성인 6명.\n셀프 체크인(열쇠 보관함), 15:00부터 입실.\n스미요시타이샤역 도보 5분, 숙소 설명상 난카이 전철로 난바·간사이공항 직통.", "budgetJpy": 0, "googlePlaceQuery": "大阪市住之江区粉浜3-15-35", "googleMapsUri": "https://www.google.com/maps/search/?api=1&query=34.6145992,135.4892029", "sortOrder": 30}),
  item({"id": "it-2611-d1-04", "dayIndex": 1, "date": "2026-11-06", "startTime": "17:00", "endTime": "", "place": "粉もん太郎 大阪梅田店", "category": "식사", "title": "오코노미야키", "note": "", "budgetJpy": 0, "googlePlaceQuery": "粉もん太郎 大阪梅田店", "googleMapsUri": "https://maps.app.goo.gl/8iM1wj7jgyxftPz99", "sortOrder": 40}),
  item({"id": "it-2611-d1-05", "dayIndex": 1, "date": "2026-11-06", "startTime": "18:00", "endTime": "", "place": "우메다 공중정원", "category": "관광", "title": "우메다 공중정원/후보군 햅파이브 관람차", "note": "저녁에 네온 켜졌을 때가 예뻐요. 에비스바시 다리 위가 촬영 포인트.", "budgetJpy": 0, "googlePlaceQuery": "우메다 공중정원", "googleMapsUri": "https://maps.app.goo.gl/XwSRiWDWVSxjDGSh8?g_st=ic", "sortOrder": 50}),
  item({"id": "it-2611-d1-06", "dayIndex": 1, "date": "2026-11-06", "startTime": "20:30", "endTime": "", "place": "Local Sake Bar – Umeda DD House", "category": "식사", "title": "이자카야 사시미 위주", "note": "사시미 위주기 때문에 상황 봐서 정통 이자카야 (꼬치집)", "budgetJpy": 0, "googlePlaceQuery": "Local Sake Bar – Umeda DD House", "googleMapsUri": "https://maps.app.goo.gl/UUzp6Ue1CYBXNKnN9", "sortOrder": 60}),
  item({"id": "it-2611-d2-07", "dayIndex": 2, "date": "2026-11-07", "startTime": "09:00", "endTime": "", "place": "", "category": "관광", "title": "숙소에서 출발", "note": "아침 식사랑 준비는 이 전에 끝내기", "budgetJpy": 0, "googlePlaceQuery": "", "googleMapsUri": "", "sortOrder": 70}),
  item({"id": "it-2611-d2-08", "dayIndex": 2, "date": "2026-11-07", "startTime": "10:00", "endTime": "", "place": "오사카성", "category": "관광", "title": "오사카성", "note": "점심 전 후로 가면 좋을 것 같아요", "budgetJpy": 0, "googlePlaceQuery": "오사카성", "googleMapsUri": "", "sortOrder": 80}),
  item({"id": "it-2611-d2-09", "dayIndex": 2, "date": "2026-11-07", "startTime": "12:00", "endTime": "", "place": "무겐라멘 · 大阪市浪速区難波中3丁目16-11", "category": "식사", "title": "무겐 라멘(후보군)", "note": "오사카성에서 건너와서 라멘집 가면 좋을 듯", "budgetJpy": 0, "googlePlaceQuery": "무겐라멘 · 大阪市浪速区難波中3丁目16-11", "googleMapsUri": "https://maps.app.goo.gl/asAKfkUdTh17g6Py5", "sortOrder": 90}),
  item({"id": "it-2611-d2-10", "dayIndex": 2, "date": "2026-11-07", "startTime": "13:00", "endTime": "18:00", "place": "", "category": "관광", "title": "자유여행 또는 소그룹 자유여행", "note": "점심먹고 나서 저녁 전 까지는 자유 여행 또는 \n소규모 일정 다니는 것도 좋을 것 같습니다~", "budgetJpy": 0, "googlePlaceQuery": "", "googleMapsUri": "", "sortOrder": 100}),
  item({"id": "it-2611-d2-11", "dayIndex": 2, "date": "2026-11-07", "startTime": "18:00", "endTime": "", "place": "야키니쿠 하나미치", "category": "식사", "title": "저녁 야키니쿠", "note": "", "budgetJpy": 0, "googlePlaceQuery": "야키니쿠 하나미치", "googleMapsUri": "https://maps.app.goo.gl/ZGngQBfqJstXPp2h8?g_st=ac", "sortOrder": 110}),
  item({"id": "it-2611-d2-12", "dayIndex": 2, "date": "2026-11-07", "startTime": "19:30", "endTime": "", "place": "", "category": "관광", "title": "도톤보리 외", "note": "", "budgetJpy": 0, "googlePlaceQuery": "", "googleMapsUri": "https://maps.app.goo.gl/CevN86Rb8RoLmdJe7?g_st=ic", "sortOrder": 120}),
  item({"id": "it-2611-d3-13", "dayIndex": 3, "date": "2026-11-08", "startTime": "10:00", "endTime": "", "place": "大阪市住之江区粉浜3-15-35", "category": "이동", "title": "숙소 체크아웃", "note": "체크아웃 10:00까지. 짐 챙겨서 공항 가기 전에 한 군데 들를 시간 있음.", "budgetJpy": 0, "googlePlaceQuery": "大阪市住之江区粉浜3-15-35", "googleMapsUri": "https://www.google.com/maps/search/?api=1&query=34.6145992,135.4892029", "sortOrder": 130}),
  item({"id": "it-2611-d3-14", "dayIndex": 3, "date": "2026-11-08", "startTime": "14:10", "endTime": "", "place": "関西国際空港 第2ターミナル", "category": "이동", "title": "간사이 → 김포 (피치 MM739)", "note": "간사이 제2터미널 14:10 출발 → 김포 16:10 도착.\n트립닷컴 안내: 출발 2시간 30분 전(11:40)까지 공항 도착.\n제2터미널(LCC)은 공항역에서 무료 셔틀로 이동하니 시간 여유 있게.", "budgetJpy": 0, "googlePlaceQuery": "関西国際空港 第2ターミナル", "googleMapsUri": "", "sortOrder": 140}),
]

export const createSeedData = (): TravelData => ({
  trip: { ...seedTrip },
  days: tripDays.map((day) => ({ ...day })),
  itineraryItems: seedItineraryItems.map((item) => ({ ...item })),
  reservations: seedReservations.map((reservation) => ({ ...reservation, details: [...reservation.details], meta: { ...reservation.meta } })),
  checklistItems: seedChecklist.map((item) => ({ ...item })),
  memos: [],
})
