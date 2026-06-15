const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export const isGooglePlacesConfigured = Boolean(googleMapsApiKey)

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (library: 'places') => Promise<PlacesLibrary>
    }
  }
  __osakaGoogleMapsReady?: () => void
}

type PlaceAutocompleteElement = HTMLElement & {
  includedRegionCodes?: string[]
  placeholder?: string
}

type PlacesLibrary = {
  PlaceAutocompleteElement: new (options?: Record<string, unknown>) => PlaceAutocompleteElement
}

type PlacePredictionSelectEvent = Event & {
  placePrediction?: {
    toPlace: () => GooglePlace
  }
}

type GoogleLatLng = {
  lat: () => number
  lng: () => number
}

type GooglePlace = {
  id?: string
  displayName?: string | null
  formattedAddress?: string | null
  googleMapsURI?: string | null
  location?: GoogleLatLng | null
  fetchFields: (options: { fields: string[] }) => Promise<{ place: GooglePlace }>
}

export type GooglePlaceSelection = {
  placeId: string
  name: string
  address: string
  googleMapsUri: string
  lat: number | null
  lng: number | null
}

let mapsApiPromise: Promise<void> | null = null

const googleMapsWindow = () => window as GoogleMapsWindow

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

export const createPlaceAutocompleteElement = async () => {
  await loadGoogleMapsApi()
  const places = await googleMapsWindow().google?.maps?.importLibrary?.('places')
  if (!places) throw new Error('Google Places library is unavailable.')

  const element = new places.PlaceAutocompleteElement() as PlaceAutocompleteElement
  element.includedRegionCodes = ['jp']
  element.placeholder = 'Google Places에서 장소 선택'
  element.classList.add('places-autocomplete-element')
  return element
}

export const readPlaceSelection = async (event: Event): Promise<GooglePlaceSelection | null> => {
  const placePrediction = (event as PlacePredictionSelectEvent).placePrediction
  if (!placePrediction) return null

  const place = placePrediction.toPlace()
  await place.fetchFields({
    fields: ['id', 'displayName', 'formattedAddress', 'googleMapsURI', 'location'],
  })

  return {
    placeId: place.id ?? '',
    name: place.displayName ?? '',
    address: place.formattedAddress ?? '',
    googleMapsUri: place.googleMapsURI ?? '',
    lat: place.location?.lat() ?? null,
    lng: place.location?.lng() ?? null,
  }
}
