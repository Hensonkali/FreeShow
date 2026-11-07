// Offline edition: all analytics/telemetry have been removed.
// Every exported function is a no-op kept only so call sites stay unchanged.

export function startTracking() {}

export function trackScriptureUsage(_translationName: string, _apiId: string | null, _verseRef: string) {}
