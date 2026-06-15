const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export const isGooglePlacesConfigured = Boolean(googleMapsApiKey)

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (library: 'places') => Promise<PlacesDataLibrary>
    }
  }
  __osakaGoogleMapsReady?: () => void
}

type GoogleLatLng = {
  lat: () => number
  lng: () => number
}

type GooglePlace = {
  id?: string
  displayName?: string | { text?: string } | null
  formattedAddress?: string | null
  googleMapsURI?: string | null
  location?: GoogleLatLng | null
  fetchFields: (options: { fields: string[] }) => Promise<{ place: GooglePlace }>
}

type PlacePrediction = {
  placeId?: string
  text?: { toString(): string }
  mainText?: { text?: string }
  secondaryText?: { text?: string }
  toPlace: () => GooglePlace
}

type AutocompleteSuggestionResult = {
  placePrediction?: PlacePrediction
}

type AutocompleteRequest = {
  input: string
  sessionToken?: object
  includedRegionCodes?: string[]
  language?: string
  region?: string
}

type PlacesDataLibrary = {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: AutocompleteRequest) => Promise<{ suggestions: AutocompleteSuggestionResult[] }>
  }
}

export type GooglePlaceSelection = {
  placeId: string
  name: string
  address: string
  googleMapsUri: string
  lat: number | null
  lng: number | null
}

export type PlaceSuggestion = {
  key: string
  mainText: string
  secondaryText: string
  placePrediction: PlacePrediction
}

let mapsApiPromise: Promise<void> | null = null

const googleMapsWindow = () => window as GoogleMapsWindow

const readPlaceField = (value: unknown) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'text' in value) return String((value as { text?: string }).text ?? '')
  return String(value)
}

const loadGoogleMapsApi = () => {
  if (googleMapsWindow().google?.maps?.importLibrary) return Promise.resolve()
  if (!googleMapsApiKey) return Promise.reject(new Error('Google Maps API key is missing.'))
  if (mapsApiPromise) return mapsApiPromise

  mapsApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: googleMapsApiKey,
      v: 'weekly',
      language: 'ko',
      region: 'JP',
      loading: 'async',
      callback: '__osakaGoogleMapsReady',
    })

    googleMapsWindow().__osakaGoogleMapsReady = () => {
      resolve()
      delete googleMapsWindow().__osakaGoogleMapsReady
    }

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      mapsApiPromise = null
      reject(new Error('Google Maps API could not load.'))
    }
    document.head.appendChild(script)
  })

  return mapsApiPromise
}

const importPlacesLibrary = async () => {
  await loadGoogleMapsApi()
  const places = await googleMapsWindow().google?.maps?.importLibrary?.('places')
  if (!places) throw new Error('Google Places library is unavailable.')
  return places
}

export const createAutocompleteSessionToken = async () => {
  const places = await importPlacesLibrary()
  return new places.AutocompleteSessionToken()
}

export const fetchPlaceSuggestions = async (
  input: string,
  sessionToken: object,
): Promise<PlaceSuggestion[]> => {
  const trimmed = input.trim()
  if (!trimmed) return []

  const places = await importPlacesLibrary()
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: trimmed,
    sessionToken,
    includedRegionCodes: ['jp'],
    language: 'ko',
    region: 'JP',
  })

  return suggestions.flatMap((suggestion, index) => {
    const placePrediction = suggestion.placePrediction
    if (!placePrediction) return []

    const mainText = placePrediction.mainText?.text
      ?? placePrediction.text?.toString()
      ?? ''
    const secondaryText = placePrediction.secondaryText?.text ?? ''
    const key = placePrediction.placeId ?? `${mainText}-${secondaryText}-${index}`

    return [{ key, mainText, secondaryText, placePrediction }]
  })
}

export const resolvePlaceFromPrediction = async (
  placePrediction: PlacePrediction,
): Promise<GooglePlaceSelection> => {
  const place = placePrediction.toPlace()
  await place.fetchFields({
    fields: ['id', 'displayName', 'formattedAddress', 'googleMapsURI', 'location'],
  })

  return {
    placeId: place.id ?? '',
    name: readPlaceField(place.displayName),
    address: place.formattedAddress ?? '',
    googleMapsUri: place.googleMapsURI ?? '',
    lat: place.location?.lat() ?? null,
    lng: place.location?.lng() ?? null,
  }
}
