/**
 * CasparCG Configuration
 * Configurazione CasparCG modulare
 */

require('dotenv').config();

const casparConfig = {
    // Connection Settings
    connection: {
        host: process.env.CASPAR_HOST || '100.74.188.128',
        port: process.env.CASPAR_PORT || 5250,
        reconnectInterval: 2000,
        keepAliveInterval: 15000,
        timeout: 30000,
        autoReconnect: true,
        autoReconnectAttempts: -1 // infinite
    },

    // Channel Configuration
    channels: {
        default: 1,
        preview: 2
    },

    // Layer Configuration
    layers: {
        video: 1,
        graphics: 2,
        audio: 3,
        background: 10
    },

    // Sync Settings for A/V
    sync: {
        audioOffsetMs: -100,
        audioDelayMs: 100,
        asyncMode: 1,
        vsyncMode: 'cfr'
    },

    // Command Queue Settings
    queue: {
        maxSize: 100,
        processingDelay: 50,
        retryOnFailure: true,
        maxRetries: 3
    }
};

module.exports = casparConfig;