/**
 * Database Configuration
 * Configurazione database modulare
 */

require('dotenv').config();

const databaseConfig = {
    // Supabase Configuration
    supabase: {
        url: process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    },

    // PostgreSQL Direct Configuration
    postgres: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 54322,
        database: process.env.DB_NAME || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
    },

    // Connection Settings
    connection: {
        retryAttempts: 5,
        retryDelay: 2000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 1000
    }
};

module.exports = databaseConfig;