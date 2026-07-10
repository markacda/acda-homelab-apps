import { ValidationError } from '../Exceptions/validation-error.ts';

/**
 * A validated "aircraft near a point" query: latitude, longitude and radius
 * (nautical miles). The factory enforces the airplanes.live bounds, so anything
 * downstream can trust the numbers.
 */
export class PointQuery {
  readonly lat: number;
  readonly lon: number;
  readonly radius: number;

  private constructor(lat: number, lon: number, radius: number) {
    this.lat = lat;
    this.lon = lon;
    this.radius = radius;
  }

  static create(lat: string, lon: string, radius: string): PointQuery {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const radiusNum = parseInt(radius);

    if (isNaN(latNum) || isNaN(lonNum) || isNaN(radiusNum)) {
      throw new ValidationError('Invalid parameters');
    }
    if (latNum <= -90 || latNum >= 90) {
      throw new ValidationError('Latitude must be between -90 and 90');
    }
    if (lonNum <= -180 || lonNum >= 180) {
      throw new ValidationError('Longitude must be between -180 and 180');
    }
    if (radiusNum <= 0 || radiusNum > 250) {
      throw new ValidationError('Radius must be between 1 and 250 nautical miles');
    }
    return new PointQuery(latNum, lonNum, radiusNum);
  }
}
