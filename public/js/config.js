/**
 * Configuration Module
 * Configurazione frontend
 */

const Config = {
    // Server Configuration
    server: {
        host: window.location.hostname,
        port: 3333,
        templatePort: 8080
    },

    // API Configuration
    api: {
        baseUrl: `${window.location.protocol}//${window.location.hostname}:3333/api`,
        timeout: 30000,
        retryAttempts: 3
    },

    // WebSocket Configuration
    websocket: {
        url: `ws://${window.location.hostname}:3334`,
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