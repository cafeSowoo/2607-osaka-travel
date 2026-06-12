import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Cloud,
  CloudOff,
  GripVertical,
  Hotel,
  ListChecks,
  LogIn,
  LogOut,
  Luggage,
  MapPin,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import './App.css'
import { categories } from './data/seed'
import { useTravelData } from './hooks/useTravelData'
import type { Category, ChecklistItem, ChecklistItemKind, ItineraryItem, Reservation, SyncState, TripDay } from './types'

type View = 'schedule' | 'reservations' | 'checklist' | 'settings'

const views: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: 'schedule', label: '일정', icon: CalendarDays },
  { id: 'reservations', label: '예약', icon: Plane },
  { id: 'checklist', label: '체크리스트', icon: ListChecks },
  { id: 'settings', label: '설정', icon: Settings },
]
const viewIds = views.map((view) => view.id)

const getViewFromHash = (): View => {
  const candidate = window.location.hash.replace('#/', '')
  return viewIds.includes(candidate as View) ? candidate as View : 'schedule'
}

const formatJpy = (value: number) => `¥${value.toLocaleString('ja-JP')}`
const formatKrw = (value: number, rate: number) => `₩${Math.round(value * rate).toLocaleString('ko-KR')}`
const formatBudget = (value: number, showKrw: boolean, rate: number) => showKrw ? formatKrw(value, rate) : formatJpy(value)
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
const formatPlace = (place: string) => place.replace(/\s*->\s*/g, ' → ')
const formatTabDate = (day: TripDay) => {
  const [, month, date] = day.date.split('-')
  return `${month}.${date} (${day.label.split(' ').at(-1) ?? ''})`
}

const categoryToneClasses: Record<Category, string> = {
  이동: 'tone-travel',
  식사: 'tone-meal',
  카페: 'tone-cafe',
  관광: 'tone-sight',
  쇼핑: 'tone-shopping',
  휴식: 'tone-rest',
  기타: 'tone-etc',
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
        <div className="app-mark small"><Luggage size={19} /></div>
        <div>
          <strong>2607 Osaka</strong>
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
  title,
  message,
  offline,
  readonly,
  onRefresh,
  onLogout,
  syncState,
}: {
  title: string
  message: string
  offline: boolean
  readonly: boolean
  onRefresh: () => void
  onLogout: () => void
  syncState: SyncState
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <span className={offline ? 'sync-chip danger' : 'sync-chip'}>
          {offline ? <CloudOff size={15} /> : <Cloud size={15} />}
          {readonly ? '오프라인 읽기 전용' : message}
        </span>
        <button className="ghost-button" onClick={onRefresh}>새로고침</button>
        <AccountStatus syncState={syncState} onLogout={onLogout} />
      </div>
    </header>
  )
}

