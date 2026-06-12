type Category = '이동' | '식사' | '카페' | '관광' | '쇼핑' | '휴식' | '기타'

type CurrentItem = {
  dayIndex?: number
  date?: string
  startTime?: string
  endTime?: string
  place?: string
  category?: Category
  title?: string
  note?: string
  budgetJpy?: number
  googlePlaceQuery?: string
}

type DayContextItem = Pick<CurrentItem, 'startTime' | 'endTime' | 'place' | 'category' | 'title' | 'note' | 'googlePlaceQuery'>

type RouteIntent = {
  needsRoute: boolean
  origin: string
  destination: string
  date: string
  timeType: 'arrival' | 'departure' | 'none'
  time: string
  transitModes: string[]
  routingPreference: 'LESS_WALKING' | 'FEWER_TRANSFERS' | 'none'
}

const categories: Category[] = ['이동', '식사', '카페', '관광', '쇼핑', '휴식', '기타']
const transitModes = ['BUS', 'SUBWAY', 'TRAIN', 'LIGHT_RAIL', 'RAIL']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const readGeminiText = (response: Record<string, unknown>) => {
  const candidates = Array.isArray(response.candidates) ? response.candidates : []

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const content = (candidate as { content?: unknown }).content
    if (!content || typeof content !== 'object') continue
    const parts = Array.isArray((content as { parts?: unknown }).parts) ? (content as { parts: unknown[] }).parts : []
    const text = parts
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const value = (part as { text?: unknown }).text
        return typeof value === 'string' ? value : ''
      })
      .join('')
      .trim()

    if (text) return text
  }

  return ''
}

const getGeminiKey = () => (
  Deno.env.get('GEMINI_API_KEY')
  ?? Deno.env.get('GOOGLE_API_KEY')
  ?? Deno.env.get('GOOGLE_GENAI_API_KEY')
)

const getMapsKey = () => Deno.env.get('GOOGLE_MAPS_API_KEY')

const normalizeTime = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback
}

const normalizeDate = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

const normalizeString = (value: unknown, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)
const normalizeCategory = (value: unknown, fallback: Category) => categories.includes(value as Category) ? value as Category : fallback
const normalizeBudget = (value: unknown, fallback: number) => {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : fallback
}

const normalizeTransitModes = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.filter((mode): mode is string => typeof mode === 'string' && transitModes.includes(mode))
}

const callGeminiJson = async (
  geminiKey: string,
  model: string,
  prompt: string,
  payload: Record<string, unknown>,
  schema: Record<string, unknown>,
) => {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `${prompt}\n\n${JSON.stringify(payload)}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI 요청 실패: ${errorText}`)
  }

  const geminiJson = await response.json() as Record<string, unknown>
  let outputText = readGeminiText(geminiJson)
  if (!outputText && typeof geminiJson.text === 'string') outputText = geminiJson.text
  if (!outputText) throw new Error('AI 응답을 읽지 못했습니다.')

  try {
    return JSON.parse(outputText) as Record<string, unknown>
  } catch {
    throw new Error('AI 응답 JSON을 해석하지 못했습니다.')
  }
}

const makeJapanAddress = (value: string) => {
  const text = value.trim()
  if (!text) return text
  return /japan|日本|일본|osaka|오사카|kobe|고베|kansai|간사이/i.test(text) ? text : `${text}, Osaka, Japan`
}

const makeRfc3339InJapan = (date: string, time: string) => `${date}T${time}:00+09:00`

const getText = (value: unknown) => {
  if (!value || typeof value !== 'object') return ''
  const text = (value as { text?: unknown }).text
  return typeof text === 'string' ? text : ''
}

const durationSeconds = (value: unknown) => {
  if (typeof value !== 'string') return 0
  const match = value.match(/^(\d+(?:\.\d+)?)s$/)
  return match ? Number(match[1]) : 0
}

const addSecondsToTime = (time: string, seconds: number) => {
  const [hour, minute] = time.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute, 0))
  date.setUTCSeconds(date.getUTCSeconds() + seconds)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

