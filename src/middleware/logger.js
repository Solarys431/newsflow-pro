/**
 * Logger Service
 * Sistema di logging unificato
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class Logger {
    constructor() {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };

        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m'  // Magenta
        };

        this.icons = {
            error: '❌',
            warn: '⚠️',
            info: '📝',
            debug: '🔍'
        };

        this.reset = '\x1b[0m';
        this.logFile = null;

        // Initialize log file if enabled
        if (config.logging.enableFile) {
            this.initializeLogFile();
        }

        // Import DatabaseService lazily to avoid circular dependency
        this.db = null;
        setTimeout(() => {
            this.db = require('../services/DatabaseService');
        }, 100);
    }

    initializeLogFile() {
        const logsDir = path.join(process.cwd(), 'logs');
        fs.ensureDirSync(logsDir);

        const timestamp = new Date().toISOString().split('T')[0];
        this.logFile = path.join(logsDir, `inews-${timestamp}.log`);
    }

    shouldLog(level) {
        const configLevel = this.levels[config.logging.level] || 2;
        const messageLevel = this.levels[level] || 2;
        return messageLevel <= configLevel;
    }

    formatMessage(level, category, message, details = {}) {
        const timestamp = new Date().toISOString();
        const icon = this.icons[level];

        // Console format (with colors)
        const consoleFormat = `${this.colors[level]}${icon} [${timestamp}] [${category.toUpperCase()}] ${message}${this.reset}`;

        // File/Database format (no colors)
        const plainFormat = `[${timestamp}] [${level.toUpperCase()}] [${category.toUpperCase()}] ${message}`;

        return { consoleFormat, plainFormat, timestamp };
    }

    async log(level, category, message, details = {}, userId = null, sessionId = null) {
        if (!this.shouldLog(level)) return;

        const { consoleFormat, plainFormat, timestamp } = this.formatMessage(level, category, message, details);

        // Console logging
        if (config.logging.enableConsole) {
            console.log(consoleFormat);
            if (Object.keys(details).length > 0 && this.shouldLog('debug')) {
                console.log(`   📊 Details:`, details);
            }
        }

        // File logging
        if (config.logging.enableFile && this.logFile) {
            try {
                const logEntry = {
                    timestamp,
                    level,
                    category,
                    message,
                    details,
                    userId,
                    sessionId
                };
                await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n');
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }

        // Database logging
        if (config.logging.enableDatabase && this.db && this.db.initialized) {
            try {
                await this.db.createLog(level, category, message, details, userId, sessionId);
            } catch (error) {
                console.error('Failed to write to database log:', error);
            }
        }
    }

    // Convenience methods
    error(category, message, details = {}, userId = null, sessionId = null) {
        return this.log('error', category, message, details, userId, sessionId);
    }

    warn(category, message, details = {}, userId = null, sessionId = null) {
        return this.log('warn', category, message, details, userId, sessionId);
    }

    info(category, message, details = {}, userId = null, sessionId = null) {
        return this.log('info', category, message, details, userId, sessionId);
    }

    debug(category, message, details = {}, userId = null, sessionId = null) {
        return this.log('debug', category, message, details, userId, sessionId);
    }

    // Express middleware
    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();

            // Log request
            this.info('HTTP', `${req.method} ${req.originalUrl}`, {
                ip: req.ip,
                userAgent: req.get('user-agent')
            });

            // Override res.json to log responses
            const originalJson = res.json;
            res.json = function(data) {
                const duration = Date.now() - startTime;

                // Log response
                Logger.getInstance().info('HTTP', `Response ${res.statusCode} - ${duration}ms`, {
                    method: req.method,
                    url: req.originalUrl,
                    statusCode: res.statusCode,
                    duration
                });

                return originalJson.call(this, data);
            };

            next();
        };
    }

    // Singleton pattern
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
}

module.exports = Logger.getInstance();