function AccountStatus({ syncState, onLogout }: { syncState: SyncState; onLogout: () => void }) {
  const userInitial = syncState.user?.name?.trim().charAt(0) || '旅'

  if (!syncState.configured) {
    return (
      <div className="account-cluster">
        <span className="login-pill">데모 모드</span>
      </div>
    )
  }

  return (
    <div className="account-cluster">
      <span className="avatar-button" title={syncState.user?.email || syncState.user?.name || '계정'}>
        {syncState.user?.avatarUrl ? (
          <img src={syncState.user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span>{userInitial}</span>
        )}
      </span>
      <button className="logout-chip" type="button" onClick={onLogout}>
        <LogOut size={16} />
        로그아웃
      </button>
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
  onAdd,
  onSave,
  onDelete,
  syncState,
  onLogout,
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
  onAdd: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
  syncState: SyncState
  onLogout: () => void
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

  const dayTabs = (className = '') => (
    <div className={`day-tabs ${className}`}>
      {days.map((candidate) => (
        <button key={candidate.dayIndex} className={candidate.dayIndex === activeDay ? 'active' : ''} onClick={() => setActiveDay(candidate.dayIndex)}>
          <span>{`Day${candidate.dayIndex}`}</span>
          <small>{formatTabDate(candidate)}</small>
        </button>
      ))}
    </div>
  )

  return (
    <section className="schedule-screen">
      <div className="mobile-schedule-sticky">
        <header className="schedule-header">
          <div className="schedule-title">
            <h1>{tripTitle}</h1>
            <AccountStatus syncState={syncState} onLogout={onLogout} />
          </div>
          <div className="schedule-actions">
            <div className="currency-switch" aria-label="예산 통화">
              <button className="active currency-current" onClick={() => setShowKrw(!showKrw)}>
                {showKrw ? 'KRW' : 'JPY'}
              </button>
              <button className="swap-button" aria-label="통화 전환" onClick={() => setShowKrw(!showKrw)}>
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="split-add">
              <button className="primary-button schedule-add" disabled={readonly} onClick={onAdd}>
                일정 추가
              </button>
            </div>
          </div>
        </header>
        {dayTabs('mobile-day-tabs')}
      </div>

      <header className="schedule-header">
        <div className="schedule-title">
          <h1>{tripTitle}</h1>
          <AccountStatus syncState={syncState} onLogout={onLogout} />
        </div>
        <div className="schedule-actions">
          <div className="currency-switch" aria-label="예산 통화">
            <button className="active currency-current" onClick={() => setShowKrw(!showKrw)}>
              {showKrw ? 'KRW' : 'JPY'}
            </button>
            <button className="swap-button" aria-label="통화 전환" onClick={() => setShowKrw(!showKrw)}>
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="split-add">
            <button className="primary-button schedule-add" disabled={readonly} onClick={onAdd}>
              일정 추가
            </button>
          </div>
        </div>
      </header>

      <div className="schedule-layout">
        <div className="schedule-main">
          {dayTabs('desktop-day-tabs')}
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
              <button key={item.id} className={`table-row ${categoryToneClasses[item.category]} ${selectedItem?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedItem(item)}>
                <span className="mobile-time-stack">
                  <span>{item.startTime || '--:--'}</span>
                  <span className="time-divider">~</span>
                  <span>{item.endTime || '--:--'}</span>
                </span>
                <span className="mobile-card-content">
                  <CategoryBadge category={item.category} />
                  <span className="mobile-card-place">{formatPlace(item.place || '장소 미정')}</span>
                  <span className="mobile-card-title">{item.title}</span>
                </span>
                <span className="schedule-time">{makeTimeRange(item)}</span>
                <span className="schedule-place">{formatPlace(item.place || '장소 미정')}</span>
                <span className="schedule-category"><CategoryBadge category={item.category} /></span>
                <span className="schedule-title-cell">{item.title}</span>
                <span className="schedule-note">{item.note || '-'}</span>
                <span className="schedule-budget">{formatBudget(item.budgetJpy, showKrw, exchangeRate)}</span>
              </button>
            )) : <EmptyState text="이 날짜의 일정표가 비어 있습니다." />}
            <div className="table-total-row">
              <span>합계</span>
              <strong>{formatBudget(dayBudget, showKrw, exchangeRate)}</strong>
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
  const typeLabel = reservation.kind === 'hotel' ? '호텔' : '항공권'
  const sourceBadge = reservation.kind === 'hotel' ? `아고다 예약번호 ${reservation.reference}` : `예약번호 ${reservation.reference}`
  const visibleDetails = compact ? reservation.details.slice(0, 2) : reservation.details

  return (
    <article className={`reservation-card ${compact ? 'compact' : ''}`}>
      <div className="reservation-icon"><Icon size={19} /></div>
      <div className="reservation-content">
        <div className="reservation-kicker">
          <span>{typeLabel}</span>
          <strong>{sourceBadge}</strong>
        </div>
        <h3>{reservation.title}</h3>
        <p>{reservation.subtitle}</p>
        <div className="reservation-detail-list">
          {visibleDetails.map((detail) => <span key={detail}>{detail}</span>)}
        </div>
      </div>
      <ChevronRight className="reservation-chevron" size={18} />
    </article>
  )
}

type ChecklistDragState = {
  section: ChecklistItem['section']
  fromId: string
  floatIndex: number
  slotHeight: number
  listTop: number
}

function getFloatIndexFromPointer(
  itemCount: number,
  pointerY: number,
  listTop: number,
  slotHeight: number,
): number {
  const relativeY = pointerY - listTop
  const index = relativeY / slotHeight
  return Math.max(0, Math.min(itemCount - 1, index))
}

function discreteTargetSlot(index: number, fromIndex: number, floatIndex: number): number {
  if (index === fromIndex) return floatIndex
  if (fromIndex < floatIndex) {
    if (index > fromIndex && index <= floatIndex) return index - 1
  } else if (fromIndex > floatIndex) {
    if (index < fromIndex && index >= floatIndex) return index + 1
  }
  return index
}

function getContinuousShifts(
  items: ChecklistItem[],
  fromId: string,
  floatIndex: number,
  slotHeight: number,
): Record<string, number> {
  const fromIndex = items.findIndex((item) => item.id === fromId)
  if (fromIndex < 0) return {}

  const floorIndex = Math.floor(floatIndex)
  const ceilIndex = Math.ceil(floatIndex)
  const fraction = floatIndex - floorIndex
  const shifts: Record<string, number> = {}

  items.forEach((item, index) => {
    const slotAtFloor = discreteTargetSlot(index, fromIndex, floorIndex)
    const slotAtCeil = discreteTargetSlot(index, fromIndex, ceilIndex)
    const targetSlot = floorIndex === ceilIndex
      ? slotAtFloor
      : slotAtFloor + (slotAtCeil - slotAtFloor) * fraction

    shifts[item.id] = (targetSlot - index) * slotHeight
  })

  return shifts
}

const TRANSPARENT_DRAG_IMAGE = (() => {
  if (typeof Image === 'undefined') return null
  const image = new Image()
  image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return image
})()

function ChecklistView({
  items,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  readonly,
}: {
  items: ChecklistItem[]
  onToggle: (id: string) => void
  onAdd: (section: ChecklistItem['section'], title: string, kind?: ChecklistItemKind) => void
  onUpdate: (id: string, title: string) => void
  onDelete: (id: string) => void
  onReorder: (section: ChecklistItem['section'], fromId: string, toId: string) => void
  readonly: boolean
}) {
  const sections = ['출국 전', '여행 중', '귀국 전'] as const
  const [addingSection, setAddingSection] = useState<ChecklistItem['section'] | null>(null)
  const [addingKind, setAddingKind] = useState<ChecklistItemKind>('task')
  const [draftTitle, setDraftTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [dragState, setDragState] = useState<ChecklistDragState | null>(null)
  const dragStateRef = useRef<ChecklistDragState | null>(null)
  const dragImageRef = useRef<HTMLElement | null>(null)
  const listRefs = useRef<Partial<Record<ChecklistItem['section'], HTMLDivElement | null>>>({})
  const flipBeforeRef = useRef<Map<string, DOMRect>>(new Map())

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  const captureFlipBefore = (section: ChecklistItem['section']) => {
    const list = listRefs.current[section]
    if (!list) return

    const rects = new Map<string, DOMRect>()
    list.querySelectorAll('[data-check-id]').forEach((element) => {
      const id = element.getAttribute('data-check-id')
      if (id) rects.set(id, element.getBoundingClientRect())
    })
    flipBeforeRef.current = rects
  }

  useLayoutEffect(() => {
    if (flipBeforeRef.current.size === 0 || dragState) return

    Object.values(listRefs.current).forEach((list) => {
      list?.querySelectorAll('[data-check-id]').forEach((element) => {
        const id = element.getAttribute('data-check-id')
        if (!id || !flipBeforeRef.current.has(id)) return

        const deltaY = flipBeforeRef.current.get(id)!.top - element.getBoundingClientRect().top
        if (Math.abs(deltaY) < 1) return

        const htmlElement = element as HTMLElement
        htmlElement.style.transition = 'none'
        htmlElement.style.transform = `translateY(${deltaY}px)`
        requestAnimationFrame(() => {
          htmlElement.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1)'
          htmlElement.style.transform = ''
        })
      })
    })
    flipBeforeRef.current = new Map()
  }, [items, dragState])

  const handleToggle = (section: ChecklistItem['section'], itemId: string) => {
    if (readonly || dragStateRef.current) return
    captureFlipBefore(section)
    onToggle(itemId)
  }

  const clearDragStyles = useCallback(() => {
    Object.values(listRefs.current).forEach((list) => {
      list?.querySelectorAll('.check-item').forEach((element) => {
        const htmlElement = element as HTMLElement
        htmlElement.style.transition = ''
        htmlElement.style.transform = ''
      })
    })
  }, [])

  const endDrag = useCallback(() => {
    dragImageRef.current?.remove()
    dragImageRef.current = null
    clearDragStyles()
    setDragState(null)
  }, [clearDragStyles])

  useEffect(() => {
    document.addEventListener('dragend', endDrag)
    return () => document.removeEventListener('dragend', endDrag)
  }, [endDrag])

  useEffect(() => {
    if (!dragState) return

    const handlePointerUp = () => {
      window.setTimeout(() => {
        if (dragStateRef.current) endDrag()
      }, 50)
    }

    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, endDrag])

  const submitNewItem = (section: ChecklistItem['section'], event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanTitle = draftTitle.trim()
    if (!cleanTitle) return
    onAdd(section, cleanTitle, addingKind)
    setDraftTitle('')
    setAddingKind('task')
    setAddingSection(null)
  }

  const openAddForm = (section: ChecklistItem['section']) => {
    cancelEditing()
    setAddingSection((current) => (current === section ? null : section))
    setAddingKind('task')
    setDraftTitle('')
  }

  const startEditing = (item: ChecklistItem) => {
    if (readonly || dragStateRef.current) return
    setAddingSection(null)
    setDraftTitle('')
    setEditingId(item.id)
    setEditDraft(item.title)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const submitEdit = (item: ChecklistItem) => {
    const cleanTitle = editDraft.trim()
    if (!cleanTitle) {
      cancelEditing()
      return
    }
    onUpdate(item.id, cleanTitle)
    cancelEditing()
  }

  const handleEditKeyDown = (item: ChecklistItem, event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitEdit(item)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  const startDrag = (item: ChecklistItem, sectionItems: ChecklistItem[], event: ReactDragEvent<HTMLButtonElement>) => {
    if (dragStateRef.current) return

    const checkItem = event.currentTarget.closest('.check-item') as HTMLElement | null
    const fromIndex = sectionItems.findIndex((entry) => entry.id === item.id)

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.setData('application/x-checklist-section', item.section)

    if (checkItem) {
      const list = checkItem.closest('.check-list') as HTMLElement | null
      const listTop = list?.getBoundingClientRect().top ?? checkItem.getBoundingClientRect().top - fromIndex * (checkItem.offsetHeight + 10)
      const slotHeight = checkItem.offsetHeight + 10

      if (TRANSPARENT_DRAG_IMAGE) {
        event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0)
      } else {
        const dragGhost = document.createElement('div')
        dragGhost.style.width = '1px'
        dragGhost.style.height = '1px'
        dragGhost.style.opacity = '0'
        dragGhost.style.position = 'fixed'
        dragGhost.style.top = '0'
        dragGhost.style.left = '0'
        document.body.appendChild(dragGhost)
        dragImageRef.current = dragGhost
        event.dataTransfer.setDragImage(dragGhost, 0, 0)
      }

      requestAnimationFrame(() => {
        setDragState({
          section: item.section,
          fromId: item.id,
          floatIndex: fromIndex,
          slotHeight,
          listTop,
        })
      })
    }
  }

  const handleListDragOver = (
    section: ChecklistItem['section'],
    sectionItems: ChecklistItem[],
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    const current = dragStateRef.current
    if (!current || current.section !== section) return

    const floatIndex = getFloatIndexFromPointer(
      sectionItems.length,
      event.clientY,
      current.listTop,
      current.slotHeight,
    )

    if (Math.abs(floatIndex - current.floatIndex) < 0.01) return
    setDragState((state) => state ? { ...state, floatIndex } : null)
  }

  const dropItem = (section: ChecklistItem['section'], sectionItems: ChecklistItem[], event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const current = dragStateRef.current
    if (current?.section === section) {
      const targetIndex = Math.round(current.floatIndex)
      const toItem = sectionItems[targetIndex]
      if (toItem && current.fromId !== toItem.id) {
        onReorder(section, current.fromId, toItem.id)
      }
    }
    endDrag()
  }

  return (
    <section className="checklist-board">
      {sections.map((section) => {
        const sectionItems = items.filter((item) => item.section === section).sort((a, b) => a.sortOrder - b.sortOrder)

        return (
          <article className="panel" key={section}>
            <div className="panel-header">
              <h3>{section}</h3>
              <button
                className="round-add-button"
                type="button"
                disabled={readonly}
                aria-label={`${section} 항목 추가`}
                onClick={() => openAddForm(section)}
              >
                <Plus size={16} />
              </button>
            </div>
            {addingSection === section && (
              <form className="check-add-form" onSubmit={(event) => submitNewItem(section, event)}>
                <div className="check-add-kind">
                  <button
                    type="button"
                    className={addingKind === 'task' ? 'active' : ''}
                    disabled={readonly}
                    onClick={() => setAddingKind('task')}
                  >
                    To-do
                  </button>
                  <button
                    type="button"
                    className={addingKind === 'divider' ? 'active' : ''}
                    disabled={readonly}
                    onClick={() => setAddingKind('divider')}
                  >
                    구분자
                  </button>
                </div>
                <input
                  autoFocus
                  value={draftTitle}
                  placeholder={addingKind === 'divider' ? '구분자 이름' : 'To-do 추가'}
                  disabled={readonly}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
                <button className="primary-button" type="submit" disabled={readonly || !draftTitle.trim()}>
                  추가
                </button>
              </form>
            )}
            <div
              className={`check-list ${dragState?.section === section ? 'is-sorting' : ''}`}
              ref={(element) => { listRefs.current[section] = element }}
              onDragOver={(event) => handleListDragOver(section, sectionItems, event)}
              onDragEnd={endDrag}
              onDrop={(event) => dropItem(section, sectionItems, event)}
            >
              {sectionItems.map((item) => {
                const isDivider = item.kind === 'divider'
                const isDraggingSection = dragState?.section === section
                const isPreview = isDraggingSection && dragState.fromId === item.id
                const isEditing = editingId === item.id
                const shift = isDraggingSection
                  ? getContinuousShifts(sectionItems, dragState.fromId, dragState.floatIndex, dragState.slotHeight)[item.id] ?? 0
                  : 0

                return (
                <div
                  key={item.id}
                  data-check-id={item.id}
                  className={`check-item ${isDivider ? 'divider' : ''} ${item.done ? 'done' : ''} ${isPreview ? 'drag-preview' : ''} ${isEditing ? 'editing' : ''}`}
                  style={shift ? { transform: `translateY(${shift}px)` } : undefined}
                  onDragOver={(event) => handleListDragOver(section, sectionItems, event)}
                  onDrop={(event) => dropItem(section, sectionItems, event)}
                >
                  {isDivider ? (
                    <>
                      <div className="check-divider-body">
                        {isEditing ? (
                          <input
                            autoFocus
                            className="check-edit-input"
                            value={editDraft}
                            disabled={readonly}
                            aria-label={`${item.title} 수정`}
                            onChange={(event) => setEditDraft(event.target.value)}
                            onKeyDown={(event) => handleEditKeyDown(item, event)}
                            onBlur={() => submitEdit(item)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="check-divider-title"
                            disabled={readonly || isPreview}
                            title="클릭해서 수정"
                            onClick={() => startEditing(item)}
                          >
                            {item.title}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="check-delete"
                        disabled={readonly || isPreview}
                        aria-label={`${item.title} 구분자 삭제`}
                        title="구분자 삭제"
                        onClick={() => onDelete(item.id)}
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <div className="check-toggle">
                      <button
                        type="button"
                        disabled={readonly}
                        className="check-mark"
                        aria-label={item.done ? `${item.title} 완료 취소` : `${item.title} 완료`}
                        onClick={() => handleToggle(section, item.id)}
                      >
                        {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      {isEditing ? (
                        <input
                          autoFocus
                          className="check-edit-input"
                          value={editDraft}
                          disabled={readonly}
                          aria-label={`${item.title} 수정`}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => handleEditKeyDown(item, event)}
                          onBlur={() => submitEdit(item)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="check-title"
                          disabled={readonly || isPreview}
                          title="클릭해서 수정"
                          onClick={() => startEditing(item)}
                        >
                          {item.title}
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="drag-handle"
                    draggable={!readonly && !isEditing}
                    disabled={readonly || isEditing}
                    aria-label={`${item.title} 순서 변경`}
                    title="드래그해서 순서 변경"
                    aria-hidden={isPreview}
                    tabIndex={isPreview ? -1 : 0}
                    onDragStart={(event) => startDrag(item, sectionItems, event)}
                    onDragEnd={endDrag}
                  >
                    <GripVertical size={17} />
                  </button>
                </div>
                )
              })}
            </div>
          </article>
        )
      })}
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
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    reorderChecklistItems,
  } = useTravelData()

  const [activeView, setActiveView] = useState<View>(getViewFromHash)
  const [activeDay, setActiveDay] = useState(getActiveTripDay(data.days).dayIndex)
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null)
  const [showKrw, setShowKrw] = useState(false)

  const activeTripDay = data.days.find((day) => day.dayIndex === activeDay) ?? data.days[0]
  const activeViewLabel = views.find((view) => view.id === activeView)?.label ?? data.trip.title
  const navigate = (view: View) => {
    window.location.hash = `/${view}`
    setActiveView(view)
  }

  useEffect(() => {
    const syncViewFromHash = () => {
      const nextView = getViewFromHash()
      setActiveView(nextView)
      if (window.location.hash !== `#/${nextView}`) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${nextView}`)
      }
    }
    const initialSync = window.setTimeout(syncViewFromHash, 0)
    window.addEventListener('hashchange', syncViewFromHash)

    return () => {
      window.clearTimeout(initialSync)
      window.removeEventListener('hashchange', syncViewFromHash)
    }
  }, [])

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
        {activeView !== 'schedule' && <StatusStrip title={activeViewLabel} message={syncState.message} offline={syncState.offline} readonly={syncState.readonly} onRefresh={refresh} onLogout={logout} syncState={syncState} />}
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
            onAdd={addItem}
            onSave={saveItem}
            onDelete={deleteItem}
            syncState={syncState}
            onLogout={logout}
          />
        )}
        {activeView === 'reservations' && <ReservationsView reservations={data.reservations} />}
        {activeView === 'checklist' && (
          <ChecklistView
            items={data.checklistItems}
            onToggle={toggleChecklistItem}
            onAdd={addChecklistItem}
            onUpdate={updateChecklistItem}
            onDelete={deleteChecklistItem}
            onReorder={reorderChecklistItems}
            readonly={syncState.readonly}
          />
        )}
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
