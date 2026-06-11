import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Hotel,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import './App.css'
import { categories } from './data/seed'
import { useTravelData } from './hooks/useTravelData'
import type { Category, ItineraryItem, Reservation, TripDay } from './types'

type View = 'today' | 'schedule' | 'reservations' | 'checklist' | 'settings'

const views: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: 'today', label: '오늘', icon: Sparkles },
  { id: 'schedule', label: '일정', icon: Table2 },
  { id: 'reservations', label: '예약', icon: Plane },
  { id: 'checklist', label: '체크리스트', icon: ListChecks },
  { id: 'settings', label: '설정', icon: Settings },
]

const formatJpy = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`
const formatKrw = (value: number, rate: number) => `₩${Math.round(value * rate).toLocaleString('ko-KR')}`
const normalizeTime = (value: string) => value.trim().slice(0, 5)
const SCHEDULE_COLUMN_STORAGE_KEY = 'osaka-travel-pwa:schedule-column-widths:v1'

const scheduleColumns = [
  { id: 'time', label: '시간', defaultWidth: 118, minWidth: 96, maxWidth: 180 },
  { id: 'place', label: '장소', defaultWidth: 150, minWidth: 120, maxWidth: 260 },
  { id: 'category', label: '구분', defaultWidth: 78, minWidth: 68, maxWidth: 130 },
  { id: 'title', label: '내용', defaultWidth: 110, minWidth: 96, maxWidth: 220 },
  { id: 'note', label: '비고', defaultWidth: 118, minWidth: 104, maxWidth: 260 },
  { id: 'budget', label: '예산', defaultWidth: 96, minWidth: 84, maxWidth: 150 },
] as const

type ScheduleColumnId = (typeof scheduleColumns)[number]['id']
type ScheduleColumnWidths = Record<ScheduleColumnId, number>

const defaultScheduleColumnWidths = scheduleColumns.reduce(
  (widths, column) => ({ ...widths, [column.id]: column.defaultWidth }),
  {} as ScheduleColumnWidths,
)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const readScheduleColumnWidths = () => {
  const raw = localStorage.getItem(SCHEDULE_COLUMN_STORAGE_KEY)
  if (!raw) return defaultScheduleColumnWidths

  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleColumnWidths>
    return scheduleColumns.reduce(
      (widths, column) => ({
        ...widths,
        [column.id]: clamp(Number(parsed[column.id] ?? column.defaultWidth), column.minWidth, column.maxWidth),
      }),
      {} as ScheduleColumnWidths,
    )
  } catch {
    return defaultScheduleColumnWidths
  }
}

const saveScheduleColumnWidths = (widths: ScheduleColumnWidths) => {
  localStorage.setItem(SCHEDULE_COLUMN_STORAGE_KEY, JSON.stringify(widths))
}

const makeScheduleGridTemplate = (widths: ScheduleColumnWidths) => (
  scheduleColumns.map((column) => `${widths[column.id]}px`).join(' ')
)

const getActiveTripDay = (days: TripDay[]) => {
  const today = new Date().toISOString().slice(0, 10)
  return days.find((day) => day.date === today) ?? days[0]
}

const makeTimeRange = (item: ItineraryItem) => `${item.startTime || '--:--'} ~ ${item.endTime || '--:--'}`
const formatTabDate = (day: TripDay) => {
  const [, month, date] = day.date.split('-')
  return `${month}.${date} (${day.label.split(' ').at(-1) ?? ''})`
}

function AuthScreen({ login, configured }: { login: () => void; configured: boolean }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="app-mark">旅</div>
        <h1>2607 Osaka</h1>
        <p>항공권, 호텔, Day1~Day5 일정표를 한곳에서 관리하는 개인 여행 PWA입니다.</p>
        <button className="primary-button" onClick={login}>
          <LogIn size={18} />
          {configured ? 'Google로 로그인' : '데모 모드로 시작'}
        </button>
        <span className="muted-note">{configured ? 'Supabase Google OAuth로 본인 데이터만 동기화합니다.' : 'Supabase 환경변수를 넣으면 Google 로그인으로 전환됩니다.'}</span>
      </section>
    </main>
  )
}

function ShellNav({ activeView, setActiveView }: { activeView: View; setActiveView: (view: View) => void }) {
  return (
    <nav className="side-nav" aria-label="앱 메뉴">
      <div className="brand-block">
        <div className="app-mark small">旅</div>
        <div>
          <strong>2607 Osaka</strong>
          <span>Trip desk</span>
        </div>
      </div>
      <div className="nav-list">
        {views.map((view) => {
          const Icon = view.icon
          return (
            <button key={view.id} className={activeView === view.id ? 'active' : ''} onClick={() => setActiveView(view.id)}>
              <Icon size={18} />
              {view.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function StatusStrip({
  message,
  offline,
  readonly,
  onRefresh,
  onLogout,
}: {
  message: string
  offline: boolean
  readonly: boolean
  onRefresh: () => void
  onLogout: () => void
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyeline">오사카 여행 운영판</p>
        <h1>오늘 필요한 정보만 빠르게</h1>
      </div>
      <div className="topbar-actions">
        <span className={offline ? 'sync-chip danger' : 'sync-chip'}>
          {offline ? <CloudOff size={15} /> : <Cloud size={15} />}
          {readonly ? '오프라인 읽기 전용' : message}
        </span>
        <button className="ghost-button" onClick={onRefresh}>새로고침</button>
        <button className="icon-button" aria-label="로그아웃" onClick={onLogout}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}

function TodayView({
  day,
  items,
  reservations,
  checklistDone,
  checklistTotal,
  exchangeRate,
  showKrw,
}: {
  day: TripDay
  items: ItineraryItem[]
  reservations: Reservation[]
  checklistDone: number
  checklistTotal: number
  exchangeRate: number
  showKrw: boolean
}) {
  const nextItem = items[0]
  const dayBudget = items.reduce((sum, item) => sum + item.budgetJpy, 0)

  return (
    <section className="view-grid today-grid">
      <article className="today-hero">
        <p className="eyeline">{day.label}</p>
        <h2>오늘 일정</h2>
        <p>{items.length ? `${items.length}개의 일정이 준비되어 있어요.` : '아직 일정이 비어 있어요. 일정 탭에서 첫 행을 추가해보세요.'}</p>
        <div className="hero-summary">
          <span>다음 일정</span>
          <strong>{nextItem ? `${makeTimeRange(nextItem)} · ${nextItem.title}` : '비어 있음'}</strong>
        </div>
      </article>

      <article className="metric-card">
        <span>예상 예산</span>
        <strong>{showKrw ? formatKrw(dayBudget, exchangeRate) : formatJpy(dayBudget)}</strong>
        <small>JPY 기준 · 환율 {exchangeRate}</small>
      </article>

      <article className="metric-card">
        <span>체크리스트</span>
        <strong>{checklistDone}/{checklistTotal}</strong>
        <small>완료 항목</small>
      </article>

      <section className="panel wide">
        <div className="panel-header">
          <h3>타임라인</h3>
        </div>
        <div className="timeline-list">
          {items.length ? items.map((item) => <TimelineItem key={item.id} item={item} />) : <EmptyState text="오늘 일정이 아직 없습니다." />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>예약 요약</h3>
        </div>
        <div className="reservation-stack compact">
          {reservations.map((reservation) => <ReservationCard key={reservation.id} reservation={reservation} compact />)}
        </div>
      </section>
    </section>
  )
}

function TimelineItem({ item }: { item: ItineraryItem }) {
  return (
    <div className="timeline-item">
      <time>{makeTimeRange(item)}</time>
      <div>
        <strong>{item.title}</strong>
        <span>{item.category} · {item.place || '장소 미정'}</span>
      </div>
    </div>
  )
}

function ScheduleView({
  days,
  items,
  tripTitle,
  activeDay,
  setActiveDay,
  selectedItem,
  setSelectedItem,
  readonly,
  exchangeRate,
  showKrw,
  setShowKrw,
  onExchangeRate,
  onAdd,
  onSave,
  onDelete,
}: {
  days: TripDay[]
  items: ItineraryItem[]
  tripTitle: string
  activeDay: number
  setActiveDay: (day: number) => void
  selectedItem: ItineraryItem | null
  setSelectedItem: (item: ItineraryItem | null) => void
  readonly: boolean
  exchangeRate: number
  showKrw: boolean
  setShowKrw: (value: boolean) => void
  onExchangeRate: (value: number) => void
  onAdd: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
}) {
  const dayItems = items.filter((item) => item.dayIndex === activeDay)
  const dayBudget = dayItems.reduce((sum, item) => sum + item.budgetJpy, 0)
  const [columnWidths, setColumnWidths] = useState<ScheduleColumnWidths>(readScheduleColumnWidths)
  const scheduleGridTemplate = useMemo(() => makeScheduleGridTemplate(columnWidths), [columnWidths])
  const tableStyle = { '--schedule-columns': scheduleGridTemplate } as CSSProperties

  const setColumnWidth = (columnId: ScheduleColumnId, width: number) => {
    const column = scheduleColumns.find((candidate) => candidate.id === columnId)
    if (!column) return
    const nextWidth = clamp(width, column.minWidth, column.maxWidth)
    setColumnWidths((current) => {
      const next = { ...current, [columnId]: nextWidth }
      saveScheduleColumnWidths(next)
      return next
    })
  }

  const startColumnResize = (columnId: ScheduleColumnId, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const column = scheduleColumns.find((candidate) => candidate.id === columnId)
    if (!column) return

    const startX = event.clientX
    const startWidth = columnWidths[columnId]

    const onMouseMove = (moveEvent: MouseEvent) => {
      setColumnWidth(columnId, startWidth + moveEvent.clientX - startX)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const handleColumnResizeKey = (columnId: ScheduleColumnId, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 20 : 10
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setColumnWidth(columnId, columnWidths[columnId] - step)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setColumnWidth(columnId, columnWidths[columnId] + step)
    }
  }

  return (
    <section className="schedule-screen">
      <header className="schedule-header">
        <div className="schedule-title">
          <h1>{tripTitle}</h1>
          <button className="text-icon-button" aria-label="여행 제목 편집">
            <Pencil size={16} />
          </button>
        </div>
        <div className="schedule-actions">
          <button className="ghost-button compact">
            <SlidersHorizontal size={15} />
            환율 설정
          </button>
          <div className="currency-switch" aria-label="예산 통화">
            <button className={!showKrw ? 'active' : ''} onClick={() => setShowKrw(false)}>JPY</button>
            <button className="swap-button" aria-label="통화 전환" onClick={() => setShowKrw(!showKrw)}>
              <RefreshCw size={13} />
            </button>
            <button className={showKrw ? 'active' : ''} onClick={() => setShowKrw(true)}>KRW</button>
          </div>
          <label className="rate-field" aria-label="JPY KRW 환율">
            <span>₩</span>
            <input type="number" step="0.1" value={exchangeRate} onChange={(event) => onExchangeRate(Number(event.target.value))} />
          </label>
          <div className="split-add">
            <button className="primary-button schedule-add" disabled={readonly} onClick={onAdd}>
              일정 추가
            </button>
            <button className="primary-button add-menu" disabled={readonly} aria-label="일정 추가 옵션">
              <ChevronDown size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="schedule-layout">
        <div className="schedule-main">
          <div className="day-tabs">
            {days.map((candidate) => (
              <button key={candidate.dayIndex} className={candidate.dayIndex === activeDay ? 'active' : ''} onClick={() => setActiveDay(candidate.dayIndex)}>
                <span>{`Day${candidate.dayIndex}`}</span>
                <small>{formatTabDate(candidate)}</small>
              </button>
            ))}
          </div>
          <div className="itinerary-table" style={tableStyle}>
            <div className="table-row head">
              {scheduleColumns.map((column) => (
                <span key={column.id}>
                  {column.id === 'budget' ? `${column.label} (${showKrw ? 'KRW' : 'JPY'})` : column.label}
                  <button
                    className="column-resizer"
                    aria-label={`${column.label} 열 너비 조절`}
                    title={`${column.label} 열 너비 조절: 드래그 또는 좌우 화살표`}
                    onMouseDown={(event) => startColumnResize(column.id, event)}
                    onKeyDown={(event) => handleColumnResizeKey(column.id, event)}
                  />
                </span>
              ))}
            </div>
            {dayItems.length ? dayItems.map((item) => (
              <button key={item.id} className={`table-row ${selectedItem?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedItem(item)}>
                <span>{makeTimeRange(item)}</span>
                <span>{item.place || '장소 미정'}</span>
                <span><CategoryBadge category={item.category} /></span>
                <span>{item.title}</span>
                <span>{item.note || '-'}</span>
                <span>{showKrw ? formatKrw(item.budgetJpy, exchangeRate) : item.budgetJpy.toLocaleString('ja-JP')}</span>
              </button>
            )) : <EmptyState text="이 날짜의 일정표가 비어 있습니다." />}
            <button className="table-add-row" disabled={readonly} onClick={onAdd}>
              <Plus size={16} />
              일정 추가
            </button>
            <div className="table-total-row">
              <span>합계</span>
              <strong>{showKrw ? formatKrw(dayBudget, exchangeRate) : dayBudget.toLocaleString('ja-JP')}</strong>
            </div>
          </div>
        </div>
        <DetailPanel key={selectedItem?.id ?? 'empty'} item={selectedItem} readonly={readonly} exchangeRate={exchangeRate} onClose={() => setSelectedItem(null)} onSave={onSave} onDelete={onDelete} />
      </div>
    </section>
  )
}

