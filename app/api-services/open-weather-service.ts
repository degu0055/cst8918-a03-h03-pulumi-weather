import { redis } from '../data-access/redis-connection'

const API_KEY = process.env.WEATHER_API_KEY
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather' // safer and more stable than 3.0
const TEN_MINUTES = 1000 * 60 * 10 // 10 minutes in milliseconds

interface FetchWeatherDataParams {
  lat: number
  lon: number
  units: 'standard' | 'metric' | 'imperial'
}

export async function fetchWeatherData({
  lat,
  lon,
  units
}: FetchWeatherDataParams) {
  const queryString = `lat=${lat}&lon=${lon}&units=${units}`
  console.log('Query:', queryString)

  try {
    const cacheEntry = await redis.get(queryString)
    if (cacheEntry) {
      console.log('Cache hit')
      return JSON.parse(cacheEntry)
    }

    const fullUrl = `${BASE_URL}?${queryString}&appid=${API_KEY}`
    console.log('Fetching from API:', fullUrl)

    const response = await fetch(fullUrl)
    console.log('API Status:', response.status)

    if (!response.ok) {
      console.error('API error:', response.statusText)
      throw new Error(`Failed to fetch weather data: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Weather Data:', data)

    await redis.set(queryString, JSON.stringify(data), { PX: TEN_MINUTES })

    return data
  } catch (err) {
    console.error('Error in fetchWeatherData:', err)
    throw err
  }
}


console.log("API key:", process.env.WEATHER_API_KEY);