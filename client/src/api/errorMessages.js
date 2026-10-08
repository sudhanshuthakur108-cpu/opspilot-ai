// User-facing messages for failures that mean the same thing on every screen. Screens handle
// their own specific cases (wrong password, taken name, ...) before falling back to this.
export function describeRequestError(error) {
  if (error.code === 'NETWORK_ERROR') {
    return 'We couldn’t reach OpsPilot. Check your connection and try again.';
  }
  if (error.status === 429) {
    return 'Too many requests. Wait a moment, then try again.';
  }
  if (error.status === 503) {
    return 'OpsPilot is temporarily unavailable. Please try again shortly.';
  }
  return 'Something went wrong on our side. Please try again.';
}