function DetailPanel({
  item,
  readonly,
  exchangeRate,
  onClose,
  onSave,
  onDelete,
}: {
  item: ItineraryItem | null
  readonly: boolean
  exchangeRate: number
  onClose: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<ItineraryItem | null>(item)

  if (!draft) {
    return (
      <aside className="detail-panel empty">
        <MapPin size={22} />
        <h3>일정을 선택하세요</h3>
        <p>PC에서는 여기서 빠르게 수정하고, 모바일에서는 바텀시트처럼 표시됩니다.</p>
      </aside>
    )
  }

  const update = (patch: Partial<ItineraryItem>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  return (
    <aside className="detail-panel">
      <div className="panel-header">
        <h3>일정 편집</h3>
        <button className="icon-button plain" onClick={onClose} aria-label="편집 패널 닫기">
          <X size={18} />
        </button>
      </div>
      <label>시간</label>
      <div className="two-cols time-cols">
        <label>시작<input value={draft.startTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="09:00" disabled={readonly} onChange={(event) => update({ startTime: event.target.value })} /></label>
        <label>종료<input value={draft.endTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="10:00" disabled={readonly} onChange={(event) => update({ endTime: event.target.value })} /></label>
      </div>
      <label>장소<input value={draft.place} disabled={readonly} onChange={(event) => update({ place: event.target.value })} /></label>
      <label>구분<select value={draft.category} disabled={readonly} onChange={(event) => update({ category: event.target.value as Category })}>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
      <label>내용<input value={draft.title} disabled={readonly} onChange={(event) => update({ title: event.target.value })} /></label>
      <label>비고<textarea value={draft.note} disabled={readonly} onChange={(event) => update({ note: event.target.value })} /></label>
      <label>예산 JPY<input type="number" min="0" value={draft.budgetJpy} disabled={readonly} onChange={(event) => update({ budgetJpy: Number(event.target.value) })} /></label>
      <span className="krw-preview">≈ {formatKrw(draft.budgetJpy, exchangeRate)}</span>
      <label>장소 추가 (Google)<div className="search-control"><Search size={15} /><input disabled placeholder="장소 검색 (기능은 v2에서 제공)" /></div></label>
      <label>Google 장소 검색어<input value={draft.googlePlaceQuery} disabled={readonly} onChange={(event) => update({ googlePlaceQuery: event.target.value })} /></label>
      <div className="detail-actions">
        <button className="ghost-button danger" disabled={readonly} onClick={() => onDelete(draft.id)}>
          <Trash2 size={16} />
          삭제
        </button>
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={readonly} onClick={() => onSave({ ...draft, startTime: normalizeTime(draft.startTime), endTime: normalizeTime(draft.endTime) })}>저장</button>
      </div>
    </aside>
  )
}

function CategoryBadge({ category }: { category: Category }) {
  return <span className={`category-badge c-${category}`}>{category}</span>
}

function ReservationsView({ reservations }: { reservations: Reservation[] }) {
  return (
    <section className="view-grid">
      {reservations.map((reservation) => <ReservationCard key={reservation.id} reservation={reservation} />)}
    </section>
  )
}

function ReservationCard({ reservation, compact = false }: { reservation: Reservation; compact?: boolean }) {
  const Icon = reservation.kind === 'hotel' ? Hotel : Plane
  return (
    <article className={`reservation-card ${compact ? 'compact' : ''}`}>
      <div className="reservation-icon"><Icon size={19} /></div>
      <div>
        <span className="reference">예약번호 {reservation.reference}</span>
        <h3>{reservation.title}</h3>
        <p>{reservation.subtitle}</p>
        {!compact && <ul>{reservation.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
      </div>
      <ChevronRight size={18} />
    </article>
  )
}

function ChecklistView({
  items,
  onToggle,
  readonly,
}: {
  items: ReturnType<typeof useTravelData>['data']['checklistItems']
  onToggle: (id: string) => void
  readonly: boolean
}) {
  const sections = ['출국 전', '여행 중', '귀국 전'] as const

  return (
    <section className="checklist-board">
      {sections.map((section) => (
        <article className="panel" key={section}>
          <div className="panel-header">
            <h3>{section}</h3>
          </div>
          <div className="check-list">
            {items.filter((item) => item.section === section).map((item) => (
              <button key={item.id} disabled={readonly} className={item.done ? 'done' : ''} onClick={() => onToggle(item.id)}>
                {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                {item.title}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}

function SettingsView({
  exchangeRate,
  showKrw,
  setShowKrw,
  onExchangeRate,
  configured,
  authenticated,
}: {
  exchangeRate: number
  showKrw: boolean
  setShowKrw: (value: boolean) => void
  onExchangeRate: (value: number) => void
  configured: boolean
  authenticated: boolean
}) {
  return (
    <section className="settings-grid">
      <article className="panel">
        <div className="panel-header">
          <h3>예산 표시</h3>
        </div>
        <label className="toggle-row">
          KRW로 보기
          <input type="checkbox" checked={showKrw} onChange={(event) => setShowKrw(event.target.checked)} />
        </label>
        <label>JPY → KRW 환율<input type="number" step="0.1" value={exchangeRate} onChange={(event) => onExchangeRate(Number(event.target.value))} /></label>
      </article>
      <article className="panel">
        <div className="panel-header">
          <h3>동기화</h3>
        </div>
        <p className="settings-line">Supabase 설정: <strong>{configured ? '완료' : '없음'}</strong></p>
        <p className="settings-line">로그인 상태: <strong>{authenticated ? '활성' : '비활성'}</strong></p>
        <p className="muted-note">GitHub Pages 배포 후 Supabase Auth redirect URL에 배포 주소를 추가하세요.</p>
      </article>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <ClipboardCheck size={22} />
      <span>{text}</span>
    </div>
  )
}

function MobileTabs({ activeView, setActiveView }: { activeView: View; setActiveView: (view: View) => void }) {
  return (
    <nav className="mobile-tabs" aria-label="모바일 메뉴">
      {views.map((view) => {
        const Icon = view.icon
        return (
          <button key={view.id} className={activeView === view.id ? 'active' : ''} onClick={() => setActiveView(view.id)}>
            <Icon size={18} />
            <span>{view.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function App() {
  const {
    data,
    syncState,
    login,
    logout,
    refresh,
    updateTrip,
    upsertItineraryItem,
    deleteItineraryItem,
    toggleChecklistItem,
  } = useTravelData()

  const [activeView, setActiveView] = useState<View>((window.location.hash.replace('#/', '') as View) || 'today')
  const [activeDay, setActiveDay] = useState(getActiveTripDay(data.days).dayIndex)
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null)
  const [showKrw, setShowKrw] = useState(false)

  const activeTripDay = data.days.find((day) => day.dayIndex === activeDay) ?? data.days[0]
  const todayDay = getActiveTripDay(data.days)
  const todayItems = useMemo(
    () => data.itineraryItems.filter((item) => item.dayIndex === todayDay.dayIndex).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.itineraryItems, todayDay.dayIndex],
  )

  const checklistDone = data.checklistItems.filter((item) => item.done).length

  const navigate = (view: View) => {
    window.location.hash = `/${view}`
    setActiveView(view)
  }

  if (!syncState.authenticated && !syncState.loading) {
    return <AuthScreen login={login} configured={syncState.configured} />
  }

  const addItem = () => {
    const created = upsertItineraryItem({ dayIndex: activeTripDay.dayIndex, date: activeTripDay.date })
    setSelectedItem(created)
  }

  const saveItem = (item: ItineraryItem) => {
    const saved = upsertItineraryItem(item)
    setSelectedItem(saved)
  }

  const deleteItem = (id: string) => {
    deleteItineraryItem(id)
    setSelectedItem(null)
  }

  return (
    <div className="app-shell">
      <ShellNav activeView={activeView} setActiveView={navigate} />
      <main className="workspace">
        {activeView !== 'schedule' && <StatusStrip message={syncState.message} offline={syncState.offline} readonly={syncState.readonly} onRefresh={refresh} onLogout={logout} />}
        {activeView === 'today' && (
          <TodayView
            day={todayDay}
            items={todayItems}
            reservations={data.reservations}
            checklistDone={checklistDone}
            checklistTotal={data.checklistItems.length}
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
          />
        )}
        {activeView === 'schedule' && (
          <ScheduleView
            days={data.days}
            items={data.itineraryItems}
            tripTitle={data.trip.title}
            activeDay={activeDay}
            setActiveDay={setActiveDay}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            readonly={syncState.readonly}
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
            setShowKrw={setShowKrw}
            onExchangeRate={(exchangeRate) => updateTrip({ ...data.trip, exchangeRate })}
            onAdd={addItem}
            onSave={saveItem}
            onDelete={deleteItem}
          />
        )}
        {activeView === 'reservations' && <ReservationsView reservations={data.reservations} />}
        {activeView === 'checklist' && <ChecklistView items={data.checklistItems} onToggle={toggleChecklistItem} readonly={syncState.readonly} />}
        {activeView === 'settings' && (
          <SettingsView
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
            setShowKrw={setShowKrw}
            onExchangeRate={(exchangeRate) => updateTrip({ ...data.trip, exchangeRate })}
            configured={syncState.configured}
            authenticated={syncState.authenticated}
          />
        )}
      </main>
      <MobileTabs activeView={activeView} setActiveView={navigate} />
    </div>
  )
}

export default App
