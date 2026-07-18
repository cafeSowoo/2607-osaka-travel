import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { readLocalData, writeLocalData } from '../lib/localStore'
import { sortItineraryItems } from '../lib/itinerarySort'
import { normalizeTime } from '../lib/time'
import {
  deleteMemo as deleteRemoteMemo,
  deleteItineraryItem as deleteRemoteItineraryItem,
  deleteChecklistItem as deleteRemoteChecklistItem,
  getSession,
  isSupabaseConfigured,
  loadSupabaseData,
  saveChecklistItem,
  saveItineraryItem,
  saveMemo,
  saveTrip,
  signInWithGoogle,
  signOut,
  supabase,
} from '../lib/supabase'
import type { ChecklistItem, ChecklistItemKind, ItineraryItem, Memo, SyncState, TravelData, Trip } from '../types'

const uuid = () => crypto.randomUUID()
const mergeTasksWithDividers = (sectionItems: ChecklistItem[], reorderedTasks: ChecklistItem[]) => {
  const queue = [...reorderedTasks]
  return sectionItems.map((item) => (item.kind === 'divider' ? item : queue.shift()!))
}

export const useTravelData = () => {
  const [data, setData] = useState<TravelData>(() => readLocalData())
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(!isSupabaseConfigured)
  const [online, setOnline] = useState(navigator.onLine)
  const [message, setMessage] = useState('로컬 데이터를 준비했어요.')
  const [lastRemoteMutationAt, setLastRemoteMutationAt] = useState(0)

  const readonly = !online
  const userMetadata = session?.user.user_metadata as Record<string, string | undefined> | undefined

  const syncState: SyncState = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      authenticated: Boolean(session) || demoMode,
      loading,
      offline: !online,
      readonly,
      message,
      lastRemoteMutationAt,
      user: session ? {
        name: userMetadata?.full_name ?? userMetadata?.name ?? session.user.email ?? '사용자',
        email: session.user.email ?? '',
        avatarUrl: userMetadata?.avatar_url ?? userMetadata?.picture ?? '',
      } : null,
    }),
    [demoMode, lastRemoteMutationAt, loading, message, online, readonly, session, userMetadata],
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
          setLastRemoteMutationAt(Date.now())
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
        startTime: normalizeTime(item.startTime ?? existing?.startTime ?? ''),
        endTime: normalizeTime(item.endTime ?? existing?.endTime ?? ''),
        place: item.place ?? existing?.place ?? '',
        category: item.category ?? existing?.category ?? '기타',
        title: item.title ?? existing?.title ?? '',
        note: item.note ?? existing?.note ?? '',
        budgetJpy: Number(item.budgetJpy ?? existing?.budgetJpy ?? 0),
        googlePlaceQuery: item.googlePlaceQuery ?? existing?.googlePlaceQuery ?? '',
        googlePlaceId: item.googlePlaceId ?? existing?.googlePlaceId ?? '',
        googleMapsUri: item.googleMapsUri ?? existing?.googleMapsUri ?? '',
        formattedAddress: item.formattedAddress ?? existing?.formattedAddress ?? '',
        lat: item.lat ?? existing?.lat ?? null,
        lng: item.lng ?? existing?.lng ?? null,
        confirmed: item.confirmed ?? existing?.confirmed ?? false,
        sortOrder: item.sortOrder ?? existing?.sortOrder ?? dayItems.length * 10 + 10,
      }
      const nextItems = existing
        ? data.itineraryItems.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate))
        : [...data.itineraryItems, nextItem]
      const next = { ...data, itineraryItems: sortItineraryItems(nextItems) }
      persist(next, session ? () => saveItineraryItem(nextItem, session) : undefined)
      return nextItem
    },
    [data, persist, session],
  )

  const deleteItineraryItem = useCallback(
    (id: string) => {
      const next = { ...data, itineraryItems: data.itineraryItems.filter((item) => item.id !== id) }
      persist(next, session ? () => deleteRemoteItineraryItem(id, session) : undefined)
    },
    [data, persist, session],
  )

  const setItineraryItemConfirmed = useCallback(
    (id: string, confirmed: boolean) => {
      const item = data.itineraryItems.find((candidate) => candidate.id === id)
      if (!item || item.confirmed === confirmed) return

      const nextItem = { ...item, confirmed }
      const next = {
        ...data,
        itineraryItems: data.itineraryItems.map((candidate) => (candidate.id === id ? nextItem : candidate)),
      }
      persist(next, session ? () => saveItineraryItem(nextItem, session) : undefined)
    },
    [data, persist, session],
  )

  const toggleChecklistItem = useCallback(
    (id: string) => {
      const item = data.checklistItems.find((candidate) => candidate.id === id)
      if (!item || item.kind === 'divider') return

      const sectionItems = data.checklistItems
        .filter((candidate) => candidate.section === item.section)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const nextDone = !item.done
      const others = sectionItems.filter((candidate) => candidate.id !== id && candidate.kind === 'task')
      const incomplete = others.filter((candidate) => !candidate.done)
      const complete = others.filter((candidate) => candidate.done)
      const nextItem: ChecklistItem = { ...item, done: nextDone }
      const reorderedTasks = nextDone
        ? [...incomplete, ...complete, nextItem]
        : [...incomplete, nextItem, ...complete]
      const merged = mergeTasksWithDividers(sectionItems, reorderedTasks)
      const updatedSectionItems = merged.map((candidate, index) => ({
        ...candidate,
        sortOrder: (index + 1) * 10,
      }))
      const updatedById = new Map(updatedSectionItems.map((candidate) => [candidate.id, candidate]))
      const next = {
        ...data,
        checklistItems: data.checklistItems
          .map((candidate) => updatedById.get(candidate.id) ?? candidate)
          .sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder),
      }
      persist(
        next,
        session ? async () => {
          await Promise.all(updatedSectionItems.map((candidate) => saveChecklistItem(candidate, session)))
        } : undefined,
      )
    },
    [data, persist, session],
  )

  const addChecklistItem = useCallback(
    (section: ChecklistItem['section'], title: string, kind: ChecklistItemKind = 'task') => {
      const cleanTitle = title.trim()
      if (!cleanTitle) return
      const sectionItems = data.checklistItems.filter((item) => item.section === section)
      const nextItem: ChecklistItem = {
        id: uuid(),
        tripId: data.trip.id,
        section,
        kind,
        title: cleanTitle,
        done: false,
        sortOrder: sectionItems.length * 10 + 10,
      }
      const next = {
        ...data,
        checklistItems: [...data.checklistItems, nextItem].sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder),
      }
      persist(next, session ? () => saveChecklistItem(nextItem, session) : undefined)
    },
    [data, persist, session],
  )

  const updateChecklistItem = useCallback(
    (id: string, title: string) => {
      const item = data.checklistItems.find((candidate) => candidate.id === id)
      if (!item) return
      const cleanTitle = title.trim()
      if (!cleanTitle || cleanTitle === item.title) return

      const nextItem: ChecklistItem = { ...item, title: cleanTitle }
      const next = {
        ...data,
        checklistItems: data.checklistItems.map((candidate) => (candidate.id === id ? nextItem : candidate)),
      }
      persist(next, session ? () => saveChecklistItem(nextItem, session) : undefined)
    },
    [data, persist, session],
  )

  const deleteChecklistItem = useCallback(
    (id: string) => {
      const item = data.checklistItems.find((candidate) => candidate.id === id)
      if (!item) return

      const next = {
        ...data,
        checklistItems: data.checklistItems.filter((candidate) => candidate.id !== id),
      }
      persist(next, session ? () => deleteRemoteChecklistItem(id, session) : undefined)
    },
    [data, persist, session],
  )

  const reorderChecklistItems = useCallback(
    (section: ChecklistItem['section'], fromId: string, toId: string) => {
      if (fromId === toId) return
      const sectionItems = data.checklistItems.filter((item) => item.section === section).sort((a, b) => a.sortOrder - b.sortOrder)
      const fromIndex = sectionItems.findIndex((item) => item.id === fromId)
      const toIndex = sectionItems.findIndex((item) => item.id === toId)
      if (fromIndex < 0 || toIndex < 0) return

      const reordered = [...sectionItems]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      const updatedSectionItems = reordered.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
      const updatedById = new Map(updatedSectionItems.map((item) => [item.id, item]))
      const next = {
        ...data,
        checklistItems: data.checklistItems
          .map((item) => updatedById.get(item.id) ?? item)
          .sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder),
      }
      persist(
        next,
        session ? async () => {
          await Promise.all(updatedSectionItems.map((item) => saveChecklistItem(item, session)))
        } : undefined,
      )
    },
    [data, persist, session],
  )

  const upsertMemo = useCallback(
    (memo: Pick<Memo, 'title' | 'content'> & Partial<Pick<Memo, 'id' | 'createdAt'>>) => {
      const existing = memo.id ? data.memos.find((candidate) => candidate.id === memo.id) : undefined
      const now = new Date().toISOString()
      const nextMemo: Memo = {
        id: memo.id ?? uuid(),
        tripId: data.trip.id,
        title: memo.title.trim(),
        content: memo.content,
        createdAt: memo.createdAt ?? existing?.createdAt ?? now,
        updatedAt: now,
      }
      const nextMemos = existing
        ? data.memos.map((candidate) => candidate.id === nextMemo.id ? nextMemo : candidate)
        : [nextMemo, ...data.memos]
      const next = {
        ...data,
        memos: nextMemos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      }
      persist(next, session ? () => saveMemo(nextMemo, session) : undefined)
      return nextMemo
    },
    [data, persist, session],
  )

  const deleteMemo = useCallback(
    (id: string) => {
      const next = {
        ...data,
        memos: data.memos.filter((memo) => memo.id !== id),
      }
      persist(next, session ? () => deleteRemoteMemo(id, session) : undefined)
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
    setItineraryItemConfirmed,
    deleteItineraryItem,
    toggleChecklistItem,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    reorderChecklistItems,
    upsertMemo,
    deleteMemo,
  }
}
