/**
 * NewsFlow Pro - Configurazione Centralizzata
 * Gestisce tutte le configurazioni del sistema
 */

require('dotenv').config();

const config = {
    // Server Configuration
    server: {
        port: process.env.PORT || 3333,
        wsPort: process.env.WS_PORT || 3334,
        templatePort: process.env.TEMPLATE_PORT || 8080,
        environment: process.env.NODE_ENV || 'development',
        host: process.env.HOST || '100.64.211.9'
    },

    // Database Configuration (Supabase/PostgreSQL)
    database: {
        supabase: {
            url: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
            anonKey: process.env.SUPABASE_ANON_KEY,
            serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        postgres: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: process.env.DB_PORT || 54322,
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres'
        }
    },

    // CasparCG Configuration
    caspar: {
        host: process.env.CASPAR_HOST || '100.74.188.128',
        port: process.env.CASPAR_PORT || 5250,
        reconnectInterval: 2000,
        keepAliveInterval: 15000,
        timeout: 30000,
        autoReconnect: true,
        autoReconnectAttempts: -1 // infinite
    },

    // Media Configuration
    media: {
        uploadPath: './media',
        templatesPath: './templates',
        publicPath: './public',
        maxFileSize: 500 * 1024 * 1024, // 500MB
        allowedVideoTypes: ['.mp4', '.mov', '.avi', '.mkv'],
        allowedAudioTypes: ['.wav', '.mp3', '.aiff', '.flac'],
        allowedImageTypes: ['.png', '.jpg', '.jpeg', '.gif'],
        allowedTemplateTypes: ['.html', '.spx']
    },

    // FTP Configuration for CasparCG Media Upload
    ftp: {
        enabled: process.env.FTP_ENABLED !== 'false', // enabled by default
        host: process.env.FTP_HOST || process.env.CASPAR_HOST || '100.74.188.128',
        port: parseInt(process.env.FTP_PORT || '21'),
        user: process.env.FTP_USER || 'casparcg',
        password: process.env.FTP_PASSWORD || '',
        secure: process.env.FTP_SECURE === 'true',
        mediaPath: process.env.FTP_MEDIA_PATH || '/media/',
        timeout: 30000, // 30 seconds
        maxRetries: 3,
        verbose: process.env.NODE_ENV === 'development'
    },

    // WebSocket Configuration
    websocket: {
        heartbeatInterval: 30000,
        reconnectDelay: 5000,
        maxReconnectAttempts: 10
    },

    // Sync Configuration (Audio/Video)
    sync: {
        audioOffsetMs: -100,
        audioDelayMs: 100,
        asyncMode: 1,
        vsyncMode: 'cfr'
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableConsole: true,
        enableDatabase: true,
        enableFile: process.env.NODE_ENV === 'production'
    },

    // Security Configuration
    security: {
        enableAuth: process.env.ENABLE_AUTH === 'true',
        jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
        sessionTimeout: 3600000, // 1 hour
        maxLoginAttempts: 5
    },

    // API Configuration
    api: {
        baseUrl: process.env.API_BASE_URL || '/api',
        version: 'v1',
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        }
    }
};

// Validation
function validateConfig() {
    const errors = [];

    if (!config.database.supabase.serviceKey && !config.database.postgres.password) {
        errors.push('Database configuration missing: Set either Supabase keys or PostgreSQL credentials');
    }

    if (config.security.enableAuth && !config.security.jwtSecret) {
        errors.push('JWT secret is required when authentication is enabled');
    }

    if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(error => console.error(`  - ${error}`));
        if (config.server.environment === 'production') {
            process.exit(1);
        }
    }
}

// Validate on load
validateConfig();

module.exports = config;