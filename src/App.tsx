import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
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
  MoreHorizontal,
  NotebookPen,
  PencilLine,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
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
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react'
import './App.css'
import chatGptActionIcon from './assets/chatgpt-action-icon.png'
import googleMapsActionIcon from './assets/google-maps-action-icon.png'
import { BACKUP_DAY_INDEX, categories } from './data/seed'
import { useTravelData } from './hooks/useTravelData'
import {
  createAutocompleteSessionToken,
  fetchPlaceSuggestions,
  isGooglePlacesConfigured,
  resolvePlaceFromPrediction,
  type GooglePlaceSelection,
  type PlaceSuggestion,
} from './lib/googleMaps'
import { sortItineraryItems } from './lib/itinerarySort'
import { fillItineraryWithAi } from './lib/supabase'
import { formatTimeInput, isValidTime, normalizeTime, parseTimeToMinutes } from './lib/time'
import type { Category, ChecklistItem, ChecklistItemKind, ItineraryItem, Memo, Reservation, SyncState, TripDay } from './types'

type View = 'schedule' | 'reservations' | 'checklist' | 'memos' | 'settings'

const views: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: 'schedule', label: '일정', icon: CalendarDays },
  { id: 'reservations', label: '예약', icon: Plane },
  { id: 'checklist', label: '체크리스트', icon: ListChecks },
  { id: 'memos', label: '메모', icon: NotebookPen },
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
const isMobileViewport = () => window.matchMedia('(max-width: 980px)').matches
const isAndroidDevice = () => /Android/i.test(navigator.userAgent)
const isBackupDay = (day: TripDay) => day.isBackup || day.dayIndex === BACKUP_DAY_INDEX
const getDayLabel = (day: TripDay) => isBackupDay(day) ? '후보' : `Day${day.dayIndex}`
const MOBILE_LAYOUT_QUERY = '(max-width: 980px)'
const DAY_SWIPE_THRESHOLD = 56
const DAY_SWIPE_AXIS_LOCK = 12
const DAY_SWIPE_RUBBER_BAND = 0.3

const clampDayDrag = (offset: number, activeIndex: number, dayCount: number) => {
  if (activeIndex <= 0 && offset > 0) return offset * DAY_SWIPE_RUBBER_BAND
  if (activeIndex >= dayCount - 1 && offset < 0) return offset * DAY_SWIPE_RUBBER_BAND
  return offset
}

type ItineraryDraftValidation =
  | { ok: true; startTime: string; endTime: string }
  | { ok: false; message: string }

const validateItineraryDraft = (item: ItineraryItem): ItineraryDraftValidation => {
  if (!item.place.trim() && !item.title.trim()) {
    return { ok: false, message: '장소 또는 내용 중 하나는 입력해야 합니다.' }
  }

  const startTime = normalizeTime(item.startTime)
  const endTime = normalizeTime(item.endTime)
  if (!isValidTime(startTime)) {
    return { ok: false, message: '시작 시간을 HH:MM 형식으로 입력하세요. (예: 09:00)' }
  }
  if (!isValidTime(endTime)) {
    return { ok: false, message: '종료 시간을 HH:MM 형식으로 입력하세요. (예: 10:00)' }
  }

  return { ok: true, startTime, endTime }
}

function useMobileLayout() {
  const [mobileLayout, setMobileLayout] = useState(isMobileViewport)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const syncLayout = () => setMobileLayout(media.matches)
    syncLayout()
    media.addEventListener('change', syncLayout)
    return () => media.removeEventListener('change', syncLayout)
  }, [])

  return mobileLayout
}
const SCHEDULE_COLUMN_STORAGE_KEY = 'osaka-travel-pwa:schedule-column-widths:v1'
const DRAFT_ITINERARY_ID_PREFIX = 'draft-itinerary-'
const CHATGPT_APP_URL = 'https://chatgpt.com/'
const CHATGPT_ANDROID_INTENT_URL = 'intent://chatgpt.com/#Intent;scheme=https;package=com.openai.chatgpt;end'
const GOOGLE_MAPS_APP_URL = 'https://www.google.com/maps'

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

const formatLocalDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getActiveTripDay = (days: TripDay[]) => {
  const today = formatLocalDateKey(new Date())
  const sortedDays = [...days]
    .filter((day) => !isBackupDay(day))
    .sort((a, b) => a.date.localeCompare(b.date))
  return sortedDays.findLast((day) => day.date <= today) ?? sortedDays[0] ?? days[0]
}

