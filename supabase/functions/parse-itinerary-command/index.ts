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

const categories: Category[] = ['이동', '식사', '카페', '관광', '쇼핑', '휴식', '기타']

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

const normalizeTime = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback
}

const normalizeString = (value: unknown, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)
const normalizeCategory = (value: unknown, fallback: Category) => categories.includes(value as Category) ? value as Category : fallback
const normalizeBudget = (value: unknown, fallback: number) => {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : fallback
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405)

  const geminiKey = getGeminiKey()
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY가 Supabase Edge Function secret에 설정되어 있지 않습니다.' }, 500)

  let body: { command?: unknown; currentItem?: CurrentItem; trip?: unknown; categories?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: '요청 JSON을 읽지 못했습니다.' }, 400)
  }

  const command = typeof body.command === 'string' ? body.command.trim() : ''
  if (!command) return json({ error: 'AI로 채울 명령을 입력하세요.' }, 400)

  const currentItem = body.currentItem ?? {}
  const fallbackCategory = normalizeCategory(currentItem.category, '기타')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite'

  const schema = {
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

  const prompt = [
    'You fill an Osaka travel itinerary edit form from a Korean natural-language command.',
    'Return only fields for the form. Do not save anything.',
    'If the command omits a field, keep the current item value.',
    'Use exact category labels only: 이동, 식사, 카페, 관광, 쇼핑, 휴식, 기타.',
    'Use HH:MM for startTime and endTime. If only one time appears, keep the current endTime unless duration is obvious.',
    'Use JPY for budgetJpy. Convert Korean text like 5천엔 or 5000엔 to 5000.',
    'Make title concise. Put details such as reservation notes, routes, or reminders into note.',
  ].join('\n')

  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
              text: `${prompt}\n\n${JSON.stringify({
                command,
                currentItem,
                trip: body.trip ?? null,
                categories,
              })}`,
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

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text()
    return json({ error: `AI 요청 실패: ${errorText}` }, 502)
  }

  const geminiJson = await geminiResponse.json() as Record<string, unknown>
  let outputText = readGeminiText(geminiJson)
  if (!outputText && typeof geminiJson.text === 'string') outputText = geminiJson.text
  if (!outputText) return json({ error: 'AI 응답을 읽지 못했습니다.' }, 502)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(outputText)
  } catch {
    return json({ error: 'AI 응답 JSON을 해석하지 못했습니다.' }, 502)
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
