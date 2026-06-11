import {
  CalendarDays,
  CheckCircle2,
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
  Plane,
  Plus,
  Settings,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
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

const getActiveTripDay = (days: TripDay[]) => {
  const today = new Date().toISOString().slice(0, 10)
  return days.find((day) => day.date === today) ?? days[0]
}

const makeTimeRange = (item: ItineraryItem) => `${item.startTime || '--:--'} ~ ${item.endTime || '--:--'}`

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
  activeDay,
  setActiveDay,
  selectedItem,
  setSelectedItem,
  readonly,
  exchangeRate,
  showKrw,
  onAdd,
  onSave,
  onDelete,
}: {
  days: TripDay[]
  items: ItineraryItem[]
  activeDay: number
  setActiveDay: (day: number) => void
  selectedItem: ItineraryItem | null
  setSelectedItem: (item: ItineraryItem | null) => void
  readonly: boolean
  exchangeRate: number
  showKrw: boolean
  onAdd: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
}) {
  const day = days.find((candidate) => candidate.dayIndex === activeDay) ?? days[0]
  const dayItems = items.filter((item) => item.dayIndex === activeDay)

  return (
    <section className="schedule-layout">
      <div className="schedule-main">
        <div className="day-tabs">
          {days.map((candidate) => (
            <button key={candidate.dayIndex} className={candidate.dayIndex === activeDay ? 'active' : ''} onClick={() => setActiveDay(candidate.dayIndex)}>
              {candidate.label}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <div>
            <h2>{day.label}</h2>
            <p>표처럼 빠르게 훑고, 상세 패널에서 편집합니다.</p>
          </div>
          <button className="primary-button" disabled={readonly} onClick={onAdd}>
            <Plus size={17} />
            일정 추가
          </button>
        </div>
        <div className="itinerary-table">
          <div className="table-row head">
            <span>시간</span>
            <span>장소</span>
            <span>구분</span>
            <span>내용</span>
            <span>비고</span>
            <span>예산</span>
          </div>
          {dayItems.length ? dayItems.map((item) => (
            <button key={item.id} className={`table-row ${selectedItem?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedItem(item)}>
              <span>{makeTimeRange(item)}</span>
              <span>{item.place || '장소 미정'}</span>
              <span><CategoryBadge category={item.category} /></span>
              <span>{item.title}</span>
              <span>{item.note || '-'}</span>
              <span>{showKrw ? formatKrw(item.budgetJpy, exchangeRate) : formatJpy(item.budgetJpy)}</span>
            </button>
          )) : <EmptyState text="이 날짜의 일정표가 비어 있습니다." />}
        </div>
      </div>
      <DetailPanel key={selectedItem?.id ?? 'empty'} item={selectedItem} readonly={readonly} onSave={onSave} onDelete={onDelete} />
    </section>
  )
}

function DetailPanel({
  item,
  readonly,
  onSave,
  onDelete,
}: {
  item: ItineraryItem | null
  readonly: boolean
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
        <h3>상세 편집</h3>
        <button className="icon-button danger" disabled={readonly} onClick={() => onDelete(draft.id)} aria-label="일정 삭제">
          <Trash2 size={17} />
        </button>
      </div>
      <label>내용<input value={draft.title} disabled={readonly} onChange={(event) => update({ title: event.target.value })} /></label>
      <div className="two-cols">
        <label>시작<input value={draft.startTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="09:00" disabled={readonly} onChange={(event) => update({ startTime: event.target.value })} /></label>
        <label>종료<input value={draft.endTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="10:00" disabled={readonly} onChange={(event) => update({ endTime: event.target.value })} /></label>
      </div>
      <label>장소<input value={draft.place} disabled={readonly} onChange={(event) => update({ place: event.target.value })} /></label>
      <label>구분<select value={draft.category} disabled={readonly} onChange={(event) => update({ category: event.target.value as Category })}>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
      <label>비고<textarea value={draft.note} disabled={readonly} onChange={(event) => update({ note: event.target.value })} /></label>
      <label>예산 JPY<input type="number" min="0" value={draft.budgetJpy} disabled={readonly} onChange={(event) => update({ budgetJpy: Number(event.target.value) })} /></label>
      <label>Google 장소 검색어<input value={draft.googlePlaceQuery} disabled={readonly} onChange={(event) => update({ googlePlaceQuery: event.target.value })} /></label>
      <button className="ghost-button" disabled>장소 추가 · v1 준비 중</button>
      <button className="primary-button full" disabled={readonly} onClick={() => onSave({ ...draft, startTime: normalizeTime(draft.startTime), endTime: normalizeTime(draft.endTime) })}>저장</button>
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
        <StatusStrip message={syncState.message} offline={syncState.offline} readonly={syncState.readonly} onRefresh={refresh} onLogout={logout} />
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
            activeDay={activeDay}
            setActiveDay={setActiveDay}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            readonly={syncState.readonly}
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
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