const makeTimeRange = (item: ItineraryItem) => `${item.startTime || '--:--'} ~ ${item.endTime || '--:--'}`
const formatDuration = (item: Pick<ItineraryItem, 'startTime' | 'endTime'>) => {
  const startMinutes = parseTimeToMinutes(item.startTime)
  const endMinutes = parseTimeToMinutes(item.endTime)
  if (startMinutes === null || endMinutes === null) return ''
  const durationMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : endMinutes + 24 * 60 - startMinutes
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  if (hours === 0) return `(${String(minutes).padStart(2, '0')}m)`
  return `(${hours}h ${String(minutes).padStart(2, '0')}m)`
}
const formatPlace = (place: string) => place.replace(/\s*->\s*/g, ' → ')
const formatTabDate = (day: TripDay) => {
  if (isBackupDay(day)) return '백업 일정'
  const [, month, date] = day.date.split('-')
  return `${month}.${date} (${day.label.split(' ').at(-1) ?? ''})`
}
const getDayAriaLabel = (day: TripDay) => `${getDayLabel(day)} ${formatTabDate(day)}`
const isDraftItineraryItem = (item: ItineraryItem) => item.id.startsWith(DRAFT_ITINERARY_ID_PREFIX)
const makeGoogleMapsSearchUrl = (query: string) => (
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim().replace(/\s+/g, ' '))}`
)

const getItineraryMapsTargetUrl = (item: Pick<ItineraryItem, 'googlePlaceQuery' | 'place' | 'googleMapsUri'>) => {
  const mapsQuery = getGoogleMapsQuery(item)
  return (item.googleMapsUri ?? '').trim() || (mapsQuery ? makeGoogleMapsSearchUrl(mapsQuery) : '')
}

const getGoogleMapsQuery = (item: Pick<ItineraryItem, 'googlePlaceQuery' | 'place'>) => (
  (item.googlePlaceQuery ?? '').trim() || (item.place ?? '').trim()
)

const inferLinkedPlaceLabel = (item: Pick<ItineraryItem, 'place' | 'googlePlaceQuery' | 'formattedAddress' | 'googlePlaceId'>) => {
  if (!(item.googlePlaceId ?? '').trim()) return ''
  const address = (item.formattedAddress ?? '').trim()
  const query = (item.googlePlaceQuery ?? '').trim()
  if (address && query.endsWith(address)) return query.slice(0, query.length - address.length).trim()
  if (address && query.includes(address)) return query.replace(address, '').trim()
  return (item.place ?? '').trim()
}

const getPlaceSearchSeed = (item: Pick<ItineraryItem, 'place' | 'googlePlaceQuery' | 'formattedAddress' | 'googlePlaceId'>) => {
  const linkedLabel = inferLinkedPlaceLabel(item)
  if (linkedLabel) return linkedLabel
  return getGoogleMapsQuery(item)
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
        <p>항공권, 호텔, Day1~Day5와 후보 일정을 한곳에서 관리하는 개인 여행 PWA입니다.</p>
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

function AccountStatus({
  syncState,
  onLogout,
  showLogout = true,
}: {
  syncState: SyncState
  onLogout?: () => void
  showLogout?: boolean
}) {
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
      {showLogout && onLogout && (
        <button className="logout-chip" type="button" onClick={onLogout}>
          <LogOut size={16} />
          로그아웃
        </button>
      )}
    </div>
  )
}

function DayTabs({
  sortedDays,
  activeDay,
  onChange,
  className = '',
}: {
  sortedDays: TripDay[]
  activeDay: number
  onChange: (dayIndex: number) => void
  className?: string
}) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    const root = tabsRef.current
    if (!root) return

    const syncIndicator = () => {
      const activeButton = root.querySelector<HTMLElement>('.day-tab-button.active')
      if (!activeButton) return
      setIndicatorStyle({
        width: activeButton.offsetWidth,
        transform: `translateX(${activeButton.offsetLeft}px)`,
        opacity: 1,
      })
    }

    syncIndicator()
    const resizeObserver = new ResizeObserver(syncIndicator)
    resizeObserver.observe(root)
    window.addEventListener('resize', syncIndicator)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncIndicator)
    }
  }, [activeDay, sortedDays, className])

  return (
    <div className={`day-tabs ${className}`} ref={tabsRef}>
      <span className="day-tab-indicator" style={indicatorStyle} aria-hidden="true" />
      {sortedDays.map((candidate) => (
        <button
          key={candidate.dayIndex}
          type="button"
          className={`day-tab-button ${candidate.dayIndex === activeDay ? 'active' : ''}`}
          onClick={() => onChange(candidate.dayIndex)}
        >
          <span>{getDayLabel(candidate)}</span>
          <small>{formatTabDate(candidate)}</small>
        </button>
      ))}
    </div>
  )
}

function ScheduleFloatingActions({
  hidden,
  disabled,
  onAdd,
}: {
  hidden: boolean
  disabled: boolean
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const activeOpen = open && !hidden

  const handlePrimaryClick = () => {
    if (activeOpen) {
      onAdd()
      setOpen(false)
      return
    }
    setOpen(true)
  }
  const openExternalApp = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }
  const openChatGpt = () => {
    setOpen(false)
    if (isAndroidDevice()) {
      window.location.href = CHATGPT_ANDROID_INTENT_URL
      return
    }
    openExternalApp(CHATGPT_APP_URL)
  }

  return (
    <>
      {activeOpen && (
        <button
          className="schedule-floating-backdrop"
          type="button"
          aria-label="빠른 실행 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <div className={`schedule-floating-actions ${hidden ? 'is-hidden' : ''} ${activeOpen ? 'is-open' : ''}`}>
        <div className="schedule-floating-menu" aria-hidden={!activeOpen}>
          <button className="schedule-floating-option" type="button" aria-label="ChatGPT" disabled={disabled} tabIndex={activeOpen ? 0 : -1} onClick={openChatGpt}>
            <img className="brand-mark chatgpt-mark" src={chatGptActionIcon} alt="" aria-hidden="true" />
          </button>
          <button className="schedule-floating-option" type="button" aria-label="Google Maps" disabled={disabled} tabIndex={activeOpen ? 0 : -1} onClick={() => openExternalApp(GOOGLE_MAPS_APP_URL)}>
            <img className="brand-mark google-maps-mark" src={googleMapsActionIcon} alt="" aria-hidden="true" />
          </button>
        </div>
        <button
          className="schedule-floating-main"
          type="button"
          disabled={disabled}
          onClick={handlePrimaryClick}
          aria-label={activeOpen ? '일정 추가' : '빠른 실행'}
          aria-expanded={activeOpen}
        >
          {activeOpen ? <Plus size={26} strokeWidth={2.5} /> : <MoreHorizontal size={26} strokeWidth={2.5} />}
        </button>
      </div>
    </>
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
  onAdd,
  onSave,
  onDelete,
  onToggleConfirmed,
  syncState,
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
  onAdd: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
  onToggleConfirmed: (id: string, confirmed: boolean) => void
  syncState: SyncState
}) {
  const dayItems = useMemo(
    () => sortItineraryItems(items.filter((item) => item.dayIndex === activeDay)),
    [activeDay, items],
  )
  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.dayIndex - b.dayIndex),
    [days],
  )
  const dayBudget = dayItems.reduce((sum, item) => sum + item.budgetJpy, 0)
  const activeDayIndex = sortedDays.findIndex((day) => day.dayIndex === activeDay)
  const mobileLayout = useMobileLayout()
  const mobileStickyRef = useRef<HTMLDivElement>(null)
  const daySwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const daySwipeAxisRef = useRef<'horizontal' | 'vertical' | null>(null)
  const [dayDragOffset, setDayDragOffset] = useState(0)
  const [isDayDragging, setIsDayDragging] = useState(false)
  const [mobileDetailTop, setMobileDetailTop] = useState<number | null>(null)
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

  const changeDay = useCallback((dayIndex: number) => {
    setSelectedItem(null)
    setActiveDay(dayIndex)
  }, [setActiveDay, setSelectedItem])

  const goToAdjacentDay = useCallback((direction: -1 | 1) => {
    const currentIndex = sortedDays.findIndex((day) => day.dayIndex === activeDay)
    const nextDay = sortedDays[currentIndex + direction]
    if (nextDay) changeDay(nextDay.dayIndex)
  }, [activeDay, changeDay, sortedDays])

  const resetDaySwipe = () => {
    daySwipeStartRef.current = null
    daySwipeAxisRef.current = null
    setIsDayDragging(false)
    setDayDragOffset(0)
  }

  const handleDaySwipeStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (selectedItem || event.touches.length !== 1 || isDaySwipeBlocked(event.target)) {
      resetDaySwipe()
      return
    }
    const touch = event.touches[0]
    daySwipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    daySwipeAxisRef.current = null
    setIsDayDragging(false)
    setDayDragOffset(0)
  }

  const handleDaySwipeMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = daySwipeStartRef.current
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (daySwipeAxisRef.current === null) {
      if (Math.abs(deltaX) < DAY_SWIPE_AXIS_LOCK && Math.abs(deltaY) < DAY_SWIPE_AXIS_LOCK) return
      daySwipeAxisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }
    if (daySwipeAxisRef.current !== 'horizontal') return
    setIsDayDragging(true)
    setDayDragOffset(clampDayDrag(deltaX, activeDayIndex, sortedDays.length))
  }

  const handleDaySwipeEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = daySwipeStartRef.current
    if (!start || daySwipeAxisRef.current !== 'horizontal') {
      resetDaySwipe()
      return
    }
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    daySwipeStartRef.current = null
    daySwipeAxisRef.current = null
    setIsDayDragging(false)
    setDayDragOffset(0)
    if (Math.abs(deltaX) < DAY_SWIPE_THRESHOLD) return
    if (deltaX < 0) goToAdjacentDay(1)
    else goToAdjacentDay(-1)
  }

  const daySwipeHandlers = mobileLayout ? {
    onTouchStart: handleDaySwipeStart,
    onTouchMove: handleDaySwipeMove,
    onTouchEnd: handleDaySwipeEnd,
    onTouchCancel: resetDaySwipe,
  } : {}

  const dayTrackStyle: CSSProperties = {
    transform: `translateX(calc(-${Math.max(activeDayIndex, 0) * 100}% + ${dayDragOffset}px))`,
  }

  const renderItineraryRow = (item: ItineraryItem) => (
    <div
      key={item.id}
      className={`table-row ${categoryToneClasses[item.category]} ${selectedItem?.id === item.id ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => setSelectedItem(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setSelectedItem(item)
      }}
    >
      <span className="mobile-time-stack">
        <span>{item.startTime || '--:--'}</span>
        <span className="time-divider">~</span>
        <span>{item.endTime || '--:--'}</span>
        {formatDuration(item) ? (
          <span className="mobile-duration">{formatDuration(item)}</span>
        ) : null}
      </span>
      <span className="mobile-card-content">
        <button
          type="button"
          className="icon-button maps-open-button mobile-card-maps-button"
          aria-label="Maps에서 열기"
          title="Maps에서 열기"
          disabled={!getItineraryMapsTargetUrl(item)}
          onClick={(event) => {
            event.stopPropagation()
            const mapsTargetUrl = getItineraryMapsTargetUrl(item)
            if (!mapsTargetUrl) return
            window.open(mapsTargetUrl, '_blank', 'noopener,noreferrer')
          }}
        >
          <ArrowUpRight size={15} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <span className="mobile-card-head">
          <CategoryBadge category={item.category} />
          <span className="mobile-card-place">{formatPlace(item.place || '장소 미정')}</span>
        </span>
        <span className="mobile-card-footer">
          <span className="mobile-card-title">{item.title}</span>
          {item.budgetJpy > 0 ? (
            <span className="mobile-card-budget">{formatJpy(item.budgetJpy)}</span>
          ) : null}
          <button
            type="button"
            className={`mobile-card-confirm-button ${item.confirmed ? 'active' : ''}`}
            aria-label={item.confirmed ? '일정 확정 해제' : '일정 확정'}
            aria-pressed={item.confirmed}
            title={item.confirmed ? '확정 해제' : '일정 확정'}
            disabled={readonly}
            onClick={(event) => {
              event.stopPropagation()
              onToggleConfirmed(item.id, !item.confirmed)
            }}
          >
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
            <span>확정</span>
          </button>
        </span>
      </span>
      <span className="schedule-time">{makeTimeRange(item)}</span>
      <span className="schedule-place">{formatPlace(item.place || '장소 미정')}</span>
      <span className="schedule-category"><CategoryBadge category={item.category} /></span>
      <span className="schedule-title-cell">{item.title}</span>
      <span className="schedule-note">{item.note || '-'}</span>
      <span className="schedule-budget">{formatBudget(item.budgetJpy, showKrw, exchangeRate)}</span>
    </div>
  )

  const getEmptyScheduleText = (dayIndex: number) => {
    const day = sortedDays.find((candidate) => candidate.dayIndex === dayIndex)
    return day && isBackupDay(day)
      ? '후보 일정이 비어 있습니다.'
      : '이 날짜의 일정표가 비어 있습니다.'
  }

  const renderMobileDayPanel = (dayIndex: number) => {
    const panelItems = sortItineraryItems(items.filter((item) => item.dayIndex === dayIndex))
    const panelBudget = panelItems.reduce((sum, item) => sum + item.budgetJpy, 0)

    return (
      <div key={dayIndex} className="day-itinerary-panel">
        <div className="itinerary-table mobile-itinerary-table">
          {panelItems.length ? panelItems.map(renderItineraryRow) : (
            <EmptyState text={getEmptyScheduleText(dayIndex)} />
          )}
          <div className="table-total-row">
            <span>합계</span>
            <strong>{formatBudget(panelBudget, showKrw, exchangeRate)}</strong>
          </div>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!mobileLayout) return
    mobileStickyRef.current?.closest('.workspace')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeDay, mobileLayout])

  const dayTabs = (className = '') => (
    <DayTabs
      sortedDays={sortedDays}
      activeDay={activeDay}
      onChange={changeDay}
      className={className}
    />
  )

  useLayoutEffect(() => {
    const sticky = mobileStickyRef.current
    if (!sticky || !selectedItem) {
      setMobileDetailTop(null)
      return
    }

    const syncMobileDetailTop = () => {
      setMobileDetailTop(sticky.getBoundingClientRect().bottom)
    }

    syncMobileDetailTop()
    const resizeObserver = new ResizeObserver(syncMobileDetailTop)
    resizeObserver.observe(sticky)
    window.addEventListener('resize', syncMobileDetailTop)

    const scrollRoot = sticky.closest('.workspace')
    scrollRoot?.addEventListener('scroll', syncMobileDetailTop, { passive: true })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncMobileDetailTop)
      scrollRoot?.removeEventListener('scroll', syncMobileDetailTop)
    }
  }, [selectedItem])

  const mobileDetailOverlayStyle = mobileDetailTop === null
    ? undefined
    : ({
        '--mobile-detail-top': `${mobileDetailTop}px`,
      } as CSSProperties)

  const detailPanelProps = {
    item: selectedItem,
    dayItems,
    days,
    readonly,
    exchangeRate,
    onClose: () => setSelectedItem(null),
    onSave,
    onDelete,
  }

  return (
    <section className="schedule-screen">
      <div className="mobile-schedule-sticky" ref={mobileStickyRef}>
        <header className="schedule-header">
          <div className="schedule-title">
            <h1>{tripTitle}</h1>
            <AccountStatus syncState={syncState} showLogout={false} />
          </div>
        </header>
        {dayTabs('mobile-day-tabs')}
      </div>

      {mobileLayout && selectedItem && (
        <div
          className="mobile-detail-overlay"
          role="presentation"
          style={mobileDetailOverlayStyle}
          onClick={() => setSelectedItem(null)}
        >
          <DetailPanel
            key={`mobile-${selectedItem.id}`}
            {...detailPanelProps}
            variant="mobile"
          />
        </div>
      )}

      <header className="schedule-header">
        <div className="schedule-title">
          <h1>{tripTitle}</h1>
          <AccountStatus syncState={syncState} showLogout={false} />
        </div>
      </header>

      <ScheduleFloatingActions hidden={Boolean(selectedItem)} disabled={readonly} onAdd={onAdd} />

      <div className="schedule-layout">
        <div className="schedule-main">
          {dayTabs('desktop-day-tabs')}
          {mobileLayout ? (
            <div
              className={`day-itinerary-viewport ${isDayDragging ? 'is-day-dragging' : ''}`}
              {...daySwipeHandlers}
            >
              <div className="day-itinerary-track" style={dayTrackStyle}>
                {sortedDays.map((day) => renderMobileDayPanel(day.dayIndex))}
              </div>
            </div>
          ) : (
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
            {dayItems.length ? dayItems.map(renderItineraryRow) : <EmptyState text={getEmptyScheduleText(activeDay)} />}
            <div className="table-total-row">
              <span>합계</span>
              <strong>{formatBudget(dayBudget, showKrw, exchangeRate)}</strong>
            </div>
          </div>
          )}
        </div>
        {!mobileLayout && (
          <DetailPanel key={selectedItem?.id ?? 'empty'} {...detailPanelProps} variant="desktop" />
        )}
      </div>
    </section>
  )
}

