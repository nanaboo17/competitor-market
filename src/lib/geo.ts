export type GeoResult = {
  latitude: number
  longitude: number
  accuracy: number
}

export function getCurrentLocation(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this device.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => reject(new Error(error.message || 'Unable to capture location.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
