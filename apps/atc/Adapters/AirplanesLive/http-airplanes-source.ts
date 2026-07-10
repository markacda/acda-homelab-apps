import type { AirplanesSource } from '../../Ports/AirplanesLive/airplanes-source.ts'
import type { PointQuery } from '../../Domain/ValueObjects/point-query.ts'
import { ProxyError } from '../../Domain/Exceptions/proxy-error.ts'

const TIMEOUT_MS = 10000 // 10-second upstream timeout

/**
 * AirplanesSource over HTTP. Adds a 10s timeout, forwards upstream error codes,
 * and honours 429 Retry-After with a per-URL backoff (a later call for the same
 * URL waits out the reset window before hitting the API again).
 */
export class HttpAirplanesSource implements AirplanesSource {
  // Track when each rate-limited URL may be called again.
  private rateLimitResetsOn: Record<string, Date> = {}

  fetchPoint(query: PointQuery, userAgent?: string): Promise<unknown> {
    const url = `https://api.airplanes.live/v2/point/${query.lat}/${query.lon}/${query.radius}`
    return this.call(url, userAgent)
  }

  fetchGlobe(path: string, userAgent?: string): Promise<unknown> {
    const url = `https://globe.airplanes.live/${path}`
    console.log(`[${new Date().toISOString()}] Fetching ${url}`)
    return this.call(url, userAgent)
  }

  private async call(apiUrl: string, userAgent: string | undefined): Promise<unknown> {
    // Back off if this URL is still rate-limited.
    const resetsOn = this.rateLimitResetsOn[apiUrl]
    if (resetsOn && resetsOn > new Date()) {
      await new Promise((resolve) => setTimeout(resolve, resetsOn.getTime() - Date.now()))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent || 'ATC-Server/1.0',
          Referer: 'https://globe.airplanes.live',
          Origin: 'https://globe.airplanes.live',
        },
      })
      clearTimeout(timeoutId)

      if (response.status === 429) {
        const rateLimitSeconds = Number(response.headers.get('Retry-After'))
        console.log(`[${new Date().toISOString()}] Backing off for ${rateLimitSeconds} seconds due to rate limit on ${apiUrl}`)
        const resetDate = new Date()
        resetDate.setSeconds(resetDate.getSeconds() + rateLimitSeconds)
        this.rateLimitResetsOn[apiUrl] = resetDate
      }

      if (!response.ok) {
        throw new ProxyError(`API returned ${response.status}`, response.status, {
          status: response.status,
        })
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof ProxyError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProxyError('Request to api.airplanes.live timed out', 504, {
          message: 'The upstream API did not respond within 10 seconds',
        })
      }
      console.error('Error fetching from api.airplanes.live:', error)
      throw new ProxyError('Failed to fetch data from api.airplanes.live', 500, {
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