const subtractSecondsFromTime = (time: string, seconds: number) => addSecondsToTime(time, -seconds)

const compactRouteSummary = (routeJson: Record<string, unknown>, intent: RouteIntent) => {
  const routes = Array.isArray(routeJson.routes) ? routeJson.routes : []
  const route = routes[0]
  if (!route || typeof route !== 'object') return { found: false, requested: intent }

  const routeRecord = route as Record<string, unknown>
  const routeDurationSeconds = durationSeconds(routeRecord.duration)
  const localizedValues = routeRecord.localizedValues as Record<string, unknown> | undefined
  const legs = Array.isArray(routeRecord.legs) ? routeRecord.legs : []
  const steps = legs.flatMap((leg) => {
    if (!leg || typeof leg !== 'object') return []
    const legSteps = Array.isArray((leg as { steps?: unknown }).steps) ? (leg as { steps: unknown[] }).steps : []
    return legSteps
  }).slice(0, 10)

  const compactSteps = steps.map((step) => {
    const stepRecord = step && typeof step === 'object' ? step as Record<string, unknown> : {}
    const stepLocalized = stepRecord.localizedValues as Record<string, unknown> | undefined
    const transitDetails = stepRecord.transitDetails && typeof stepRecord.transitDetails === 'object'
      ? stepRecord.transitDetails as Record<string, unknown>
      : {}
    const transitLine = transitDetails.transitLine && typeof transitDetails.transitLine === 'object'
      ? transitDetails.transitLine as Record<string, unknown>
      : {}
    const stopDetails = transitDetails.stopDetails && typeof transitDetails.stopDetails === 'object'
      ? transitDetails.stopDetails as Record<string, unknown>
      : {}
    const departureStop = stopDetails.departureStop && typeof stopDetails.departureStop === 'object'
      ? stopDetails.departureStop as Record<string, unknown>
      : {}
    const arrivalStop = stopDetails.arrivalStop && typeof stopDetails.arrivalStop === 'object'
      ? stopDetails.arrivalStop as Record<string, unknown>
      : {}
    const vehicle = transitLine.vehicle && typeof transitLine.vehicle === 'object'
      ? transitLine.vehicle as Record<string, unknown>
      : {}

    return {
      travelMode: stepRecord.travelMode,
      instruction: typeof (stepRecord.navigationInstruction as { instructions?: unknown } | undefined)?.instructions === 'string'
        ? (stepRecord.navigationInstruction as { instructions: string }).instructions
        : '',
      distance: getText(stepLocalized?.distance),
      duration: getText(stepLocalized?.staticDuration),
      transit: {
        line: normalizeString(transitLine.name) || normalizeString(transitLine.nameShort),
        vehicle: normalizeString(vehicle.name) || normalizeString(vehicle.type),
        headsign: normalizeString(transitDetails.headsign),
        tripShortText: normalizeString(transitDetails.tripShortText),
        stopCount: transitDetails.stopCount,
        departureStop: normalizeString(departureStop.name),
        arrivalStop: normalizeString(arrivalStop.name),
        departureTime: normalizeString(stopDetails.departureTime),
        arrivalTime: normalizeString(stopDetails.arrivalTime),
      },
    }
  })

  const computedStartTime = intent.timeType === 'arrival' && routeDurationSeconds > 0
    ? subtractSecondsFromTime(intent.time, routeDurationSeconds)
    : intent.timeType === 'departure'
      ? intent.time
      : ''
  const computedEndTime = intent.timeType === 'departure' && routeDurationSeconds > 0
    ? addSecondsToTime(intent.time, routeDurationSeconds)
    : intent.timeType === 'arrival'
      ? intent.time
      : ''

  return {
    found: true,
    requested: intent,
    computedStartTime,
    computedEndTime,
    route: {
      duration: getText(localizedValues?.duration),
      distance: getText(localizedValues?.distance),
      durationSeconds: routeDurationSeconds,
      description: normalizeString(routeRecord.description),
      steps: compactSteps,
    },
  }
}