function isDetailPanelDragBlocked(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.detail-actions, button, input, select, textarea, label, .search-control, .category-badge-strip'))
}

function isDaySwipeBlocked(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('.day-tabs, .schedule-floating-actions, .mobile-detail-overlay, .detail-panel, .mobile-card-maps-button, .mobile-card-confirm-button, input, textarea, select, .column-resizer, .places-suggestion-list'),
  )
}

function DetailPanel({
  item,
  dayItems,
  days,
  readonly,
  exchangeRate,
  onClose,
  onSave,
  onDelete,
  variant = 'desktop',
}: {
  item: ItineraryItem | null
  dayItems: ItineraryItem[]
  days: TripDay[]
  readonly: boolean
  exchangeRate: number
  onClose: () => void
  onSave: (item: ItineraryItem) => void
  onDelete: (id: string) => void
  variant?: 'desktop' | 'mobile'
}) {
  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.dayIndex - b.dayIndex),
    [days],
  )
  const [draft, setDraft] = useState<ItineraryItem | null>(item)
  const [linkedPlaceLabel, setLinkedPlaceLabel] = useState(() => (item ? inferLinkedPlaceLabel(item) : ''))
  const [aiCommand, setAiCommand] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [saveError, setSaveError] = useState('')
  const dragStartY = useRef<number | null>(null)
  const pointerStartY = useRef<number | null>(null)
  const dragOffsetRef = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)
  const mobilePanel = variant === 'mobile'

  const updateDragOffset = (value: number) => {
    dragOffsetRef.current = value
    setDragOffset(value)
  }

  const startDetailDrag = (event: ReactTouchEvent<HTMLElement>) => {
    if (!mobilePanel || isDetailPanelDragBlocked(event.target)) return
    dragStartY.current = event.touches[0]?.clientY ?? null
    updateDragOffset(0)
  }

  const moveDetailDrag = (event: ReactTouchEvent<HTMLElement>) => {
    if (!mobilePanel || dragStartY.current === null) return
    const nextY = event.touches[0]?.clientY
    if (nextY === undefined) return
    const distance = nextY - dragStartY.current
    updateDragOffset(distance > 0 ? Math.min(distance, 140) : 0)
  }

  const endDetailDrag = () => {
    if (!mobilePanel) return
    const shouldClose = dragOffsetRef.current > 72
    dragStartY.current = null
    pointerStartY.current = null
    updateDragOffset(0)
    if (shouldClose) onClose()
  }

  const startPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!mobilePanel || isDetailPanelDragBlocked(event.target)) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointerStartY.current = event.clientY
    updateDragOffset(0)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const movePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!mobilePanel || pointerStartY.current === null) return
    const distance = event.clientY - pointerStartY.current
    updateDragOffset(distance > 0 ? Math.min(distance, 140) : 0)
  }

  const panelClassName = [
    'detail-panel',
    mobilePanel ? 'mobile-detail-panel' : 'desktop-detail-panel',
    dragOffset > 0 ? 'dragging' : '',
  ].filter(Boolean).join(' ')
  const panelStyle = mobilePanel ? { '--detail-drag-offset': `${dragOffset}px` } as CSSProperties : undefined

  if (!draft) {
    return (
      <aside className={`${panelClassName} empty`}>
        <MapPin size={22} />
        <h3>일정을 선택하세요</h3>
        <p>PC에서는 여기서 빠르게 수정하고, 모바일에서는 바텀시트처럼 표시됩니다.</p>
      </aside>
    )
  }

  const update = (patch: Partial<ItineraryItem>) => {
    setSaveError('')
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }
  const updateDay = (dayIndex: number) => {
    const nextDay = sortedDays.find((day) => day.dayIndex === dayIndex)
    if (!nextDay) return
    update({ dayIndex: nextDay.dayIndex, date: nextDay.date })
  }
  const applyGooglePlaceSelection = (selection: GooglePlaceSelection) => {
    const query = [selection.name, selection.address].filter(Boolean).join(' ')
    const nextPlace = selection.name || selection.address || draft.place
    setLinkedPlaceLabel(selection.name || nextPlace)
    update({
      place: nextPlace,
      googlePlaceQuery: query || draft.googlePlaceQuery,
      googlePlaceId: selection.placeId,
      googleMapsUri: selection.googleMapsUri,
      formattedAddress: selection.address,
      lat: selection.lat,
      lng: selection.lng,
    })
  }
  const updatePlaceDisplay = (value: string) => {
    if (!(draft.googlePlaceId ?? '').trim()) {
      update({ place: value, googlePlaceQuery: value })
      return
    }
    update({ place: value })
  }
  const showLinkedPlaceHint = Boolean(
    (draft.googlePlaceId ?? '').trim()
    && draft.place.trim()
    && linkedPlaceLabel.trim()
    && draft.place.trim() !== linkedPlaceLabel.trim(),
  )
  const saveDraft = () => {
    const validation = validateItineraryDraft(draft)
    if (!validation.ok) {
      setSaveError(validation.message)
      return
    }

    setSaveError('')
    onSave({
      ...draft,
      startTime: validation.startTime,
      endTime: validation.endTime,
      googlePlaceQuery: (draft.googlePlaceId ?? '').trim()
        ? draft.googlePlaceQuery
        : (draft.googlePlaceQuery.trim() || draft.place.trim()),
    })
  }
  const mapsTargetUrl = getItineraryMapsTargetUrl(draft)
  const openGoogleMapsSearch = () => {
    if (!mapsTargetUrl) return
    window.open(mapsTargetUrl, '_blank', 'noopener,noreferrer')
  }

  const fillWithAi = async (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanCommand = aiCommand.trim()
    if (!cleanCommand || !draft || aiLoading) return

    setAiLoading(true)
    setAiError('')
    try {
      const patch = await fillItineraryWithAi(cleanCommand, draft, dayItems)
      update(patch)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI로 내용을 채우지 못했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <aside
      className={panelClassName}
      style={panelStyle}
      onClick={(event) => {
        if (mobilePanel) event.stopPropagation()
      }}
      onTouchStart={startDetailDrag}
      onTouchMove={moveDetailDrag}
      onTouchEnd={endDetailDrag}
      onTouchCancel={endDetailDrag}
      onPointerDown={startPointerDrag}
      onPointerMove={movePointerDrag}
      onPointerUp={endDetailDrag}
      onPointerCancel={endDetailDrag}
    >
      <div className="panel-header">
        <h3>일정 편집</h3>
        {!mobilePanel && (
          <button className="icon-button plain" onClick={onClose} aria-label="편집 패널 닫기">
            <X size={18} />
          </button>
        )}
      </div>
      <form className="ai-fill-form" onSubmit={fillWithAi}>
        <label className="ai-fill-label">
          <span>AI 입력</span>
          <div className="ai-fill-row">
            <div className="ai-fill-control">
              <Sparkles size={15} />
              <input
                value={aiCommand}
                disabled={readonly || aiLoading}
                placeholder="예: 18:30 신세카이 스시 저녁, 예산 5000엔"
                onChange={(event) => setAiCommand(event.target.value)}
              />
            </div>
            <button className="ghost-button ai-fill-button" type="submit" aria-label="AI로 채우기" title="AI로 채우기" disabled={readonly || aiLoading || !aiCommand.trim()}>
              <PencilLine size={18} />
            </button>
          </div>
        </label>
        {aiError && <p className="ai-fill-error">{aiError}</p>}
      </form>
      <div className="detail-field detail-day-field">
        <span className="detail-field-label">날짜</span>
        <div className="detail-day-strip" role="radiogroup" aria-label="날짜">
          {sortedDays.map((day) => (
            <button
              key={day.dayIndex}
              type="button"
              className={`detail-day-button ${draft.dayIndex === day.dayIndex ? 'selected' : ''}`}
              role="radio"
              aria-checked={draft.dayIndex === day.dayIndex}
              aria-label={getDayAriaLabel(day)}
              disabled={readonly}
              onClick={() => updateDay(day.dayIndex)}
            >
              {getDayLabel(day)}
            </button>
          ))}
        </div>
      </div>
      <div className="detail-field detail-time-field">
        <span className="detail-field-label">시간</span>
        <div className="detail-time-inputs">
          <input aria-label="시작 시간" value={draft.startTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="09:00" disabled={readonly} onChange={(event) => update({ startTime: formatTimeInput(event.target.value, draft.startTime) })} />
          <span className="detail-time-separator">~</span>
          <input aria-label="종료 시간" value={draft.endTime} inputMode="numeric" pattern="[0-9]{2}:[0-9]{2}" maxLength={5} placeholder="10:00" disabled={readonly} onChange={(event) => update({ endTime: formatTimeInput(event.target.value, draft.endTime) })} />
        </div>
      </div>
      <div className="detail-place-section">
        {isGooglePlacesConfigured && (
          <label className="detail-field">
            <span className="detail-field-label">장소 찾기</span>
            <GooglePlacesAutocomplete
              key={draft.id}
              seedQuery={getPlaceSearchSeed(draft)}
              disabled={readonly}
              onSelect={applyGooglePlaceSelection}
            />
          </label>
        )}
        <label className="detail-field">
          <span className="detail-field-label">일정표 표시명</span>
          <span className="detail-place-inline">
            <input
              value={draft.place}
              disabled={readonly}
              placeholder="일정표에 보이는 이름"
              onChange={(event) => updatePlaceDisplay(event.target.value)}
            />
            <button
              className="icon-button maps-open-button"
              type="button"
              aria-label="Maps에서 열기"
              title="Maps에서 열기"
              disabled={!mapsTargetUrl}
              onClick={openGoogleMapsSearch}
            >
              <ArrowUpRight size={15} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        </label>
        {showLinkedPlaceHint && (
          <p className="place-link-hint">표시명만 바뀌었습니다. 지도는 선택한 장소로 열립니다.</p>
        )}
        {draft.formattedAddress && (
          <p className="place-address-preview">{draft.formattedAddress}</p>
        )}
      </div>
      <div className="detail-field detail-category-field">
        <span className="detail-field-label">구분</span>
        <div className="category-badge-strip" role="radiogroup" aria-label="구분">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`category-badge-button ${draft.category === category ? 'selected' : ''}`}
              aria-pressed={draft.category === category}
              disabled={readonly}
              onClick={() => update({ category })}
            >
              <CategoryBadge category={category} />
            </button>
          ))}
        </div>
      </div>
      <label className="detail-field">
        <span className="detail-field-label">내용</span>
        <input value={draft.title} disabled={readonly} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <label className="detail-field">
        <span className="detail-field-label">비고</span>
        <input value={draft.note} disabled={readonly} onChange={(event) => update({ note: event.target.value })} />
      </label>
      <label className="detail-field detail-budget-field">
        <span className="detail-field-label">예산 JPY</span>
        <span className="detail-budget-inline">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft.budgetJpy}
            disabled={readonly}
            onChange={(event) => update({ budgetJpy: Number(event.target.value.replace(/\D/g, '') || 0) })}
          />
          <span className="krw-preview">≈ {formatKrw(draft.budgetJpy, exchangeRate)}</span>
        </span>
      </label>
      {saveError && <p className="detail-save-error">{saveError}</p>}
      <div className="detail-actions">
        <button className="ghost-button danger" disabled={readonly} onClick={() => onDelete(draft.id)}>
          <Trash2 size={16} />
          삭제
        </button>
        <button className="ghost-button" onClick={onClose}>취소</button>
        <button className="primary-button" disabled={readonly} onClick={saveDraft}>저장</button>
      </div>
    </aside>
  )
}

