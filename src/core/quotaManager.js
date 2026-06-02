/**
 * Storage quota utilities for IndexedDB/Web Storage quota management.
 */

const SAFETY_BUFFER = 5 * 1024 * 1024; // 5MB buffer

/**
 * Get current storage usage estimate.
 * @returns {Promise<{ usage: number, quota: number, percentUsed: number }>}
 */
export async function getStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) {
        return { usage: 0, quota: 0, percentUsed: 0 };
    }
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
    return { usage, quota, percentUsed };
}

/**
 * Check if a new file can be stored without exceeding quota.
 * @param {number} sizeBytes - Size of the new file in bytes
 * @returns {Promise<{ ok: boolean, reason?: string, percentAfter: number }>}
 */
export async function canStoreBook(sizeBytes) {
    const { usage, quota, percentUsed } = await getStorageEstimate();

    if (quota === 0) {
        // Storage API not available — allow with a warning
        return { ok: true, percentAfter: 0 };
    }

    const afterUsage = usage + sizeBytes + SAFETY_BUFFER;
    const percentAfter = (afterUsage / quota) * 100;

    if (afterUsage > quota) {
        return {
            ok: false,
            reason: `Storage is ${percentUsed.toFixed(0)}% full. This book (${formatBytes(sizeBytes)}) won't fit.`,
            percentAfter
        };
    }

    if (percentAfter > 80) {
        return {
            ok: true,
            reason: `Storage will be ${percentAfter.toFixed(0)}% full after import. Consider removing old books.`,
            percentAfter
        };
    }

    return { ok: true, percentAfter };
}

/**
 * Get a user-friendly quota warning message.
 * @returns {Promise<string|null>}
 */
export async function getQuotaWarning() {
    const { percentUsed } = await getStorageEstimate();
    if (percentUsed > 90) return 'Storage is almost full! Delete unused books to free up space.';
    if (percentUsed > 75) return 'Storage is getting low. Consider cleaning up old books.';
    return null;
}

/**
 * Check if a DOMException is a quota-related error.
 * @param {Error} error
 * @returns {boolean}
 */
export function isQuotaError(error) {
    if (!error) return false;
    const msg = (error.message || error.toString()).toLowerCase();
    return msg.includes('quota') ||
        msg.includes('quotaexceedederror') ||
        msg.includes('exceeded the storage quota') ||
        msg.includes('no space') ||
        (error.name && error.name === 'QuotaExceededError');
}

/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