const callRoutesApi = async (mapsKey: string, intent: RouteIntent) => {
  const body: Record<string, unknown> = {
    origin: { address: makeJapanAddress(intent.origin) },
    destination: { address: makeJapanAddress(intent.destination) },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: false,
    languageCode: 'ko',
    regionCode: 'JP',
    units: 'METRIC',
  }

  if (intent.timeType === 'arrival') body.arrivalTime = makeRfc3339InJapan(intent.date, intent.time)
  if (intent.timeType === 'departure') body.departureTime = makeRfc3339InJapan(intent.date, intent.time)

  const transitPreferences: Record<string, unknown> = {}
  if (intent.transitModes.length) transitPreferences.allowedTravelModes = intent.transitModes
  if (intent.routingPreference !== 'none') transitPreferences.routingPreference = intent.routingPreference
  if (Object.keys(transitPreferences).length) body.transitPreferences = transitPreferences

  const fieldMask = [
    'routes.duration',
    'routes.distanceMeters',
    'routes.description',
    'routes.localizedValues',
    'routes.legs.localizedValues',
    'routes.legs.steps.travelMode',
    'routes.legs.steps.navigationInstruction',
    'routes.legs.steps.localizedValues',
    'routes.legs.steps.transitDetails',
    'geocodingResults',
  ].join(',')

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': mapsKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`교통 검색 실패: ${errorText}`)
  }

  return await response.json() as Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405)

  const geminiKey = getGeminiKey()
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY가 Supabase Edge Function secret에 설정되어 있지 않습니다.' }, 500)

  let body: { command?: unknown; currentItem?: CurrentItem; trip?: unknown; categories?: unknown; dayContext?: DayContextItem[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: '요청 JSON을 읽지 못했습니다.' }, 400)
  }

  const command = typeof body.command === 'string' ? body.command.trim() : ''
  if (!command) return json({ error: 'AI로 채울 명령을 입력하세요.' }, 400)

  const currentItem = body.currentItem ?? {}
  const dayContext = Array.isArray(body.dayContext) ? body.dayContext.slice(0, 12) : []
  const fallbackCategory = normalizeCategory(currentItem.category, '기타')
  const fallbackDate = normalizeDate(currentItem.date, '2026-07-26')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite'

  const routeIntentSchema = {
    type: 'object',
    required: ['needsRoute', 'origin', 'destination', 'date', 'timeType', 'time', 'transitModes', 'routingPreference'],
    properties: {
      needsRoute: { type: 'boolean' },
      origin: { type: 'string' },
      destination: { type: 'string' },
      date: { type: 'string' },
      timeType: { type: 'string', enum: ['arrival', 'departure', 'none'] },
      time: { type: 'string' },
      transitModes: { type: 'array', items: { type: 'string', enum: transitModes } },
      routingPreference: { type: 'string', enum: ['LESS_WALKING', 'FEWER_TRANSFERS', 'none'] },
    },
  }

  const routeIntentPrompt = [
    'Decide whether this Korean itinerary command needs a real public transit route lookup.',
    'Return needsRoute=true only for commands asking for buses, trains, subway, route search, departure time, arrival time, transport number, stops, or how to get from one place to another.',
    'Resolve short aliases using currentItem and dayContext. Examples: 숙소 means the hotel/lodging item in dayContext, 공항 may mean Kobe Airport Terminal 2 on arrival day or Kansai Airport Terminal 2 on departure day if context says so.',
    'Use concrete searchable place/address strings in origin and destination. Add city or station names when context gives them.',
    'If the user asks to arrive by a time, use timeType=arrival. If the user asks to leave at a time, use timeType=departure.',
    'If a route is needed but the time is missing, use currentItem startTime as departure.',
    'If origin or destination cannot be resolved, set needsRoute=false.',
  ].join('\n')

  let routeSummary: Record<string, unknown> | null = null
  try {
    const routeIntentJson = await callGeminiJson(geminiKey, model, routeIntentPrompt, {
      command,
      currentItem,
      dayContext,
      trip: body.trip ?? null,
    }, routeIntentSchema)
    const routeIntent: RouteIntent = {
      needsRoute: routeIntentJson.needsRoute === true,
      origin: normalizeString(routeIntentJson.origin),
      destination: normalizeString(routeIntentJson.destination),
      date: normalizeDate(routeIntentJson.date, fallbackDate),
      timeType: routeIntentJson.timeType === 'arrival' || routeIntentJson.timeType === 'departure' ? routeIntentJson.timeType : 'none',
      time: normalizeTime(routeIntentJson.time, currentItem.startTime ?? '09:00'),
      transitModes: normalizeTransitModes(routeIntentJson.transitModes),
      routingPreference: routeIntentJson.routingPreference === 'LESS_WALKING' || routeIntentJson.routingPreference === 'FEWER_TRANSFERS'
        ? routeIntentJson.routingPreference
        : 'none',
    }

    if (routeIntent.needsRoute && routeIntent.origin && routeIntent.destination && routeIntent.timeType !== 'none') {
      const mapsKey = getMapsKey()
      if (!mapsKey) return json({ error: 'GOOGLE_MAPS_API_KEY가 Supabase Edge Function secret에 설정되어 있지 않습니다.' }, 500)
      const routesJson = await callRoutesApi(mapsKey, routeIntent)
      routeSummary = compactRouteSummary(routesJson, routeIntent)
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '교통 검색을 처리하지 못했습니다.' }, 502)
  }

  const finalSchema = {
    type: 'object',
    required: ['startTime', 'endTime', 'place', 'category', 'title', 'note', 'budgetJpy', 'googlePlaceQuery'],
    properties: {
      startTime: { type: 'string', description: '24-hour time in HH:MM format.' },
      endTime: { type: 'string', description: '24-hour time in HH:MM format.' },
      place: { type: 'string', description: 'Primary place name. Empty string if unknown.' },
      category: { type: 'string', enum: categories },
      title: { type: 'string', description: 'Short schedule content/title.' },
      note: { type: 'string', description: 'Helpful memo. Empty string if none.' },
      budgetJpy: { type: 'integer', description: 'Budget in Japanese yen. Use 0 if unknown.' },
      googlePlaceQuery: { type: 'string', description: 'Concise place search query. Empty string if no place.' },
    },
  }

  const finalPrompt = [
    'You fill an Osaka travel itinerary edit form from a Korean natural-language command.',
    'Return only fields for the form. Do not save anything.',
    'If the command omits a field, keep the current item value.',
    'Use exact category labels only: 이동, 식사, 카페, 관광, 쇼핑, 휴식, 기타.',
    'Use HH:MM for startTime and endTime. If only one time appears, keep the current endTime unless duration is obvious.',
    'Use JPY for budgetJpy. Convert Korean text like 5천엔 or 5000엔 to 5000.',
    'Make title concise. Put details such as transit line number, stop names, transfer notes, or reminders into note.',
    'If routeSummary.found is true, trust routeSummary over guesses. Use computedStartTime/computedEndTime when available.',
    'If routeSummary.found is false, do not invent line numbers or departure times. Put that Google Routes did not return a public-transit route in note.',
  ].join('\n')

  let parsed: Record<string, unknown>
  try {
    parsed = await callGeminiJson(geminiKey, model, finalPrompt, {
      command,
      currentItem,
      dayContext,
      trip: body.trip ?? null,
      categories,
      routeSummary,
    }, finalSchema)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'AI 응답을 처리하지 못했습니다.' }, 502)
  }

  return json({
    startTime: normalizeTime(parsed.startTime, currentItem.startTime ?? '09:00'),
    endTime: normalizeTime(parsed.endTime, currentItem.endTime ?? '10:00'),
    place: normalizeString(parsed.place, currentItem.place ?? ''),
    category: normalizeCategory(parsed.category, fallbackCategory),
    title: normalizeString(parsed.title, currentItem.title ?? ''),
    note: normalizeString(parsed.note, currentItem.note ?? ''),
    budgetJpy: normalizeBudget(parsed.budgetJpy, currentItem.budgetJpy ?? 0),
    googlePlaceQuery: normalizeString(parsed.googlePlaceQuery, currentItem.googlePlaceQuery ?? ''),
  })
})