function GooglePlacesAutocomplete({
  disabled,
  onSelect,
  seedQuery = '',
}: {
  disabled: boolean
  onSelect: (selection: GooglePlaceSelection) => void
  seedQuery?: string
}) {
  const shellRef = useRef<HTMLSpanElement | null>(null)
  const sessionTokenRef = useRef<object | null>(null)
  const requestIdRef = useRef(0)
  const onSelectRef = useRef(onSelect)
  const searchEnabledRef = useRef(false)
  const [query, setQuery] = useState(seedQuery)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    let disposed = false

    const preparePlaces = async () => {
      try {
        sessionTokenRef.current = await createAutocompleteSessionToken()
        if (!disposed) setStatus('ready')
      } catch {
        if (!disposed) setStatus('error')
      }
    }

    void preparePlaces()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || disabled || !query.trim() || !searchEnabledRef.current) {
      return
    }

    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = await createAutocompleteSessionToken()
        }
        const nextSuggestions = await fetchPlaceSuggestions(query, sessionTokenRef.current)
        if (requestId !== requestIdRef.current) return
        setSuggestions(nextSuggestions)
        setOpen(nextSuggestions.length > 0)
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        setSuggestions([])
        setSearchError(error instanceof Error ? error.message : '검색에 실패했습니다.')
      } finally {
        if (requestId === requestIdRef.current) setSearching(false)
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [disabled, query, status])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setSearching(true)
    setSearchError('')
    try {
      const selection = await resolvePlaceFromPrediction(suggestion.placePrediction)
      setQuery(selection.name || selection.address)
      setSuggestions([])
      setOpen(false)
      sessionTokenRef.current = await createAutocompleteSessionToken()
      onSelectRef.current(selection)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '장소를 선택하지 못했습니다.')
    } finally {
      setSearching(false)
    }
  }

  if (status !== 'ready') {
    return (
      <span className="places-autocomplete-shell">
        <span className={`places-autocomplete-status ${status === 'error' ? 'error' : ''}`}>
          {status === 'error' ? 'Places 연결 실패' : 'Places 준비 중'}
        </span>
      </span>
    )
  }

  return (
    <span className="places-autocomplete-shell" ref={shellRef}>
      <span className="search-control places-autocomplete-input">
        <Search size={15} />
        <input
          value={query}
          disabled={disabled}
          placeholder="장소 이름으로 검색"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          onChange={(event) => {
            searchEnabledRef.current = true
            const nextQuery = event.target.value
            setQuery(nextQuery)
            setOpen(Boolean(nextQuery.trim()))
            if (!nextQuery.trim()) {
              setSuggestions([])
              setSearchError('')
              setSearching(false)
              searchEnabledRef.current = false
              requestIdRef.current += 1
            }
          }}
          onFocus={() => {
            if (searchEnabledRef.current && suggestions.length) setOpen(true)
          }}
        />
      </span>
      {searching && <span className="places-autocomplete-status">검색 중...</span>}
      {searchError && <span className="places-autocomplete-status error">{searchError}</span>}
      {open && suggestions.length > 0 && (
        <ul className="places-suggestion-list" role="listbox" aria-label="장소 검색 결과">
          {suggestions.map((suggestion) => (
            <li key={suggestion.key}>
              <button
                type="button"
                role="option"
                disabled={disabled || searching}
                onClick={() => void handleSelect(suggestion)}
              >
                <MapPin size={14} />
                <span className="places-suggestion-copy">
                  <strong>{suggestion.mainText}</strong>
                  {suggestion.secondaryText && <small>{suggestion.secondaryText}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
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
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ChecklistItem | null>(null)
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

  const requestDelete = (item: ChecklistItem) => {
    setPendingDeleteItem(item)
  }

  const cancelDelete = () => {
    setPendingDeleteItem(null)
  }

  const confirmDelete = () => {
    if (!pendingDeleteItem) return
    if (editingId === pendingDeleteItem.id) cancelEditing()
    onDelete(pendingDeleteItem.id)
    setPendingDeleteItem(null)
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
    <>
      {pendingDeleteItem && (
        <div className="confirm-overlay" role="presentation" onClick={cancelDelete}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-delete-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="checklist-delete-confirm-title">체크리스트 항목을 삭제할까요?</h2>
            <p>“{pendingDeleteItem.title}” 항목은 삭제 후 되돌릴 수 없습니다.</p>
            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={cancelDelete}>취소</button>
              <button className="primary-button danger-confirm" type="button" onClick={confirmDelete}>삭제</button>
            </div>
          </section>
        </div>
      )}
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
                        disabled={readonly || isPreview || isEditing}
                        aria-label={`${item.title} 구분자 삭제`}
                        title="구분자 삭제"
                        onClick={() => requestDelete(item)}
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
                  {!isDivider && (
                    <div className="check-actions">
                      {item.done && (
                        <button
                          type="button"
                          className="check-delete completed-task-delete"
                          disabled={readonly || isPreview || isEditing}
                          aria-label={`${item.title} 삭제`}
                          title="완료 항목 삭제"
                          onClick={() => requestDelete(item)}
                        >
                          <Trash2 size={15} />
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
    </>
  )
}

const formatMemoTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function MemoView({
  memos,
  tripId,
  onSave,
  onDelete,
  readonly,
  onMobileEditorChange,
}: {
  memos: Memo[]
  tripId: string
  onSave: (memo: Memo) => Memo
  onDelete: (id: string) => void
  readonly: boolean
  onMobileEditorChange: (open: boolean) => void
}) {
  const mobileLayout = useMobileLayout()
  const sortedMemos = useMemo(
    () => [...memos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [memos],
  )
  const [draft, setDraft] = useState<Memo | null>(() => sortedMemos[0] ? { ...sortedMemos[0] } : null)
  const [dirty, setDirty] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Memo | null>(null)
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const draftExists = Boolean(draft && memos.some((memo) => memo.id === draft.id))

  const saveDraft = useCallback(() => {
    if (!draft || readonly || (!draftExists && !draft.title.trim() && !draft.content.trim())) return
    const saved = onSave(draft)
    setDraft(saved)
    setDirty(false)
  }, [draft, draftExists, onSave, readonly])

  useEffect(() => {
    if (!dirty || !draft || readonly) return
    const saveTimer = window.setTimeout(saveDraft, 800)
    return () => window.clearTimeout(saveTimer)
  }, [dirty, draft, readonly, saveDraft])

  useEffect(() => {
    const editorOpen = mobileLayout && mobileEditorOpen
    onMobileEditorChange(editorOpen)
    if (!mobileLayout) {
      setMobileEditorOpen(false)
      setMobileMoreOpen(false)
    }
    return () => onMobileEditorChange(false)
  }, [mobileEditorOpen, mobileLayout, onMobileEditorChange])

  const startNewMemo = () => {
    if (dirty) saveDraft()
    const now = new Date().toISOString()
    setDraft({
      id: crypto.randomUUID(),
      tripId,
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
    })
    setDirty(false)
    if (mobileLayout) setMobileEditorOpen(true)
  }

  const selectMemo = (memo: Memo) => {
    if (draft?.id === memo.id) {
      if (mobileLayout) setMobileEditorOpen(true)
      return
    }
    if (dirty) saveDraft()
    setDraft({ ...memo })
    setDirty(false)
    if (mobileLayout) setMobileEditorOpen(true)
  }

  const updateDraft = (patch: Partial<Pick<Memo, 'title' | 'content'>>) => {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setDirty(true)
  }

  const confirmDeleteMemo = () => {
    if (!pendingDelete) return
    const deleteId = pendingDelete.id
    const nextMemo = sortedMemos.find((memo) => memo.id !== deleteId)
    onDelete(deleteId)
    if (draft?.id === deleteId) {
      setDraft(nextMemo ? { ...nextMemo } : null)
      setDirty(false)
    }
    setPendingDelete(null)
    setMobileMoreOpen(false)
    if (mobileLayout) setMobileEditorOpen(false)
  }

  const closeMobileEditor = () => {
    if (dirty) saveDraft()
    setMobileMoreOpen(false)
    setMobileEditorOpen(false)
  }

  return (
    <>
      {pendingDelete && (
        <div className="confirm-overlay" role="presentation" onClick={() => setPendingDelete(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-delete-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="memo-delete-confirm-title">메모를 삭제할까요?</h2>
            <p>“{pendingDelete.title || '제목 없는 메모'}” 메모는 삭제 후 되돌릴 수 없습니다.</p>
            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setPendingDelete(null)}>취소</button>
              <button className="primary-button danger-confirm" type="button" onClick={confirmDeleteMemo}>삭제</button>
            </div>
          </section>
        </div>
      )}
      <section className={`memo-screen ${mobileLayout ? (mobileEditorOpen ? 'mobile-editor-open' : 'mobile-list-open') : ''}`}>
        <aside className="panel memo-list-panel">
          <div className="panel-header">
            <h3>메모</h3>
            <button
              className="round-add-button"
              type="button"
              disabled={readonly}
              aria-label="새 메모"
              onClick={startNewMemo}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="memo-list">
            {sortedMemos.map((memo) => (
              <button
                key={memo.id}
                type="button"
                className={draft?.id === memo.id ? 'active' : ''}
                onClick={() => selectMemo(memo)}
              >
                <strong>{memo.title || '제목 없는 메모'}</strong>
                <span>{memo.content.trim() || '내용 없음'}</span>
                <time>{formatMemoTimestamp(memo.updatedAt)}</time>
              </button>
            ))}
            {!sortedMemos.length && (
              <div className="memo-list-empty">새 메모를 만들어 여행 정보를 기록해보세요.</div>
            )}
          </div>
        </aside>

        <article className="panel memo-editor-panel">
          {draft ? (
            <>
              <header className="memo-mobile-editor-header">
                <button
                  className="memo-mobile-icon-button"
                  type="button"
                  aria-label="메모 목록으로 돌아가기"
                  onClick={closeMobileEditor}
                >
                  <ArrowLeft size={21} />
                </button>
                <div className="memo-mobile-editor-heading">
                  <strong>메모 편집</strong>
                  <span role="status" aria-live="polite">{dirty ? '자동 저장 중…' : '저장됨'}</span>
                </div>
                <div className="memo-mobile-more">
                  <button
                    className="memo-mobile-icon-button"
                    type="button"
                    aria-label="메모 메뉴"
                    aria-expanded={mobileMoreOpen}
                    onClick={() => setMobileMoreOpen((open) => !open)}
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  {mobileMoreOpen && (
                    <div className="memo-mobile-more-menu">
                      <button
                        type="button"
                        disabled={readonly || !draftExists}
                        onClick={() => {
                          setMobileMoreOpen(false)
                          setPendingDelete(draft)
                        }}
                      >
                        <Trash2 size={16} />
                        메모 삭제
                      </button>
                    </div>
                  )}
                </div>
              </header>
              <input
                className="memo-title-input"
                value={draft.title}
                placeholder="메모 제목"
                disabled={readonly}
                aria-label="메모 제목"
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
              <textarea
                className="memo-content-input"
                value={draft.content}
                placeholder="여행 중 기억할 내용, 주소, 쇼핑 목록 등을 자유롭게 적어보세요."
                disabled={readonly}
                aria-label="메모 내용"
                onChange={(event) => updateDraft({ content: event.target.value })}
              />
              <div className="memo-editor-footer">
                <span role="status">{dirty ? '자동 저장 중…' : '저장됨'}</span>
                <div className="memo-editor-actions">
                  {draftExists && (
                    <button
                      className="ghost-button danger"
                      type="button"
                      disabled={readonly}
                      onClick={() => setPendingDelete(draft)}
                    >
                      <Trash2 size={15} />
                      삭제
                    </button>
                  )}
                  <button
                    className="primary-button"
                    type="button"
                    disabled={readonly || (!draftExists && !draft.title.trim() && !draft.content.trim())}
                    onClick={saveDraft}
                  >
                    저장
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="memo-editor-empty">
              <NotebookPen size={28} />
              <strong>메모가 없습니다</strong>
              <span>새 메모 버튼을 눌러 기록을 시작하세요.</span>
              <button className="primary-button" type="button" disabled={readonly} onClick={startNewMemo}>
                새 메모
              </button>
            </div>
          )}
        </article>
      </section>
    </>
  )
}

function SettingsView({
  exchangeRate,
  showKrw,
  setShowKrw,
  onExchangeRate,
  syncState,
  onLogout,
}: {
  exchangeRate: number
  showKrw: boolean
  setShowKrw: (value: boolean) => void
  onExchangeRate: (value: number) => void
  syncState: SyncState
  onLogout: () => void
}) {
  const userLabel = syncState.user?.name || syncState.user?.email || '로그인 계정'

  return (
    <section className="settings-grid">
      <article className="panel">
        <div className="panel-header">
          <h3>계정</h3>
        </div>
        <div className="settings-account-row">
          <AccountStatus syncState={syncState} showLogout={false} />
          <div className="settings-account-copy">
            <strong>{userLabel}</strong>
            {syncState.user?.email && syncState.user.name && (
              <span className="settings-line">{syncState.user.email}</span>
            )}
          </div>
        </div>
        {syncState.configured && (
          <button className="logout-chip settings-logout-button" type="button" onClick={onLogout}>
            <LogOut size={16} />
            로그아웃
          </button>
        )}
      </article>
      <article className="panel">
        <div className="panel-header">
          <h3>예산 표시</h3>
        </div>
        <div className="settings-budget-row">
          <span>표시 통화</span>
          <div className="currency-switch" aria-label="예산 통화">
            <button className="active currency-current" onClick={() => setShowKrw(!showKrw)}>
              {showKrw ? 'KRW' : 'JPY'}
            </button>
            <button className="swap-button" aria-label="통화 전환" onClick={() => setShowKrw(!showKrw)}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <label>JPY → KRW 환율<input type="number" step="0.1" value={exchangeRate} onChange={(event) => onExchangeRate(Number(event.target.value))} /></label>
      </article>
      <article className="panel">
        <div className="panel-header">
          <h3>동기화</h3>
        </div>
        <p className="settings-line">Supabase 설정: <strong>{syncState.configured ? '완료' : '없음'}</strong></p>
        <p className="settings-line">로그인 상태: <strong>{syncState.authenticated ? '활성' : '비활성'}</strong></p>
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
    setItineraryItemConfirmed,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    reorderChecklistItems,
    upsertMemo,
    deleteMemo,
  } = useTravelData()

  const [activeView, setActiveView] = useState<View>(getViewFromHash)
  const [activeDay, setActiveDay] = useState(getActiveTripDay(data.days).dayIndex)
  const [selectedItem, setSelectedItem] = useState<ItineraryItem | null>(null)
  const [showKrw, setShowKrw] = useState(false)
  const [saveToastVisible, setSaveToastVisible] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [mobileMemoEditing, setMobileMemoEditing] = useState(false)
  const mobileDetailHistoryRef = useRef(false)
  const pendingSaveToastRef = useRef(false)
  const saveToastTimerRef = useRef<number | null>(null)

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

  useEffect(() => {
    const closeDetailFromHistory = () => {
      if (!mobileDetailHistoryRef.current) return
      mobileDetailHistoryRef.current = false
      setSelectedItem(null)
    }

    window.addEventListener('popstate', closeDetailFromHistory)
    return () => window.removeEventListener('popstate', closeDetailFromHistory)
  }, [])

  useEffect(() => {
    if (!syncState.lastRemoteMutationAt || !pendingSaveToastRef.current) return
    pendingSaveToastRef.current = false
    setSaveToastVisible(true)
    if (saveToastTimerRef.current !== null) window.clearTimeout(saveToastTimerRef.current)
    saveToastTimerRef.current = window.setTimeout(() => {
      setSaveToastVisible(false)
      saveToastTimerRef.current = null
    }, 1600)
  }, [syncState.lastRemoteMutationAt])

  useEffect(() => () => {
    if (saveToastTimerRef.current !== null) window.clearTimeout(saveToastTimerRef.current)
  }, [])

  if (!syncState.authenticated && !syncState.loading) {
    return <AuthScreen login={login} configured={syncState.configured} />
  }

  const openScheduleDetail = (item: ItineraryItem | null) => {
    if (!item) {
      closeScheduleDetail()
      return
    }
    setSelectedItem(item)
    if (isMobileViewport() && !mobileDetailHistoryRef.current) {
      window.history.pushState({ ...(window.history.state ?? {}), osakaScheduleDetail: true }, '', window.location.href)
      mobileDetailHistoryRef.current = true
    }
  }

  const closeScheduleDetail = () => {
    setSelectedItem(null)
    if (!mobileDetailHistoryRef.current) return
    mobileDetailHistoryRef.current = false
    window.history.back()
  }

  const addItem = () => {
    const dayItems = data.itineraryItems.filter((item) => item.dayIndex === activeTripDay.dayIndex)
    openScheduleDetail({
      id: `${DRAFT_ITINERARY_ID_PREFIX}${crypto.randomUUID()}`,
      tripId: data.trip.id,
      dayIndex: activeTripDay.dayIndex,
      date: activeTripDay.date,
      startTime: '',
      endTime: '',
      place: '',
      category: '기타',
      title: '',
      note: '',
      budgetJpy: 0,
      googlePlaceQuery: '',
      googlePlaceId: '',
      googleMapsUri: '',
      formattedAddress: '',
      lat: null,
      lng: null,
      confirmed: false,
      sortOrder: dayItems.length * 10 + 10,
    })
  }

  const saveItem = (item: ItineraryItem) => {
    pendingSaveToastRef.current = true
    if (isDraftItineraryItem(item)) {
      upsertItineraryItem({
        tripId: item.tripId,
        dayIndex: item.dayIndex,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        place: item.place,
        category: item.category,
        title: item.title,
        note: item.note,
        budgetJpy: item.budgetJpy,
        googlePlaceQuery: item.googlePlaceQuery,
        googlePlaceId: item.googlePlaceId,
        googleMapsUri: item.googleMapsUri,
        formattedAddress: item.formattedAddress,
        lat: item.lat,
        lng: item.lng,
        sortOrder: item.sortOrder,
      })
    } else {
      upsertItineraryItem(item)
    }
    if (item.dayIndex !== activeDay) {
      setActiveDay(item.dayIndex)
    }
    closeScheduleDetail()
  }

  const deleteItem = (id: string) => {
    pendingSaveToastRef.current = false
    setPendingDeleteId(id)
  }

  const cancelDeleteItem = () => {
    setPendingDeleteId(null)
  }

  const confirmDeleteItem = () => {
    if (!pendingDeleteId) return
    const deleteId = pendingDeleteId
    setPendingDeleteId(null)
    pendingSaveToastRef.current = false
    if (deleteId.startsWith(DRAFT_ITINERARY_ID_PREFIX)) {
      closeScheduleDetail()
      return
    }
    deleteItineraryItem(deleteId)
    closeScheduleDetail()
  }

  return (
    <div className="app-shell">
      {saveToastVisible && (
        <div className="save-toast" role="status" aria-live="polite">
          저장되었습니다
        </div>
      )}
      {pendingDeleteId && (
        <div className="confirm-overlay" role="presentation" onClick={cancelDeleteItem}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-confirm-title">삭제하시겠습니까?</h2>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={cancelDeleteItem}>취소</button>
              <button className="primary-button danger-confirm" onClick={confirmDeleteItem}>확인</button>
            </div>
          </section>
        </div>
      )}
      <ShellNav activeView={activeView} setActiveView={navigate} />
      <main className={`workspace ${mobileMemoEditing ? 'mobile-memo-editing' : ''}`}>
        {activeView !== 'schedule' && !mobileMemoEditing && <StatusStrip title={activeViewLabel} message={syncState.message} offline={syncState.offline} readonly={syncState.readonly} onRefresh={refresh} onLogout={logout} syncState={syncState} />}
        {activeView === 'schedule' && (
          <ScheduleView
            days={data.days}
            items={data.itineraryItems}
            tripTitle={data.trip.title}
            activeDay={activeDay}
            setActiveDay={setActiveDay}
            selectedItem={selectedItem}
            setSelectedItem={openScheduleDetail}
            readonly={syncState.readonly}
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
            onAdd={addItem}
            onSave={saveItem}
            onDelete={deleteItem}
            onToggleConfirmed={setItineraryItemConfirmed}
            syncState={syncState}
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
        {activeView === 'memos' && (
          <MemoView
            memos={data.memos}
            tripId={data.trip.id}
            onSave={upsertMemo}
            onDelete={deleteMemo}
            readonly={syncState.readonly}
            onMobileEditorChange={setMobileMemoEditing}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            exchangeRate={data.trip.exchangeRate}
            showKrw={showKrw}
            setShowKrw={setShowKrw}
            onExchangeRate={(exchangeRate) => updateTrip({ ...data.trip, exchangeRate })}
            syncState={syncState}
            onLogout={logout}
          />
        )}
      </main>
      {!mobileMemoEditing && <MobileTabs activeView={activeView} setActiveView={navigate} />}
    </div>
  )
}

export default App
