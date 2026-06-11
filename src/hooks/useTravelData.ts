import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { readLocalData, writeLocalData } from '../lib/localStore'
import {
  deleteItineraryItem as deleteRemoteItineraryItem,
  getSession,
  isSupabaseConfigured,
  loadSupabaseData,
  saveChecklistItem,
  saveItineraryItem,
  saveTrip,
  signInWithGoogle,
  signOut,
  supabase,
} from '../lib/supabase'
import type { ChecklistItem, ItineraryItem, SyncState, TravelData, Trip } from '../types'

const uuid = () => crypto.randomUUID()
const normalizeTime = (value: string) => value.trim().slice(0, 5)

export const useTravelData = () => {
  const [data, setData] = useState<TravelData>(() => readLocalData())
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(!isSupabaseConfigured)
  const [online, setOnline] = useState(navigator.onLine)
  const [message, setMessage] = useState('로컬 데이터를 준비했어요.')

  const readonly = !online

  const syncState: SyncState = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      authenticated: Boolean(session) || demoMode,
      loading,
      offline: !online,
      readonly,
      message,
    }),
    [demoMode, loading, message, online, readonly, session],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const currentSession = await getSession()
      setSession(currentSession)
      if (currentSession && online) {
        const remote = await loadSupabaseData(currentSession)
        setData(remote)
        writeLocalData(remote)
        setMessage('Supabase와 동기화됨')
        setDemoMode(false)
      } else {
        const local = readLocalData()
        setData(local)
        setMessage(isSupabaseConfigured ? '로그인 전 로컬 캐시 표시 중' : 'Supabase 환경변수 없음 · 데모 모드')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '동기화 실패 · 로컬 캐시 표시 중')
      setData(readLocalData())
    } finally {
      setLoading(false)
    }
  }, [online])

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh()
    }, 0)

    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)

    const authSub = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) refresh()
    })

    return () => {
      window.clearTimeout(initialRefresh)
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
      authSub?.data.subscription.unsubscribe()
    }
  }, [refresh])

  const persist = useCallback(
    async (nextData: TravelData, remoteAction?: () => Promise<void>) => {
      setData(nextData)
      writeLocalData(nextData)
      if (readonly) {
        setMessage('오프라인 읽기 전용 상태입니다.')
        return
      }
      if (session && remoteAction) {
        try {
          await remoteAction()
          setMessage('변경사항 저장됨')
        } catch (error) {
          setMessage(error instanceof Error ? error.message : '원격 저장 실패')
        }
      } else {
        setMessage(demoMode ? '데모 데이터 저장됨' : '로컬 캐시에 저장됨')
      }
    },
    [demoMode, readonly, session],
  )

  const login = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDemoMode(true)
      setMessage('Supabase 환경변수가 없어 데모 모드로 들어갑니다.')
      return
    }
    await signInWithGoogle()
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setSession(null)
    setDemoMode(!isSupabaseConfigured)
    setMessage('로그아웃됨')
  }, [])

  const updateTrip = useCallback(
    (trip: Trip) => {
      const next = { ...data, trip }
      persist(next, session ? () => saveTrip(trip, session) : undefined)
    },
    [data, persist, session],
  )

  const upsertItineraryItem = useCallback(
    (item: Partial<ItineraryItem> & Pick<ItineraryItem, 'dayIndex' | 'date'>) => {
      const existing = item.id ? data.itineraryItems.find((candidate) => candidate.id === item.id) : undefined
      const dayItems = data.itineraryItems.filter((candidate) => candidate.dayIndex === item.dayIndex)
      const nextItem: ItineraryItem = {
        id: item.id ?? uuid(),
        tripId: data.trip.id,
        dayIndex: item.dayIndex,
        date: item.date,
        startTime: normalizeTime(item.startTime ?? existing?.startTime ?? '09:00'),
        endTime: normalizeTime(item.endTime ?? existing?.endTime ?? '10:00'),
        place: item.place ?? existing?.place ?? '',
        category: item.category ?? existing?.category ?? '기타',
        title: item.title ?? existing?.title ?? '새 일정',
        note: item.note ?? existing?.note ?? '',
        budgetJpy: Number(item.budgetJpy ?? existing?.budgetJpy ?? 0),
        googlePlaceQuery: item.googlePlaceQuery ?? existing?.googlePlaceQuery ?? '',
        sortOrder: item.sortOrder ?? existing?.sortOrder ?? dayItems.length * 10 + 10,
      }
      const nextItems = existing
        ? data.itineraryItems.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate))
        : [...data.itineraryItems, nextItem]
      const next = { ...data, itineraryItems: nextItems.sort((a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder) }
      persist(next, session ? () => saveItineraryItem(nextItem, session) : undefined)
      return nextItem
    },
    [data, persist, session],
  )

  const deleteItineraryItem = useCallback(
    (id: string) => {
      const next = { ...data, itineraryItems: data.itineraryItems.filter((item) => item.id !== id) }
      persist(next, session ? () => deleteRemoteItineraryItem(id) : undefined)
    },
    [data, persist, session],
  )

  const toggleChecklistItem = useCallback(
    (id: string) => {
      const item = data.checklistItems.find((candidate) => candidate.id === id)
      if (!item) return
      const nextItem: ChecklistItem = { ...item, done: !item.done }
      const next = {
        ...data,
        checklistItems: data.checklistItems.map((candidate) => (candidate.id === id ? nextItem : candidate)),
      }
      persist(next, session ? () => saveChecklistItem(nextItem, session) : undefined)
    },
    [data, persist, session],
  )

  return {
    data,
    syncState,
    login,
    logout,
    refresh,
    updateTrip,
    upsertItineraryItem,
    deleteItineraryItem,
    toggleChecklistItem,
  }
}
