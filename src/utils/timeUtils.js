/**
 * Time Utilities
 * Utility per gestione tempo e durate
 */

/**
 * Parse duration string to seconds
 * Accepts formats: "MM:SS", "HH:MM:SS", or number
 */
function parseDuration(durationStr) {
    if (typeof durationStr === 'number') return durationStr;

    const str = String(durationStr).trim();

    // Check for HH:MM:SS format
    if (str.includes(':')) {
        const parts = str.split(':').map(p => parseInt(p) || 0);

        if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            // MM:SS
            return parts[0] * 60 + parts[1];
        }
    }

    // Try to parse as number
    return parseInt(str) || 0;
}

/**
 * Format seconds to duration string
 * Returns format: "HH:MM:SS" or "MM:SS"
 */
function formatDuration(seconds, forceHours = false) {
    if (!seconds || seconds < 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0 || forceHours) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Calculate time difference in seconds
 */
function timeDifference(start, end) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return Math.floor((endMs - startMs) / 1000);
}

/**
 * Add seconds to a date
 */
function addSeconds(date, seconds) {
    const newDate = new Date(date);
    newDate.setSeconds(newDate.getSeconds() + seconds);
    return newDate;
}

/**
 * Format date to Italian locale string
 */
function formatDate(date, includeTime = true) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    };

    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        options.hour12 = false;
    }

    return new Date(date).toLocaleString('it-IT', options);
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}

/**
 * Calculate estimated reading time for text
 * Based on average reading speed of 150 words per minute
 */
function estimateReadingTime(text) {
    if (!text) return 0;

    // Estimate words (average 5 characters per word)
    const words = text.length / 5;
    const minutes = words / 150;
    return Math.max(Math.ceil(minutes * 60), 5); // Minimum 5 seconds
}

/**
 * Format milliseconds to timecode (HH:MM:SS:FF)
 */
function formatTimecode(milliseconds, frameRate = 25) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor((milliseconds % 1000) / (1000 / frameRate));

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

/**
 * Parse timecode to milliseconds
 */
function parseTimecode(timecode, frameRate = 25) {
    const parts = timecode.split(':').map(p => parseInt(p) || 0);

    if (parts.length !== 4) {
        throw new Error('Invalid timecode format. Expected HH:MM:SS:FF');
    }

    const [hours, minutes, seconds, frames] = parts;
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const milliseconds = totalSeconds * 1000 + (frames * (1000 / frameRate));

    return milliseconds;
}

/**
 * Sleep/delay function
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    parseDuration,
    formatDuration,
    timeDifference,
    addSeconds,
    formatDate,
    getCurrentTimestamp,
    estimateReadingTime,
    formatTimecode,
    parseTimecode,
    sleep
};