/**
 * NewsFlow Pro - Main Application
 * Enterprise broadcast newsroom with modular architecture
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const config = require('./config');

// Services
const DatabaseService = require('./services/DatabaseService');
const CasparService = require('./services/CasparService');
const WebSocketService = require('./services/WebSocketService');

// Middleware
const Logger = require('./middleware/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Controllers
const storiesController = require('./controllers/stories');
const rundownController = require('./controllers/rundown');
const automationController = require('./controllers/automation');
const mediaController = require('./controllers/media');

class Application {
    constructor() {
        this.app = express();
        this.server = null;
        this.templateServer = null;
        this.isShuttingDown = false;
    }

    async initialize() {
        try {
            Logger.info('SYSTEM', '🚀 Starting NewsFlow Pro System...');

            // Ensure directories exist
            await this.ensureDirectories();

            // Initialize services
            await this.initializeServices();

            // Setup middleware
            this.setupMiddleware();

            // Setup routes
            this.setupRoutes();

            // Setup error handling
            this.setupErrorHandling();

            // Setup template server
            await this.setupTemplateServer();

            // Setup graceful shutdown
            this.setupGracefulShutdown();

            Logger.info('SYSTEM', '✅ Application initialized successfully');
        } catch (error) {
            Logger.error('SYSTEM', 'Failed to initialize application', { error: error.message });
            throw error;
        }
    }

    async ensureDirectories() {
        const dirs = [
            config.media.uploadPath,
            config.media.templatesPath,
            config.media.publicPath,
            './logs'
        ];

        for (const dir of dirs) {
            await fs.ensureDir(dir);
        }

        Logger.info('SYSTEM', 'Directories verified');
    }

    async initializeServices() {
        // Initialize database
        await DatabaseService.initialize();

        // Initialize CasparCG
        try {
            await CasparService.connect();

            // Setup CasparCG event handlers
            CasparService.on('connected', () => {
                WebSocketService.broadcast({
                    type: 'caspar_status',
                    status: 'connected',
                    timestamp: new Date().toISOString()
                });
            });

            CasparService.on('disconnected', () => {
                WebSocketService.broadcast({
                    type: 'caspar_status',
                    status: 'disconnected',
                    timestamp: new Date().toISOString()
                });
            });
        } catch (error) {
            Logger.warn('SYSTEM', 'CasparCG connection failed, will retry', { error: error.message });
        }

        // Note: WebSocket initialization moved to start() method to support HTTP upgrade

        // Setup WebSocket event handlers
        WebSocketService.on('clientConnected', (client) => {
            Logger.info('WEBSOCKET', `Client ${client.id} connected from ${client.ip}`);
        });

        WebSocketService.on('message', ({ clientId, data }) => {
            Logger.debug('WEBSOCKET', `Message from client ${clientId}`, data);
        });
    }

    setupMiddleware() {
        // CORS
        this.app.use(cors({
            origin: true,
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Logging
        this.app.use(Logger.middleware());

        // Static files
        this.app.use('/media', express.static(config.media.uploadPath));
        this.app.use('/templates', express.static(config.media.templatesPath));
        this.app.use(express.static(config.media.publicPath));

        Logger.info('SYSTEM', 'Middleware configured');
    }

    setupRoutes() {
        const router = express.Router();

        // Health check
        router.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: {
                    database: DatabaseService.initialized ? 'connected' : 'disconnected',
                    caspar: CasparService.isConnected() ? 'connected' : 'disconnected',
                    websocket: `${WebSocketService.clients.size} clients`,
                    templateServer: this.templateServer ? 'running' : 'stopped'
                },
                version: '2.1.0',
                environment: config.server.environment
            });
        });

        // Mount controllers
        router.use('/stories', storiesController);
        router.use('/rundown', rundownController);
        router.use('/automation', automationController);
        router.use('/media', mediaController);

        // CasparCG endpoints
        router.get('/caspar/test', async (req, res, next) => {
            try {
                if (!CasparService.isConnected()) {
                    return res.status(503).json({
                        connected: false,
                        error: 'Not connected to CasparCG server',
                        config: {
                            host: config.caspar.host,
                            port: config.caspar.port
                        }
                    });
                }

                const version = await CasparService.getVersion();
                const info = await CasparService.getInfo();

                res.json({
                    connected: true,
                    version: version,
                    info: info,
                    config: {
                        host: config.caspar.host,
                        port: config.caspar.port
                    }
                });
            } catch (error) {
                next(error);
            }
        });

        router.post('/caspar/reconnect', async (req, res, next) => {
            try {
                Logger.info('CASPAR', 'Manual reconnection requested');

                // Disconnect if already connected
                if (CasparService.isConnected()) {
                    await CasparService.disconnect();
                }

                // Attempt reconnection
                await CasparService.connect();

                res.json({
                    success: true,
                    message: 'CasparCG reconnection successful',
                    connected: CasparService.isConnected(),
                    config: {
                        host: config.caspar.host,
                        port: config.caspar.port
                    }
                });
            } catch (error) {
                Logger.error('CASPAR', 'Manual reconnection failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: 'Reconnection failed: ' + error.message,
                    config: {
                        host: config.caspar.host,
                        port: config.caspar.port
                    }
                });
            }
        });

        router.post('/caspar/command', async (req, res, next) => {
            try {
                if (!CasparService.isConnected()) {
                    return res.status(503).json({
                        error: 'CasparCG not connected'
                    });
                }

                const { command, channel, layer, file, template } = req.body;
                let result;

                switch (command.toUpperCase()) {
                    case 'PLAY':
                        result = await CasparService.playVideo(channel, layer, file);
                        break;
                    case 'STOP':
                        result = await CasparService.stopVideo(channel, layer);
                        break;
                    case 'CLEAR':
                        result = await CasparService.clearLayer(channel, layer);
                        break;
                    case 'CG_ADD':
                        const templateUrl = `http://${config.server.host}:${config.server.templatePort}/template/${template}`;
                        result = await CasparService.loadTemplate(channel, layer, templateUrl, true);
                        break;
                    case 'CG_REMOVE':
                        result = await CasparService.removeTemplate(channel, layer);
                        break;
                    default:
                        result = await CasparService.sendCommand(req.body.raw_command || command);
                }

                res.json({
                    success: true,
                    command: command,
                    result: result
                });
            } catch (error) {
                next(error);
            }
        });

        // WebSocket stats
        router.get('/websocket/stats', (req, res) => {
            res.json(WebSocketService.getStats());
        });

        // System logs
        router.get('/logs', async (req, res, next) => {
            try {
                const logs = await DatabaseService.getLogs(req.query);
                res.json(logs);
            } catch (error) {
                next(error);
            }
        });

        // Template proxy endpoints (for Cloudflare Tunnel compatibility)
        // Serve templates on main port to avoid :8080 issues
        router.get('/template/:filename', (req, res, next) => {
            const filename = req.params.filename;
            const templatePath = path.join(config.media.templatesPath, filename);

            if (fs.existsSync(templatePath)) {
                res.sendFile(path.resolve(templatePath));
            } else {
                res.status(404).json({ error: 'Template not found', filename });
            }
        });

        // Mount router
        this.app.use(config.api.baseUrl, router);

        // Also mount template endpoint at root level (non-API path)
        this.app.get('/template/:filename', (req, res) => {
            const filename = req.params.filename;
            const templatePath = path.join(config.media.templatesPath, filename);

            if (fs.existsSync(templatePath)) {
                res.sendFile(path.resolve(templatePath));
            } else {
                res.status(404).send('Template not found');
            }
        });

        Logger.info('SYSTEM', 'Routes configured');
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use(notFound);

        // Error handler
        this.app.use(errorHandler);
    }

    async setupTemplateServer() {
        const templateApp = express();

        templateApp.use(cors());
        templateApp.use('/templates', express.static(config.media.templatesPath));

        // Renderer endpoint
        templateApp.get('/renderer', (req, res) => {
            const { width = 1920, height = 1080, layers = 1 } = req.query;

            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NewsFlow Pro Renderer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            width: ${width}px;
            height: ${height}px;
            background: transparent;
            overflow: hidden;
        }
        .template-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div id="renderer">
        ${Array.from({length: layers}, (_, i) =>
            `<div class="template-layer" id="layer-${i}"></div>`
        ).join('')}
    </div>
    <script>
        console.log('📺 NewsFlow Pro Renderer loaded');
        window.play = function() { console.log('▶️ Play'); };
        window.stop = function() { console.log('⏹️ Stop'); };
        window.update = function(data) { console.log('🔄 Update:', data); };
    </script>
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        });

        // Template file serving
        templateApp.get('/template/:filename', (req, res) => {
            const filename = req.params.filename;
            const templatePath = path.join(config.media.templatesPath, filename);

            if (fs.existsSync(templatePath)) {
                res.sendFile(path.resolve(templatePath));
            } else {
                res.status(404).send('Template not found');
            }
        });

        // Start template server
        this.templateServer = templateApp.listen(config.server.templatePort, () => {
            Logger.info('SYSTEM', `🎨 Template server running on port ${config.server.templatePort}`);
        });
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            Logger.info('SYSTEM', `🛑 Received ${signal}, shutting down gracefully...`);

            // Stop accepting new connections
            if (this.server) {
                this.server.close(() => {
                    Logger.info('SYSTEM', 'HTTP server closed');
                });
            }

            if (this.templateServer) {
                this.templateServer.close(() => {
                    Logger.info('SYSTEM', 'Template server closed');
                });
            }

            // Cleanup services
            await WebSocketService.stop();
            await CasparService.disconnect();
            await DatabaseService.close();

            Logger.info('SYSTEM', '✅ Graceful shutdown complete');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ UNCAUGHT EXCEPTION:', error);
            Logger.error('SYSTEM', 'Uncaught exception', { error: error.message, stack: error.stack });
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ UNHANDLED REJECTION:', reason);
            Logger.error('SYSTEM', 'Unhandled rejection', { reason, promise });
        });
    }

    async start() {
        await this.initialize();

        // Create HTTP server first
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(config.server.port, async () => {
                try {
                    Logger.info('SYSTEM', '🚀 NewsFlow Pro System started');
                    Logger.info('SYSTEM', `📡 HTTP Server: http://${config.server.host}:${config.server.port}`);

                    // Initialize WebSocket - use HTTP upgrade for Cloudflare Tunnel compatibility
                    const useHttpUpgrade = process.env.USE_WS_UPGRADE === 'true' || process.env.NODE_ENV === 'production';

                    if (useHttpUpgrade) {
                        // Production mode: WebSocket on same HTTP server
                        await WebSocketService.start({ server: this.server });
                        Logger.info('SYSTEM', `📡 WebSocket: HTTP upgrade on same port (path: /ws)`);
                    } else {
                        // Development mode: WebSocket on separate port
                        await WebSocketService.start({ port: config.server.wsPort });
                        Logger.info('SYSTEM', `📡 WebSocket Server: ws://${config.server.host}:${config.server.wsPort}`);
                    }

                    Logger.info('SYSTEM', `🎨 Template Server: http://${config.server.host}:${config.server.templatePort}`);
                    Logger.info('SYSTEM', `🎬 CasparCG Target: ${config.caspar.host}:${config.caspar.port}`);
                    Logger.info('SYSTEM', '✅ System ready for production!');

                    resolve();
                } catch (error) {
                    Logger.error('SYSTEM', 'Failed to start WebSocket service', { error: error.message });
                    reject(error);
                }
            });

            this.server.on('error', (error) => {
                Logger.error('SYSTEM', 'HTTP server error', { error: error.message });
                reject(error);
            });
        });
    }
}

module.exports = Application;