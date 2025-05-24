export async function fetchWeatherData({
  lat,
  lon,
  units,
}: {
  lat: number
  lon: number
  units: string
}) {
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    throw new Error('Missing WEATHER_API_KEY environment variable')
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Failed to fetch weather data')
  }
  return res.json()
}
