/**
 * What to tell someone when their device could not say where they are. The browser's own wording is for developers; the
 * codes are the standard ones (1 permission denied, 2 position unavailable, 3 timed out).
 */
export function geolocationMessage(code: number | null | undefined): string {
  if (code === 1) {
    return "We can't see where you are. You can allow location for this site in your browser's settings, or carry on from home.";
  }
  if (code === 3) return "Finding where you are took too long. Please try again, or carry on from home.";
  return "We couldn't work out where you are just now. Please try again, or carry on from home.";
}

export const GEOLOCATION_UNSUPPORTED = "This device can't tell us where it is. You can carry on from home.";
