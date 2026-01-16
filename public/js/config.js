/**
 * Configuration Module
 * Configurazione frontend
 */

const Config = {
    // Server Configuration
    server: {
        host: window.location.hostname,
        port: window.location.port || (window.location.protocol === 'https:' ? 443 : 3333),
        templatePort: (() => {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
            // Use port 8080 only for localhost, otherwise use same port as app
            return isLocal ? 8080 : (window.location.port || (window.location.protocol === 'https:' ? 443 : 3333));
        })(),
        // Template base URL for iframe loading
        templateBaseUrl: (() => {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
            if (isLocal) {
                // Local: use separate template server on port 8080
                return `http://${window.location.hostname}:8080`;
            } else {
                // Production/Tunnel: use same host/port as main app
                return `${window.location.protocol}//${window.location.host}`;
            }
        })()
    },

    // API Configuration
    api: {
        // Use relative URLs for compatibility with Cloudflare Tunnel
        baseUrl: window.location.hostname === 'localhost' || window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
            ? `${window.location.protocol}//${window.location.hostname}:3333/api`  // Local development
            : `${window.location.protocol}//${window.location.host}/api`,           // Production/Tunnel
        timeout: 30000,
        retryAttempts: 3
    },

    // WebSocket Configuration
    websocket: {
        // Use wss:// for HTTPS, ws:// for HTTP. Use same host as page.
        url: (() => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);

            if (isLocal) {
                // Local development - use separate WebSocket port
                return `ws://${window.location.hostname}:3334`;
            } else {
                // Production/Tunnel - WebSocket on same host/port via HTTP upgrade
                return `${wsProtocol}//${window.location.host}/ws`;
            }
        })(),
        reconnectDelay: 5000,
        maxReconnectAttempts: 10
    },

    // UI Configuration
    ui: {
        notificationDuration: 3000,
        autoSaveInterval: 30000,
        refreshInterval: 60000
    },

    // Locale Configuration
    locale: {
        language: 'it-IT',
        dateFormat: {
            short: { day: '2-digit', month: '2-digit', year: 'numeric' },
            long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
            time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
        }
    }
};