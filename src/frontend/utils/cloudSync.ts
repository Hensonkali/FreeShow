// Cloud sync is disabled for offline operation.
// All cloud sync functionality has been removed to support offline-only operation.
// The stores (cloudSyncData, driveKeys, driveData, contentProviderData, obsData) remain
// for compatibility but are not populated from any online source.

export function setupCloudSync(_auto: boolean = false) {
    // Cloud sync disabled - no-op
}

export function syncFinished() {
    // No-op
}

export function addToMediaFolder(_path: string) {
    // No-op - media folder management is handled locally
}

export function chooseTeam(_data: any) {
    // Cloud sync disabled - no-op
}

export function socketDisconnect() {
    // Cloud sync disabled - no-op
}

export function syncWithCloud() {
    // Cloud sync disabled - no-op
}

export function isSyncing() {
    return false
}

export function isActiveShowInUseByCloudUser() {
    return false
}

export function getCloudUsers() {
    return []
}

export function changeTeam(_data: any) {
    // Cloud sync disabled - no-op
}

export function updateCloudDeviceName(_name: string) {
    // Cloud sync disabled - no-op
}

export function syncDrive(_autosave: boolean, closeWhenFinished: boolean) {
    // Cloud sync disabled - no-op
    if (closeWhenFinished) {
        // Nothing to do
    }
}
