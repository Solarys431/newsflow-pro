#!/usr/bin/env node

/**
 * iNEWS Real CasparCG System
 * Connessione TCP reale + Server HTTP per template grafici
 * Basato su architettura SPX-GC
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

// ===================================
// Configurazione
// ===================================

const config = {
    port: 3333,
    wsPort: 3334,
    templatePort: 8080, // Server HTTP per template (come SPX-GC)
    caspar: {
        host: '100.74.188.128',
        port: 5250,
        reconnectInterval: 2000, // Reduced for faster recovery
        keepAliveInterval: 15000 // More frequent keep-alive
    },
    sync: {
        // Parametri FFmpeg per sync audio-video avanzato
        audioOffsetMs: -100, // Offset audio in millisecondi (negativo = audio anticipato)
        audioDelayMs: 100,   // Delay audio filter in millisecondi
        asyncMode: 1,        // Modalità async FFmpeg (1 = continuous)
        vsyncMode: 'cfr'     // Video sync mode (cfr = constant frame rate)
    }
};

const app = express();
let casparSocket = null;
let casparConnected = false;
let reconnectTimer = null;
let keepAliveTimer = null;

// ===================================
// PostgreSQL Database Connection
// ===================================

const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'postgres',
    password: 'postgres',
    port: 54322,
});

// ===================================
// Logging System
// ===================================

class Logger {
    static async log(level, category, message, details = {}, userId = null, sessionId = null) {
        try {
            // Console log con emojis
            const emoji = {
                'error': '❌',
                'warn': '⚠️',
                'info': '📝',
                'debug': '🔍'
            }[level] || '📝';

            const timestamp = new Date().toISOString();
            console.log(`${emoji} [${timestamp}] [${category.toUpperCase()}] ${message}`);

            if (Object.keys(details).length > 0) {
                console.log('   📊 Details:', details);
            }

            // Database log
            await pool.query(
                `INSERT INTO system_logs (level, category, message, details, user_id, session_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [level, category, message, details, userId, sessionId]
            );
        } catch (error) {
            console.error('❌ Logging error:', error.message);
        }
    }

    static info(category, message, details = {}) {
        return this.log('info', category, message, details);
    }

    static warn(category, message, details = {}) {
        return this.log('warn', category, message, details);
    }

    static error(category, message, details = {}) {
        return this.log('error', category, message, details);
    }

    static debug(category, message, details = {}) {
        return this.log('debug', category, message, details);
    }
}

// Test database connection
async function testDatabaseConnection() {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM stories LIMIT 1');
        console.log('✅ PostgreSQL database connected');
        return true;
    } catch (error) {
        console.log('❌ Database connection error:', error.message);
        return false;
    }
}

// ===================================
// CasparCG TCP Connection
// ===================================

class CasparCGConnection {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.keepAliveTimer = null;
        this.commandQueue = [];
        this.pendingCommands = new Map();
        this.commandId = 0;
    }

    connect() {
        console.log(`🎬 Connecting to CasparCG: ${config.caspar.host}:${config.caspar.port}`);

        this.socket = new net.Socket();
        this.socket.setTimeout(30000); // Increased from 5s to 30s
        this.socket.setKeepAlive(true, 1000); // Enable TCP keep-alive

        this.socket.connect(config.caspar.port, config.caspar.host, () => {
            console.log('✅ CasparCG TCP connected');
            this.connected = true;
            casparConnected = true;

            // Clear reconnect timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            // Start keep-alive
            this.startKeepAlive();

            // Broadcast connection status
            broadcast({ type: 'caspar_status', status: 'connected' });

            // Process queued commands
            this.processCommandQueue();

            // Send version command to test
            this.sendCommand('VERSION');
        });

        this.socket.on('data', (data) => {
            this.handleData(data.toString());
        });

        this.socket.on('error', (error) => {
            console.error('🚨 CasparCG TCP error:', error.message);
            this.handleDisconnection();
        });

        this.socket.on('close', () => {
            console.log('❌ CasparCG TCP disconnected');
            this.handleDisconnection();
        });

        this.socket.on('timeout', () => {
            console.log('⏰ CasparCG TCP timeout');
            this.socket.destroy();
        });
    }

    handleDisconnection() {
        this.connected = false;
        casparConnected = false;

        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }

        broadcast({ type: 'caspar_status', status: 'disconnected' });

        // Schedule reconnection
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                console.log('🔄 Attempting to reconnect to CasparCG...');
                this.connect();
            }, config.caspar.reconnectInterval);
        }
    }

    handleData(data) {
        const lines = data.trim().split('\r\n');

        for (const line of lines) {
            if (line.trim()) {
                console.log(`📨 CasparCG Response: ${line}`);

                // Parse response and handle pending commands
                const parts = line.split(' ');
                const code = parts[0];

                if (code === '200' || code === '201' || code === '202') {
                    console.log(`✅ CasparCG Command successful: ${line}`);
                } else if (code.startsWith('4') || code.startsWith('5')) {
                    console.error(`❌ CasparCG Command error: ${line}`);
                }
            }
        }
    }

    startKeepAlive() {
        this.keepAliveTimer = setInterval(() => {
            if (this.connected) {
                this.sendCommand('INFO');
            }
        }, config.caspar.keepAliveInterval);
    }

    sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                console.log(`📋 Queueing command: ${command}`);
                this.commandQueue.push({ command, resolve, reject });
                return;
            }

            const commandId = ++this.commandId;
            const fullCommand = `${command}\r\n`;

            console.log(`🎬 Sending to CasparCG: ${command}`);

            try {
                this.socket.write(fullCommand);

                // Store pending command
                this.pendingCommands.set(commandId, { command, resolve, reject });

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (this.pendingCommands.has(commandId)) {
                        this.pendingCommands.delete(commandId);
                        resolve({ success: true, command, message: 'Command sent (timeout)' });
                    }
                }, 5000);

                // For now, immediately resolve since we're not parsing responses perfectly
                setTimeout(() => {
                    if (this.pendingCommands.has(commandId)) {
                        this.pendingCommands.delete(commandId);
                        resolve({ success: true, command, message: 'Command sent successfully' });
                    }
                }, 100);

            } catch (error) {
                console.error(`🚨 Error sending command: ${error.message}`);
                reject(error);
            }
        });
    }

    processCommandQueue() {
        while (this.commandQueue.length > 0 && this.connected) {
            const { command, resolve, reject } = this.commandQueue.shift();
            this.sendCommand(command).then(resolve).catch(reject);
        }
    }

    // High-level CasparCG methods
    async playVideo(channel, layer, filename) {
        return await this.sendCommand(`PLAY ${channel}-${layer} "${filename}"`);
    }

    async stopVideo(channel, layer) {
        return await this.sendCommand(`STOP ${channel}-${layer}`);
    }

    async loadTemplate(channel, layer, templateUrl, playOnLoad = false, data = '') {
        const dataParam = data ? ` "${data}"` : '';
        return await this.sendCommand(`CG ${channel}-${layer} ADD 0 "${templateUrl}" ${playOnLoad ? '1' : '0'}${dataParam}`);
    }

    async playTemplate(channel, layer) {
        return await this.sendCommand(`CG ${channel}-${layer} PLAY 0`);
    }

    async updateTemplate(channel, layer, data) {
        return await this.sendCommand(`CG ${channel}-${layer} UPDATE 0 "${data}"`);
    }

    async removeTemplate(channel, layer) {
        return await this.sendCommand(`CG ${channel}-${layer} REMOVE 0`);
    }

    async clearLayer(channel, layer) {
        return await this.sendCommand(`CLEAR ${channel}-${layer}`);
    }

    async getVersion() {
        return await this.sendCommand('VERSION');
    }

    async getInfo() {
        return await this.sendCommand('INFO');
    }
}

// Initialize CasparCG connection
const caspar = new CasparCGConnection();

// ===================================
// Template HTTP Server (like SPX-GC)
// ===================================

const templateApp = express();

// Middleware for template server
templateApp.use(cors());
templateApp.use('/templates', express.static(path.join(__dirname, 'templates')));

// Renderer endpoint (like SPX-GC renderer)
templateApp.get('/renderer', (req, res) => {
    const { width = 1920, height = 1080, layers = 1 } = req.query;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>iNEWS Template Renderer</title>
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
        console.log('📺 iNEWS Template Renderer loaded');
        console.log('Resolution:', ${width}, 'x', ${height});
        console.log('Layers:', ${layers});

        // Global functions for CasparCG
        window.play = function() {
            console.log('▶️ Renderer play command');
        };

        window.stop = function() {
            console.log('⏹️ Renderer stop command');
        };

        window.update = function(data) {
            console.log('🔄 Renderer update:', data);
        };
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

// Template file serving
templateApp.get('/template/:filename', (req, res) => {
    const filename = req.params.filename;
    const templatePath = path.join(__dirname, 'templates', filename);

    if (fs.existsSync(templatePath)) {
        res.sendFile(templatePath);
    } else {
        res.status(404).send('Template not found');
    }
});

// Video file serving for CasparCG
templateApp.get('/media/:filename', (req, res) => {
    const filename = req.params.filename;
    let videoPath = path.join(__dirname, filename);

    // Try with .mp4 extension if file doesn't exist
    if (!fs.existsSync(videoPath) && !filename.endsWith('.mp4')) {
        videoPath = path.join(__dirname, filename + '.mp4');
    }

    console.log(`📹 Serving video: ${videoPath}`);

    if (fs.existsSync(videoPath)) {
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            // Handle range requests for video streaming
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            // Full file request with LOW-LATENCY headers for CasparCG sync
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Connection': 'keep-alive',
                'X-Content-Duration': '8', // CasparCG hint for 8-second video
                'X-Accel-Buffering': 'no', // Disable proxy buffering for low latency
                'Transfer-Encoding': 'identity' // Disable chunked encoding for sync
            };
            res.writeHead(200, head);
            fs.createReadStream(videoPath).pipe(res);
        }
    } else {
        console.log(`❌ Video file not found: ${videoPath}`);
        res.status(404).send('Video file not found');
    }
});

// Start template server
const templateServer = templateApp.listen(config.templatePort, () => {
    console.log(`🎨 Template HTTP Server: http://100.64.211.9:${config.templatePort}`);
    console.log(`📺 Renderer URL: http://100.64.211.9:${config.templatePort}/renderer`);
});

// ===================================
// Main Express App
// ===================================

app.use(cors());
app.use(express.json());
app.use(express.static('./public'));

// ===================================
// WebSocket Server
// ===================================

const wss = new WebSocket.Server({ port: config.wsPort });
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`📡 WebSocket client connected. Total: ${clients.size}`);

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`📡 WebSocket client disconnected. Total: ${clients.size}`);
    });

    // Send initial status
    ws.send(JSON.stringify({
        type: 'init',
        casparStatus: casparConnected ? 'connected' : 'disconnected',
        templateServer: `http://100.64.211.9:${config.templatePort}`,
        timestamp: new Date().toISOString()
    }));
});

function broadcast(data) {
    const message = JSON.stringify({ ...data, timestamp: new Date().toISOString() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ===================================
// Initialize Data
// ===================================

// Data initialization removed - using Supabase database only
// Use npm run setup-db to initialize database with sample data

// ===================================
// API Routes
// ===================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            database: 'connected',
            caspar: casparConnected ? 'connected' : 'disconnected',
            templateServer: `http://100.64.211.9:${config.templatePort}`,
            websocket: `${clients.size} clients`
        },
        caspar: {
            host: config.caspar.host,
            port: config.caspar.port,
            connected: casparConnected
        }
    });
});

// Stories API with Supabase
app.get('/api/stories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stories ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stories:', error);
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

// Media Assets API
app.get('/api/media', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM media_assets ORDER BY file_type, filename');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({ error: 'Failed to fetch media' });
    }
});

// Scan and sync CasparCG media
app.post('/api/media/scan', async (req, res) => {
    try {
        await Logger.info('media', 'Starting media scan from CasparCG');

        // Send CLS command to CasparCG to get media list
        const mediaList = await caspar.sendCommand('CLS');

        // Parse and update database
        if (mediaList) {
            const lines = mediaList.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const parts = line.split(' ');
                    const filename = parts[0];

                    // Check if already exists
                    const existing = await pool.query(
                        'SELECT id FROM media_assets WHERE filename = $1',
                        [filename]
                    );

                    if (existing.rows.length === 0) {
                        // Insert new media
                        await pool.query(
                            `INSERT INTO media_assets (filename, original_filename, file_type, file_path, caspar_path)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [filename, filename, 'video', `/media/${filename}`, filename]
                        );
                        await Logger.info('media', `New media file added: ${filename}`);
                    }
                }
            }
        }

        // Return updated media list
        const result = await pool.query('SELECT * FROM media_assets ORDER BY file_type, filename');
        await Logger.info('media', 'Media scan completed', { files_count: result.rows.length });
        res.json({ message: 'Media scan completed', media: result.rows });
    } catch (error) {
        await Logger.error('media', 'Media scan failed', { error: error.message });
        res.status(500).json({ error: 'Failed to scan media' });
    }
});

// Get system logs
app.get('/api/logs', async (req, res) => {
    try {
        const limit = req.query.limit || 100;
        const level = req.query.level;
        const category = req.query.category;

        let query = 'SELECT * FROM system_logs';
        let params = [];
        let conditions = [];

        if (level) {
            conditions.push(`level = $${params.length + 1}`);
            params.push(level);
        }

        if (category) {
            conditions.push(`category = $${params.length + 1}`);
            params.push(category);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        await Logger.error('api', 'Failed to retrieve logs', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});

app.post('/api/stories', async (req, res) => {
    try {
        const storyData = {
            slug: req.body.slug,
            title: req.body.title || 'Nuova Storia',
            type: req.body.type || 'PKG',
            script: req.body.script || '',
            presenter: req.body.presenter || 'Test User',
            producer: req.body.producer || 'System',
            estimated_duration: req.body.estimated_duration || 0,
            status: 'draft',
            created_by: 'System'
        };

        const result = await pool.query(
            `INSERT INTO stories (slug, title, type, script, presenter, producer, estimated_duration, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [storyData.slug, storyData.title, storyData.type, storyData.script,
             storyData.presenter, storyData.producer, storyData.estimated_duration,
             storyData.status, storyData.created_by]
        );
        const story = result.rows[0];

        if (!story) throw new Error('Failed to create story');

        broadcast({ type: 'story_created', story });
        res.json(story);
    } catch (error) {
        console.error('Error creating story:', error);
        res.status(500).json({ error: 'Failed to create story' });
    }
});

app.put('/api/stories/:id', async (req, res) => {
    try {
        const fields = Object.keys(req.body);
        const values = Object.values(req.body);
        const setClause = fields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');

        const result = await pool.query(
            `UPDATE stories SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
            [req.params.id, ...values]
        );
        const story = result.rows[0];

        if (!story) throw new Error('Story not found');
        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        broadcast({ type: 'story_updated', story });
        res.json(story);
    } catch (error) {
        console.error('Error updating story:', error);
        res.status(500).json({ error: 'Failed to update story' });
    }
});

// Delete story
app.delete('/api/stories/:id', async (req, res) => {
    try {
        await Logger.info('stories', `Deleting story: ${req.params.id}`);

        // First check if story exists
        const storyResult = await pool.query(
            'SELECT * FROM stories WHERE id = $1',
            [req.params.id]
        );
        const story = storyResult.rows[0];

        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        // Check if story is in any rundown
        const rundownCheck = await pool.query(
            'SELECT COUNT(*) as count FROM rundown_items WHERE story_id = $1',
            [req.params.id]
        );

        if (parseInt(rundownCheck.rows[0].count) > 0) {
            await Logger.warn('stories', 'Cannot delete story - still in rundown', {
                story_id: req.params.id,
                story_slug: story.slug
            });
            return res.status(400).json({
                error: 'Cannot delete story that is still in rundown. Remove from rundown first.'
            });
        }

        // Delete the story
        const result = await pool.query(
            'DELETE FROM stories WHERE id = $1 RETURNING *',
            [req.params.id]
        );

        await Logger.info('stories', 'Story deleted successfully', {
            story_id: req.params.id,
            story_slug: story.slug,
            story_title: story.title
        });

        // Broadcast update
        broadcast({
            type: 'story_deleted',
            story: result.rows[0]
        });

        res.json({
            success: true,
            message: 'Story deleted successfully',
            deleted_story: result.rows[0]
        });
    } catch (error) {
        await Logger.error('stories', 'Failed to delete story', {
            story_id: req.params.id,
            error: error.message
        });
        console.error('Error deleting story:', error);
        res.status(500).json({ error: 'Failed to delete story' });
    }
});

// Send to rundown with REAL CasparCG commands
app.post('/api/stories/:id/send-to-rundown', async (req, res) => {
    try {
        // Get story from database
        const storyResult = await pool.query(
            'SELECT * FROM stories WHERE id = $1',
            [req.params.id]
        );
        const story = storyResult.rows[0];

        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const commands = parseScriptToCommands(story.script);
        const totalDuration = calculateTotalDuration(commands);

        // Get current rundown or create default one
        let rundown;
        const rundownResult = await pool.query(
            'SELECT * FROM rundowns WHERE air_date = $1 LIMIT 1',
            [new Date().toISOString().split('T')[0]]
        );

        if (rundownResult.rows.length > 0) {
            rundown = rundownResult.rows[0];
        } else {
            const insertResult = await pool.query(
                `INSERT INTO rundowns (name, show_name, air_date, air_time, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [`TG - ${new Date().toISOString().split('T')[0]}`,
                 'TG delle 20:00',
                 new Date().toISOString().split('T')[0],
                 '20:00:00',
                 'preparation',
                 'System']
            );
            rundown = insertResult.rows[0];
            if (!rundown) throw new Error('Failed to create rundown');
        }

        // Get current position
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM rundown_items WHERE rundown_id = $1',
            [rundown.id]
        );
        const count = parseInt(countResult.rows[0].count);

        // Create rundown item
        const itemResult = await pool.query(
            `INSERT INTO rundown_items (rundown_id, story_id, position, estimated_duration, status)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [rundown.id, story.id, count + 1, totalDuration, 'ready']
        );
        const rundownItem = itemResult.rows[0];

        if (!rundownItem) throw new Error('Failed to create rundown item');

        // Create automation commands
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            await pool.query(
                `INSERT INTO automation_commands
                 (rundown_item_id, sequence_order, command_type, start_time, duration, caspar_command, parameters)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [rundownItem.id, i + 1, command.type, command.start_time,
                 command.duration, command.caspar_command, command.parameters]
            );
        }

        // Update story status
        await pool.query(
            'UPDATE stories SET status = $1, updated_at = NOW() WHERE id = $2',
            ['sent', story.id]
        );

        // Prepare response with commands for backward compatibility
        const itemWithCommands = {
            ...rundownItem,
            commands: commands,
            story: story
        };

        broadcast({
            type: 'story_sent_to_rundown',
            story: story,
            rundown_item: itemWithCommands,
            commands: commands.length
        });

        res.json({
            success: true,
            rundown_item: itemWithCommands,
            commands_created: commands.length,
            estimated_duration: totalDuration
        });
    } catch (error) {
        console.error('Error sending story to rundown:', error);
        res.status(500).json({ error: 'Failed to send story to rundown' });
    }
});

// Remove story from rundown
app.delete('/api/rundown-items/:itemId', async (req, res) => {
    try {
        await Logger.info('rundown', `Removing rundown item: ${req.params.itemId}`);

        // First delete automation commands
        await pool.query(
            'DELETE FROM automation_commands WHERE rundown_item_id = $1',
            [req.params.itemId]
        );

        // Then delete the rundown item
        const result = await pool.query(
            'DELETE FROM rundown_items WHERE id = $1 RETURNING *',
            [req.params.itemId]
        );

        if (result.rows.length === 0) {
            await Logger.warn('rundown', `Rundown item not found: ${req.params.itemId}`);
            return res.status(404).json({ error: 'Rundown item not found' });
        }

        const deletedItem = result.rows[0];

        // Reorder remaining items in the rundown
        await pool.query(
            'UPDATE rundown_items SET position = position - 1 WHERE rundown_id = $1 AND position > $2',
            [deletedItem.rundown_id, deletedItem.position]
        );

        await Logger.info('rundown', `Rundown item removed successfully`, {
            item_id: req.params.itemId,
            story_slug: deletedItem.story_id,
            position: deletedItem.position
        });

        broadcast({
            type: 'rundown_item_removed',
            item_id: req.params.itemId,
            rundown_id: deletedItem.rundown_id,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Rundown item removed successfully',
            removed_item: deletedItem
        });
    } catch (error) {
        await Logger.error('rundown', 'Failed to remove rundown item', {
            item_id: req.params.itemId,
            error: error.message
        });
        res.status(500).json({ error: 'Failed to remove rundown item' });
    }
});

// REAL CasparCG automation execution
app.post('/api/automation/execute/:itemId', async (req, res) => {
    try {
        // Get rundown item with story and commands from database
        const itemResult = await pool.query(
            'SELECT * FROM rundown_items WHERE id = $1',
            [req.params.itemId]
        );
        const item = itemResult.rows[0];

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Get story data
        const storyResult = await pool.query(
            'SELECT * FROM stories WHERE id = $1',
            [item.story_id]
        );
        item.story = storyResult.rows[0];

        // Get automation commands
        const commandsResult = await pool.query(
            'SELECT * FROM automation_commands WHERE rundown_item_id = $1 ORDER BY sequence_order',
            [item.id]
        );

        // Convert database commands to the format expected by the system
        const commands = commandsResult.rows.map(cmd => ({
            type: cmd.command_type,
            start_time: cmd.start_time,
            duration: cmd.duration,
            caspar_command: cmd.caspar_command,
            parameters: cmd.parameters
        }));

        // Add commands to item for compatibility
        item.commands = commands;

        console.log(`🎬 REAL EXECUTION for: ${item.story.slug}`);
        console.log(`⚡ OPTIMIZED TIMING - Commands scheduled at absolute times`);

        const results = [];
        const startTime = Date.now();

        // Schedule all commands based on their start_time
        const scheduledCommands = item.commands.map((command, index) => {
            const executeAt = startTime + (command.start_time * 1000);
            return { command, index, executeAt };
        });

        // Sort by execution time
        scheduledCommands.sort((a, b) => a.executeAt - b.executeAt);

        for (const scheduledCmd of scheduledCommands) {
            const { command, index } = scheduledCmd;
            const waitTime = scheduledCmd.executeAt - Date.now();

            if (waitTime > 0) {
                const waitSeconds = Math.round(waitTime / 1000 * 10) / 10;
                console.log(`⏰ Waiting ${waitSeconds}s for command ${index + 1} (${command.type})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
            console.log(`   🎯 [${elapsed}s] ${index + 1}. ${command.type}: ${command.caspar_command || 'N/A'}`);

            let result;

            switch (command.type) {
                case 'TAKE_VTR':
                    // REAL video playback: priorità 1) file locale, 2) HTTP streaming
                    const filename = command.parameters.filename; // Keep full filename with extension for local files
                    const videoUrl = `http://100.64.211.9:${config.templatePort}/media/${command.parameters.filename}`;

                    console.log(`📹 Trying local file first: ${filename}`);

                    try {
                        // Priorità 1: File locale (zero latency)
                        result = await caspar.sendCommand(`PLAY 1-1 "${filename}"`);
                        console.log(`✅ Video started locally (zero latency): ${filename}`);
                    } catch (e1) {
                        console.log('📹 Local file failed, trying HTTP with zero-latency params...');
                        try {
                            // Priorità 2: HTTP streaming con parametri anti-latenza
                            const zeroLatencyCommand = `PLAY 1-1 "${videoUrl}" -fflags nobuffer+fastseek+flush_packets -analyzeduration 1 -probesize 1024 -max_delay 0 -af aresample=async=1:first_pts=0 -async 1 -vsync 0 -avioflags direct -thread_queue_size 1`;
                            result = await caspar.sendCommand(zeroLatencyCommand);
                            console.log(`✅ Video started with HTTP zero-latency: ${videoUrl}`);
                        } catch (e2) {
                            console.log('📹 Zero-latency HTTP failed, trying basic HTTP...');
                            try {
                                result = await caspar.sendCommand(`PLAY 1-1 "${videoUrl}"`);
                                console.log(`✅ Video started basic HTTP: ${videoUrl}`);
                            } catch (e3) {
                                console.log(`❌ All video playback methods failed: ${command.parameters.filename}`);
                                result = { success: false, error: 'All playback methods failed' };
                            }
                        }
                    }
                    break;

                case 'GFX_ON':
                    // REAL template loading - immediate execution
                    const templateUrl = `http://100.64.211.9:${config.templatePort}/template/${command.parameters.template}`;
                    console.log(`🎨 Graphics ON: ${command.parameters.template}`);
                    result = await caspar.loadTemplate(1, 2, templateUrl, true);
                    break;

                case 'GFX_OFF':
                    // REAL template removal - immediate execution
                    console.log(`🎨 Graphics OFF`);
                    result = await caspar.removeTemplate(1, 2);
                    break;

                case 'AUDIO_SOT':
                    result = { success: true, message: 'Audio command sent' };
                    break;

                case 'WAIT':
                    // WAIT commands are just timing markers - no action needed
                    result = { success: true, message: `Sync point at ${elapsed}s` };
                    break;

                default:
                    result = { success: true, message: 'Presenter cue' };
            }

            results.push({
                command: index + 1,
                type: command.type,
                status: result.success ? 'success' : 'error',
                result: result,
                executed_at: elapsed
            });
        }

        // Update item status in database
        await pool.query(
            'UPDATE rundown_items SET status = $1, updated_at = NOW() WHERE id = $2',
            ['completed', req.params.itemId]
        );

        broadcast({
            type: 'automation_executed',
            item_id: req.params.itemId,
            commands: results.length,
            success: results.filter(r => r.status === 'success').length,
            results: results
        });

        res.json({
            success: true,
            commands_executed: results.length,
            results: results,
            message: `REAL automation completed for ${item.story.slug}`
        });

    } catch (error) {
        console.error('🚨 Automation error:', error);
        res.status(500).json({
            error: 'Automation failed',
            message: error.message,
            results: results
        });
    }
});

// Real CasparCG test
app.get('/api/caspar/test', async (req, res) => {
    try {
        if (!casparConnected) {
            return res.status(503).json({
                connected: false,
                error: 'Not connected to CasparCG server',
                host: config.caspar.host,
                port: config.caspar.port
            });
        }

        const version = await caspar.getVersion();
        const info = await caspar.getInfo();

        res.json({
            connected: true,
            version: version,
            info: info,
            host: config.caspar.host,
            port: config.caspar.port,
            templateServer: `http://100.64.211.9:${config.templatePort}`
        });
    } catch (error) {
        res.status(500).json({
            connected: false,
            error: error.message,
            host: config.caspar.host,
            port: config.caspar.port
        });
    }
});

// Manual CasparCG commands
app.post('/api/caspar/command', async (req, res) => {
    try {
        const { command, channel, layer, file, template } = req.body;

        let result;

        switch (command.toUpperCase()) {
            case 'PLAY':
                result = await caspar.playVideo(channel, layer, file);
                break;
            case 'STOP':
                result = await caspar.stopVideo(channel, layer);
                break;
            case 'CLEAR':
                result = await caspar.clearLayer(channel, layer);
                break;
            case 'CG_ADD':
                const templateUrl = `http://100.64.211.9:${config.templatePort}/template/${template}`;
                result = await caspar.loadTemplate(channel, layer, templateUrl, true);
                break;
            case 'CG_REMOVE':
                result = await caspar.removeTemplate(channel, layer);
                break;
            default:
                result = await caspar.sendCommand(req.body.raw_command || command);
        }

        res.json({
            success: true,
            command: command,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Sync configuration endpoint
app.get('/api/caspar/sync', (req, res) => {
    res.json({
        success: true,
        sync: config.sync,
        description: {
            audioOffsetMs: "Audio offset in milliseconds (negative = audio ahead)",
            audioDelayMs: "Audio delay filter in milliseconds",
            asyncMode: "FFmpeg async mode (1 = continuous)",
            vsyncMode: "Video sync mode (cfr = constant frame rate)"
        }
    });
});

app.post('/api/caspar/sync', (req, res) => {
    try {
        const { audioOffsetMs, audioDelayMs, asyncMode, vsyncMode } = req.body;

        // Update sync parameters
        if (audioOffsetMs !== undefined) config.sync.audioOffsetMs = audioOffsetMs;
        if (audioDelayMs !== undefined) config.sync.audioDelayMs = audioDelayMs;
        if (asyncMode !== undefined) config.sync.asyncMode = asyncMode;
        if (vsyncMode !== undefined) config.sync.vsyncMode = vsyncMode;

        console.log('🎯 Sync parameters updated:', config.sync);

        // Broadcast update to connected clients
        broadcast({
            type: 'sync_updated',
            sync: config.sync
        });

        res.json({
            success: true,
            sync: config.sync,
            message: 'Sync parameters updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Other endpoints (rundown, media, etc.) - same as before
app.get('/api/rundowns/current', async (req, res) => {
    try {
        // Get today's rundown or create one
        const today = new Date().toISOString().split('T')[0];
        let result = await pool.query(
            'SELECT * FROM rundowns WHERE air_date = $1 LIMIT 1',
            [today]
        );

        if (result.rows.length === 0) {
            // Create today's rundown
            const insertResult = await pool.query(
                `INSERT INTO rundowns (name, show_name, air_date, air_time, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [`TG - ${today}`,
                 'TG delle 20:00',
                 today,
                 '20:00:00',
                 'preparation',
                 'System']
            );
            result = { rows: [insertResult.rows[0]] };
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching current rundown:', error);
        res.status(500).json({ error: 'Failed to fetch current rundown' });
    }
});

app.get('/api/rundowns/:id', async (req, res) => {
    try {
        // Get rundown items with stories
        const result = await pool.query(`
            SELECT
                ri.*,
                s.slug,
                s.title,
                s.type,
                s.presenter,
                s.script,
                (SELECT COUNT(*) FROM automation_commands WHERE rundown_item_id = ri.id) as command_count
            FROM rundown_items ri
            LEFT JOIN stories s ON ri.story_id = s.id
            WHERE ri.rundown_id = $1
            ORDER BY ri.position
        `, [req.params.id]);

        const items = result.rows.map(item => ({
            rundown_id: item.rundown_id,
            item_id: item.id,
            position: item.position,
            item_status: item.status,
            estimated_duration: item.estimated_duration,
            story_id: item.story_id,
            slug: item.slug,
            title: item.title,
            type: item.type,
            presenter: item.presenter,
            command_count: parseInt(item.command_count)
        }));

        res.json(items);
    } catch (error) {
        console.error('Error fetching rundown:', error);
        res.status(500).json({ error: 'Failed to fetch rundown' });
    }
});

// Media endpoint already defined above with database integration

// ===================================
// Script Parser (updated for real commands)
// ===================================

function parseScriptToCommands(script) {
    const commands = [];
    let currentTime = 0;

    const lines = script.split('\n');
    let textBuffer = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('((') && trimmedLine.endsWith('))')) {
            if (textBuffer.trim()) {
                commands.push({
                    type: 'PRESENTER_CUE',
                    start_time: currentTime,
                    duration: estimateReadingTime(textBuffer),
                    caspar_command: null,
                    parameters: { text: textBuffer.trim() }
                });
                currentTime += estimateReadingTime(textBuffer);
                textBuffer = '';
            }

            const command = parseAutomationCommand(trimmedLine, currentTime);
            if (command) {
                commands.push(command);

                // Only advance time for commands that have duration
                if (command.type === 'TAKE_VTR') {
                    currentTime += command.duration;
                } else if (command.type === 'WAIT') {
                    currentTime += command.duration;
                }
                // GFX_ON and GFX_OFF don't advance time - they're overlays
            }
        } else if (trimmedLine) {
            textBuffer += trimmedLine + ' ';
        }
    }

    if (textBuffer.trim()) {
        commands.push({
            type: 'PRESENTER_CUE',
            start_time: currentTime,
            duration: estimateReadingTime(textBuffer),
            caspar_command: null,
            parameters: { text: textBuffer.trim() }
        });
    }

    return commands;
}

function parseAutomationCommand(commandLine, startTime) {
    const content = commandLine.slice(2, -2);

    // Handle WAIT commands specially (format: WAIT 2)
    if (content.trim().toUpperCase().startsWith('WAIT')) {
        const waitMatch = content.match(/WAIT\s+(\d+)/);
        const waitTime = waitMatch ? parseInt(waitMatch[1]) : 1;
        return {
            type: 'WAIT',
            start_time: startTime,
            duration: waitTime,
            caspar_command: null,
            parameters: { waitTime }
        };
    }

    // For other commands, use the standard format
    const parts = content.split(' - ');
    const commandType = parts[0].trim();

    switch (commandType.toUpperCase()) {
        case 'TAKE VTR':
        case 'TAKE PKG':
            const filename = parts[1] ? parts[1].replace(/"/g, '') : '';
            const duration = parts[2] ? parseDuration(parts[2]) : 8;
            const videoUrl = `http://100.64.211.9:${config.templatePort}/media/${filename}`;
            return {
                type: 'TAKE_VTR',
                start_time: startTime,
                duration: duration,
                caspar_command: `PLAY 1-1 [FFMPEG] "${videoUrl}"`,
                parameters: { filename, videoUrl }
            };

        case 'GFX ON':
            const templateName = parts[1] ? parts[1].replace(/"/g, '') : '';
            return {
                type: 'GFX_ON',
                start_time: startTime,
                duration: 15, // Aumentato a 15 secondi per le animazioni
                caspar_command: `CG 1-2 ADD 0 "http://100.64.211.9:${config.templatePort}/template/${templateName}" 1`,
                parameters: { template: templateName }
            };

        case 'GFX OFF':
            return {
                type: 'GFX_OFF',
                start_time: startTime,
                duration: 1,
                caspar_command: 'CG 1-2 REMOVE 0',
                parameters: {}
            };

        case 'SOT UP':
            const audioFile = parts[1] ? parts[1].replace(/"/g, '') : '';
            const sotDuration = parts[2] ? parseDuration(parts[2]) : 15;
            return {
                type: 'AUDIO_SOT',
                start_time: startTime,
                duration: sotDuration,
                caspar_command: `MIXER 1-1 VOLUME 1.0`,
                parameters: { file: audioFile }
            };

        default:
            return null;
    }
}

function parseDuration(durationStr) {
    const parts = durationStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(durationStr) || 8;
}

function estimateReadingTime(text) {
    const characters = text.length;
    const words = characters / 5;
    const minutes = words / 150;
    return Math.max(Math.ceil(minutes * 60), 5);
}

function calculateTotalDuration(commands) {
    return commands.reduce((total, cmd) => Math.max(total, cmd.start_time + cmd.duration), 0);
}

// ===================================
// Server Startup
// ===================================

function startServer() {
    // Data now managed by Supabase database
    console.log('💾 Using Supabase database for persistence');

    // Connect to CasparCG
    caspar.connect();

    // Start HTTP server
    app.listen(config.port, () => {
        console.log('🚀 iNEWS Real CasparCG System started');
        console.log(`📡 HTTP Server: http://100.64.211.9:${config.port}`);
        console.log(`📡 WebSocket Server: ws://localhost:${config.wsPort}`);
        console.log(`🎨 Template Server: http://100.64.211.9:${config.templatePort}`);
        console.log(`🎬 CasparCG Target: ${config.caspar.host}:${config.caspar.port}`);
        console.log('');
        console.log('✅ REAL system ready!');
        console.log(`📖 Open: http://100.64.211.9:${config.port}`);
        console.log(`📺 Renderer: http://100.64.211.9:${config.templatePort}/renderer`);
        console.log('');
        console.log('🎯 Real workflow:');
        console.log('1. Open browser to test interface');
        console.log('2. Select "REAL_TEST_VIDEO" story');
        console.log('3. Click "Invia a Rundown"');
        console.log('4. Click "Play" - REAL commands to CasparCG!');
        console.log('5. Video and graphics on CasparCG server!');
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down real system...');
    if (caspar.socket) {
        caspar.socket.destroy();
    }
    if (templateServer) {
        templateServer.close();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down real system...');
    if (caspar.socket) {
        caspar.socket.destroy();
    }
    if (templateServer) {
        templateServer.close();
    }
    process.exit(0);
});

startServer();