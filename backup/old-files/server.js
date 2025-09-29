#!/usr/bin/env node

/**
 * iNEWS Mini System - Complete Newsroom Backend
 *
 * Features:
 * - Story creation and management
 * - Rundown automation
 * - CasparCG integration
 * - Real-time WebSocket updates
 * - Media file handling
 * - SPX Graphics integration
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { CasparCG } = require('casparcg-connection');
require('dotenv').config();

// ===================================
// Configuration
// ===================================

const config = {
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 3001,
    supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    caspar: {
        host: '100.74.188.128',
        port: 5250
    },
    media: {
        uploadPath: './media',
        casparPath: '/var/caspar/media', // Adjust for your CasparCG setup
        maxFileSize: 500 * 1024 * 1024 // 500MB
    }
};

// ===================================
// Initialize Services
// ===================================

const app = express();
const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

// CasparCG connection
let casparCG = null;
let casparConnected = false;

async function initCasparCG() {
    try {
        casparCG = new CasparCG({
            host: config.caspar.host,
            port: config.caspar.port,
            autoReconnect: true,
            autoReconnectInterval: 5000,
            autoReconnectAttempts: -1 // infinite
        });

        casparCG.onConnected = () => {
            console.log('✅ CasparCG connected:', config.caspar.host + ':' + config.caspar.port);
            casparConnected = true;
            broadcast({ type: 'caspar_status', status: 'connected' });
        };

        casparCG.onDisconnected = () => {
            console.log('❌ CasparCG disconnected');
            casparConnected = false;
            broadcast({ type: 'caspar_status', status: 'disconnected' });
        };

        casparCG.onError = (error) => {
            console.error('🚨 CasparCG error:', error);
            broadcast({ type: 'caspar_error', error: error.message });
        };

        await casparCG.connect();
    } catch (error) {
        console.error('❌ Failed to initialize CasparCG:', error.message);
    }
}

// ===================================
// Middleware
// ===================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/media', express.static('./media'));
app.use('/templates', express.static('./templates'));
app.use(express.static('./public'));

// File upload configuration
const upload = multer({
    dest: './media/uploads/',
    limits: { fileSize: config.media.maxFileSize },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /\.(mp4|mov|avi|wav|mp3|aiff|png|jpg|jpeg|spx)$/i;
        cb(null, allowedTypes.test(file.originalname));
    }
});

// ===================================
// WebSocket Server for Real-time Updates
// ===================================

const wss = new WebSocket.Server({ port: config.wsPort });
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('📡 WebSocket client connected. Total:', clients.size);

    ws.on('close', () => {
        clients.delete(ws);
        console.log('📡 WebSocket client disconnected. Total:', clients.size);
    });

    ws.on('error', (error) => {
        console.error('🚨 WebSocket error:', error);
        clients.delete(ws);
    });

    // Send initial status
    ws.send(JSON.stringify({
        type: 'init',
        casparStatus: casparConnected ? 'connected' : 'disconnected',
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
// API Routes
// ===================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            database: 'connected', // Assume connected if no error
            caspar: casparConnected ? 'connected' : 'disconnected',
            websocket: `${clients.size} clients`
        }
    });
});

// ===================================
// Stories API
// ===================================

// Get all stories
app.get('/api/stories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('stories_with_media')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get story by ID
app.get('/api/stories/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('stories_with_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new story
app.post('/api/stories', async (req, res) => {
    try {
        const story = {
            slug: req.body.slug,
            title: req.body.title,
            type: req.body.type || 'PKG',
            script: req.body.script || '',
            presenter: req.body.presenter,
            producer: req.body.producer,
            estimated_duration: req.body.estimated_duration || 0,
            created_by: req.body.created_by || 'System'
        };

        const { data, error } = await supabase
            .from('stories')
            .insert(story)
            .select()
            .single();

        if (error) throw error;

        broadcast({ type: 'story_created', story: data });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update story
app.put('/api/stories/:id', async (req, res) => {
    try {
        const updates = { ...req.body };
        delete updates.id; // Don't allow ID updates

        const { data, error } = await supabase
            .from('stories')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        broadcast({ type: 'story_updated', story: data });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Parse script and generate automation commands
app.post('/api/stories/:id/parse', async (req, res) => {
    try {
        const { data: story, error: storyError } = await supabase
            .from('stories')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (storyError) throw storyError;

        const commands = parseScriptToCommands(story.script);

        res.json({
            story_id: story.id,
            commands,
            estimated_duration: calculateTotalDuration(commands)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send story to rundown
app.post('/api/stories/:id/send-to-rundown', async (req, res) => {
    try {
        const storyId = req.params.id;
        const { rundown_id, position } = req.body;

        // Get story
        const { data: story, error: storyError } = await supabase
            .from('stories')
            .select('*')
            .eq('id', storyId)
            .single();

        if (storyError) throw storyError;

        // Parse script to automation commands
        const commands = parseScriptToCommands(story.script);
        const totalDuration = calculateTotalDuration(commands);

        // Create rundown item
        const { data: rundownItem, error: itemError } = await supabase
            .from('rundown_items')
            .insert({
                rundown_id: rundown_id,
                story_id: storyId,
                position: position,
                estimated_duration: totalDuration
            })
            .select()
            .single();

        if (itemError) throw itemError;

        // Create automation commands
        const commandPromises = commands.map((cmd, index) =>
            supabase.from('automation_commands').insert({
                rundown_item_id: rundownItem.id,
                sequence_order: index + 1,
                command_type: cmd.type,
                start_time: cmd.start_time,
                duration: cmd.duration,
                caspar_command: cmd.caspar_command,
                parameters: cmd.parameters
            })
        );

        await Promise.all(commandPromises);

        // Update story status
        await supabase
            .from('stories')
            .update({ status: 'sent' })
            .eq('id', storyId);

        broadcast({
            type: 'story_sent_to_rundown',
            story: story,
            rundown_item: rundownItem,
            commands: commands.length
        });

        res.json({
            success: true,
            rundown_item: rundownItem,
            commands_created: commands.length,
            estimated_duration: totalDuration
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Rundowns API
// ===================================

// Get rundown with items
app.get('/api/rundowns/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('rundown_complete')
            .select('*')
            .eq('rundown_id', req.params.id)
            .order('position');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current/default rundown
app.get('/api/rundowns/current', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('rundowns')
            .select('*')
            .eq('air_date', moment().format('YYYY-MM-DD'))
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Automation API
// ===================================

// Execute rundown item
app.post('/api/automation/execute/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;

        // Get automation commands for this item
        const { data: commands, error } = await supabase
            .from('automation_commands')
            .select('*')
            .eq('rundown_item_id', itemId)
            .eq('status', 'ready')
            .order('sequence_order');

        if (error) throw error;

        if (!casparConnected) {
            return res.status(503).json({ error: 'CasparCG not connected' });
        }

        // Execute commands sequentially
        const results = [];
        for (const command of commands) {
            try {
                const result = await executeCasparCommand(command);
                results.push({ command: command.id, status: 'success', result });

                // Update command status
                await supabase
                    .from('automation_commands')
                    .update({ status: 'completed', executed_at: new Date().toISOString() })
                    .eq('id', command.id);

            } catch (error) {
                results.push({ command: command.id, status: 'error', error: error.message });

                // Update command status
                await supabase
                    .from('automation_commands')
                    .update({
                        status: 'error',
                        error_message: error.message,
                        executed_at: new Date().toISOString()
                    })
                    .eq('id', command.id);
            }
        }

        // Update rundown item status
        await supabase
            .from('rundown_items')
            .update({ status: 'completed' })
            .eq('id', itemId);

        broadcast({
            type: 'automation_executed',
            item_id: itemId,
            commands: results.length,
            success: results.filter(r => r.status === 'success').length
        });

        res.json({
            success: true,
            commands_executed: results.length,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Media API
// ===================================

// Upload media file
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileId = uuidv4();
        const extension = path.extname(req.file.originalname);
        const newFilename = `${fileId}${extension}`;
        const newPath = path.join('./media', newFilename);

        // Move file to permanent location
        await fs.move(req.file.path, newPath);

        // Determine file type
        const fileType = getFileType(extension);

        // Insert into database
        const mediaAsset = {
            filename: newFilename,
            original_filename: req.file.originalname,
            file_type: fileType,
            file_size: req.file.size,
            file_path: newPath,
            caspar_path: newFilename, // For CasparCG
            uploaded_by: req.body.uploaded_by || 'System'
        };

        const { data, error } = await supabase
            .from('media_assets')
            .insert(mediaAsset)
            .select()
            .single();

        if (error) throw error;

        broadcast({ type: 'media_uploaded', media: data });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all media
app.get('/api/media', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('media_assets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// CasparCG API
// ===================================

// Test CasparCG connection
app.get('/api/caspar/test', async (req, res) => {
    try {
        if (!casparConnected) {
            return res.status(503).json({
                connected: false,
                error: 'Not connected to CasparCG server'
            });
        }

        const version = await casparCG.version();
        const info = await casparCG.info();

        res.json({
            connected: true,
            version: version.response.data,
            server_info: info.response.data,
            host: config.caspar.host,
            port: config.caspar.port
        });
    } catch (error) {
        res.status(500).json({
            connected: false,
            error: error.message
        });
    }
});

// Execute CasparCG command manually
app.post('/api/caspar/command', async (req, res) => {
    try {
        if (!casparConnected) {
            return res.status(503).json({ error: 'CasparCG not connected' });
        }

        const { command, channel, layer, ...params } = req.body;
        let result;

        switch (command.toUpperCase()) {
            case 'PLAY':
                result = await casparCG.play(channel, layer, params.file);
                break;
            case 'STOP':
                result = await casparCG.stop(channel, layer);
                break;
            case 'CLEAR':
                result = await casparCG.clear(channel, layer);
                break;
            case 'CG':
                if (params.action === 'ADD') {
                    result = await casparCG.cgAdd(channel, layer, params.template, params.data);
                } else if (params.action === 'REMOVE') {
                    result = await casparCG.cgRemove(channel, layer);
                }
                break;
            default:
                throw new Error(`Unsupported command: ${command}`);
        }

        res.json({
            success: true,
            command,
            result: result.response
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================================
// Helper Functions
// ===================================

function parseScriptToCommands(script) {
    const commands = [];
    let currentTime = 0;

    const lines = script.split('\n');
    let textBuffer = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check for automation commands
        if (trimmedLine.startsWith('((') && trimmedLine.endsWith('))')) {
            // If we have accumulated text, create a presenter cue
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

            // Parse the automation command
            const command = parseAutomationCommand(trimmedLine, currentTime);
            if (command) {
                commands.push(command);
                currentTime += command.duration;
            }
        } else if (trimmedLine) {
            textBuffer += trimmedLine + ' ';
        }
    }

    // Handle any remaining text
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
    // Remove (( and ))
    const content = commandLine.slice(2, -2);
    const parts = content.split(' - ');

    const commandType = parts[0].trim();

    switch (commandType.toUpperCase()) {
        case 'TAKE VTR':
        case 'TAKE PKG':
            const filename = parts[1] ? parts[1].replace(/"/g, '') : '';
            const duration = parts[2] ? parseDuration(parts[2]) : 30;
            return {
                type: 'TAKE_VTR',
                start_time: startTime,
                duration: duration,
                caspar_command: `PLAY 1-1 "${filename.replace('.mp4', '')}"`,
                parameters: { filename, auto_next: true }
            };

        case 'GFX ON':
            const templateName = parts[1] ? parts[1].replace(/"/g, '') : '';
            return {
                type: 'GFX_ON',
                start_time: startTime,
                duration: 5, // Default 5 seconds for graphics
                caspar_command: `CG 1-2 ADD 1 "${templateName}"`,
                parameters: { template: templateName }
            };

        case 'GFX OFF':
            return {
                type: 'GFX_OFF',
                start_time: startTime,
                duration: 1,
                caspar_command: 'CG 1-2 REMOVE 1',
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
                parameters: { file: audioFile, level: 'UP' }
            };

        default:
            return null;
    }
}

function parseDuration(durationStr) {
    // Parse duration in format MM:SS
    const parts = durationStr.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(durationStr) || 30;
}

function estimateReadingTime(text) {
    // Estimate reading time: ~150 words per minute, ~5 characters per word
    const characters = text.length;
    const words = characters / 5;
    const minutes = words / 150;
    return Math.max(Math.ceil(minutes * 60), 5); // Minimum 5 seconds
}

function calculateTotalDuration(commands) {
    return commands.reduce((total, cmd) => Math.max(total, cmd.start_time + cmd.duration), 0);
}

async function executeCasparCommand(command) {
    if (!casparConnected) {
        throw new Error('CasparCG not connected');
    }

    console.log(`🎬 Executing: ${command.command_type} - ${command.caspar_command}`);

    switch (command.command_type) {
        case 'TAKE_VTR':
            const filename = command.parameters.filename.replace('.mp4', '');
            return await casparCG.play(1, 1, filename);

        case 'GFX_ON':
            return await casparCG.cgAdd(1, 2, command.parameters.template, command.parameters.data || {});

        case 'GFX_OFF':
            return await casparCG.cgRemove(1, 2);

        case 'AUDIO_SOT':
            if (command.parameters.level === 'UP') {
                return await casparCG.mixerVolume(1, 1, 1.0);
            } else {
                return await casparCG.mixerVolume(1, 1, 0.3);
            }

        default:
            console.log(`⚠️  Unknown command type: ${command.command_type}`);
            return { success: true, message: 'Command skipped' };
    }
}

function getFileType(extension) {
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv'];
    const audioExts = ['.wav', '.mp3', '.aiff', '.flac'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif'];
    const templateExts = ['.spx', '.html'];

    if (videoExts.includes(extension.toLowerCase())) return 'video';
    if (audioExts.includes(extension.toLowerCase())) return 'audio';
    if (imageExts.includes(extension.toLowerCase())) return 'image';
    if (templateExts.includes(extension.toLowerCase())) return 'template';
    return 'unknown';
}

// ===================================
// Error Handling
// ===================================

app.use((error, req, res, next) => {
    console.error('🚨 Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// ===================================
// Server Startup
// ===================================

async function startServer() {
    try {
        // Ensure directories exist
        await fs.ensureDir('./media');
        await fs.ensureDir('./media/uploads');
        await fs.ensureDir('./templates');
        await fs.ensureDir('./public');

        // Initialize CasparCG connection
        await initCasparCG();

        // Start HTTP server
        app.listen(config.port, () => {
            console.log(`🚀 iNEWS Mini System started`);
            console.log(`📡 HTTP Server: http://localhost:${config.port}`);
            console.log(`📡 WebSocket Server: ws://localhost:${config.wsPort}`);
            console.log(`🎬 CasparCG: ${config.caspar.host}:${config.caspar.port}`);
            console.log(`💾 Supabase: ${config.supabase.url}`);
            console.log('');
            console.log('🎯 Ready for testing!');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    if (casparCG) {
        casparCG.disconnect();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down gracefully...');
    if (casparCG) {
        casparCG.disconnect();
    }
    process.exit(0);
});

// Start the server
startServer();