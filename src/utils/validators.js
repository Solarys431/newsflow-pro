/**
 * Validators Utility
 * Validatori per dati comuni
 */

/**
 * Validate email address
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate UUID v4
 */
function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validate URL
 */
function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
function isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Validate port number
 */
function isValidPort(port) {
    const portNum = parseInt(port);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
}

/**
 * Validate slug format
 */
function isValidSlug(slug) {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return slugRegex.test(slug);
}

/**
 * Validate file extension
 */
function isValidFileExtension(filename, allowedExtensions) {
    const extension = filename.split('.').pop().toLowerCase();
    return allowedExtensions.includes(`.${extension}`);
}

/**
 * Validate JSON string
 */
function isValidJSON(str) {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate date string
 */
function isValidDate(dateStr) {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

/**
 * Validate time format (HH:MM:SS)
 */
function isValidTime(timeStr) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(timeStr);
}

/**
 * Validate duration format (MM:SS or HH:MM:SS)
 */
function isValidDuration(durationStr) {
    const shortRegex = /^[0-5]?[0-9]:[0-5][0-9]$/;
    const longRegex = /^[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]$/;
    return shortRegex.test(durationStr) || longRegex.test(durationStr);
}

/**
 * Validate CasparCG command
 */
function isValidCasparCommand(command) {
    const validCommands = [
        'PLAY', 'STOP', 'CLEAR', 'LOAD', 'LOADBG',
        'CG', 'MIXER', 'INFO', 'VERSION', 'CLS', 'TLS',
        'ADD', 'REMOVE', 'UPDATE', 'INVOKE', 'CALL'
    ];

    const cmd = command.trim().split(' ')[0].toUpperCase();
    return validCommands.includes(cmd);
}

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-z0-9.-]/gi, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
}

/**
 * Validate and sanitize HTML content
 */
function sanitizeHTML(html) {
    // Remove script tags
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove iframe tags
    html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    // Remove on* event handlers
    html = html.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: protocol
    html = html.replace(/javascript:/gi, '');

    return html;
}

module.exports = {
    isValidEmail,
    isValidUUID,
    isValidURL,
    isValidIP,
    isValidPort,
    isValidSlug,
    isValidFileExtension,
    isValidJSON,
    isValidDate,
    isValidTime,
    isValidDuration,
    isValidCasparCommand,
    sanitizeFilename,
    sanitizeHTML
};