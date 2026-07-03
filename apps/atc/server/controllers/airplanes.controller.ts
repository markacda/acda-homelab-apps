import { Request, Response } from 'express';

interface RouteParams {
  lat: string;
  lon: string;
  radius: string;
}

interface ErrorResponse {
  error: string;
  status?: number;
  message?: string;
}

export const getAirplanes = async (
  req: Request<RouteParams>,
  res: Response
): Promise<void> => {
  const { lat, lon, radius } = req.params;

  // Validate parameters
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const radiusNum = parseInt(radius);

  if (isNaN(latNum) || isNaN(lonNum) || isNaN(radiusNum)) {
    res.status(400).json({ error: 'Invalid parameters' } as ErrorResponse);
    return;
  }

  if (latNum <= -90 || latNum >= 90) {
    res.status(400).json({ error: 'Latitude must be between -90 and 90' } as ErrorResponse);
    return;
  }

  if (lonNum <= -180 || lonNum >= 180) {
    res.status(400).json({ error: 'Longitude must be between -180 and 180' } as ErrorResponse);
    return;
  }

  if (radiusNum <= 0 || radiusNum > 250) {
    res.status(400).json({ error: 'Radius must be between 1 and 250 nautical miles' } as ErrorResponse);
    return;
  }

  const apiUrl = `https://api.airplanes.live/v2/point/${latNum}/${lonNum}/${radiusNum}`;
  await apiCallToAirplanesLive(apiUrl, req.get('User-Agent'), res);
};

export const getGlobeAirplanesLive = async (
  req: Request,
  res: Response
): Promise<void> => {
  const path = req.params[0]; // Get the wildcard path
  const apiUrl = `https://globe.airplanes.live/${path}`;
  console.log(`[${new Date().toISOString()}] Fetching ${apiUrl}`);
  await apiCallToAirplanesLive(apiUrl, req.get('User-Agent'), res);
};

// Track consecutive 429 responses for fibonacci backoff
const rateLimitResetsOn: { [url: string] : Date } = {}

const apiCallToAirplanesLive = async (apiUrl: string, userAgent: string | undefined, res: Response) => {
  // Backoff if rate-limited
  if (rateLimitResetsOn[apiUrl] && rateLimitResetsOn[apiUrl] > new Date()) {
    await new Promise(resolve => setTimeout(resolve, rateLimitResetsOn[apiUrl].getTime() - new Date().getTime()));
  }

  // Set up timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent || 'ATC-Server/1.0',
        'Referer': 'https://globe.airplanes.live',
        'Origin': 'https://globe.airplanes.live'
      }
    });

    clearTimeout(timeoutId); // Clear timeout on a successful response

    // Track response status
    if (response.status === 429) {
      const rateLimitSeconds = Number(response.headers.get('Retry-After'))!;
      console.log(`[${new Date().toISOString()}] Backing off for ${rateLimitSeconds} seconds due to rate limit on ${apiUrl}`);

      const rateLimitResetDate = new Date();
      rateLimitResetDate.setSeconds(rateLimitResetDate.getSeconds() + rateLimitSeconds!);
      rateLimitResetsOn[apiUrl] = rateLimitResetDate;
    }

    if (!response.ok) {
      // Forward the error status
      res.status(response.status).json({
        error: `API returned ${response.status}`,
        status: response.status
      } as ErrorResponse);
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    clearTimeout(timeoutId); // Clear timeout on error

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      res.status(504).json({
        error: 'Request to api.airplanes.live timed out',
        message: 'The upstream API did not respond within 10 seconds'
      } as ErrorResponse);
      return;
    }

    console.error('Error fetching from api.airplanes.live:', error);
    res.status(500).json({
      error: 'Failed to fetch data from api.airplanes.live',
      message: error instanceof Error ? error.message : 'Unknown error'
    } as ErrorResponse);
  }
}
