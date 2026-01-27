/**
 * Server Configuration
 * Configurazione server modulare
 */

require('dotenv').config();

const serverConfig = {
    // HTTP Server
    http: {
        port: process.env.PORT || 3333,
        host: process.env.HOST || ''
    },

    // WebSocket Server
    websocket: {
        port: process.env.WS_PORT || 3334,
        heartbeatInterval: 30000,
        reconnectDelay: 5000,
        maxReconnectAttempts: 10
    },

    // Template Server
    template: {
        port: process.env.TEMPLATE_PORT || 8080
    },

    // Environment
    environment: process.env.NODE_ENV || 'development',

    // API Settings
    api: {
        baseUrl: '/api',
        version: 'v1',
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        }
    },

    // Session Configuration
    session: {
        secret: process.env.SESSION_SECRET || '',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    }
};

module.exports = serverConfig;