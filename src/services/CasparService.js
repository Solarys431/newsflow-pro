/**
 * CasparService - Gestione ottimizzata CasparCG
 * Connessione TCP robusta con reconnect automatico
 */

const net = require('net');
const EventEmitter = require('events');
const config = require('../config');

class CasparService extends EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.keepAliveTimer = null;
        this.commandQueue = [];
        this.pendingCommands = new Map();
        this.commandId = 0;
        this.reconnectAttempts = 0;
        this.responseBuffer = '';
    }

    // ================ CONNECTION MANAGEMENT ================

    async connect() {
        return new Promise((resolve, reject) => {
            console.log(`🎬 Connecting to CasparCG: ${config.caspar.host}:${config.caspar.port}`);

            this.socket = new net.Socket();
            this.socket.setTimeout(config.caspar.timeout);
            this.socket.setKeepAlive(true, 1000);
            this.socket.setNoDelay(true); // Disable Nagle algorithm for lower latency

            // Set timeout for connection attempt
            const connectionTimeout = setTimeout(() => {
                if (!this.connected) {
                    this.socket.destroy();
                    reject(new Error('Connection timeout'));
                }
            }, config.caspar.timeout);

            // Connection success
            this.socket.connect(config.caspar.port, config.caspar.host, () => {
                clearTimeout(connectionTimeout);
                console.log('✅ CasparCG TCP connected');
                this.handleConnected();
                resolve();
            });

            // Handle incoming data
            this.socket.on('data', (data) => {
                this.handleData(data);
            });

            // Handle errors
            this.socket.on('error', (error) => {
                clearTimeout(connectionTimeout);
                console.error('🚨 CasparCG TCP error:', error.message);
                this.handleDisconnection();
                reject(error);
            });

            // Handle close
            this.socket.on('close', () => {
                console.log('❌ CasparCG TCP disconnected');
                this.handleDisconnection();
            });

            // Handle timeout
            this.socket.on('timeout', () => {
                clearTimeout(connectionTimeout);
                console.log('⏰ CasparCG TCP timeout');
                this.socket.destroy();
                reject(new Error('Socket timeout'));
            });
        });
    }

    handleConnected() {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.responseBuffer = '';

        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Start keep-alive
        this.startKeepAlive();

        // Emit connected event
        this.emit('connected');

        // Process queued commands
        this.processCommandQueue();

        // Send initial version command to verify connection
        this.sendCommand('VERSION').catch(console.error);
    }

    handleDisconnection() {
        this.connected = false;

        // Clear keep-alive
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }

        // Emit disconnected event
        this.emit('disconnected');

        // Schedule reconnection if enabled
        if (config.caspar.autoReconnect && !this.reconnectTimer) {
            this.scheduleReconnection();
        }
    }

    scheduleReconnection() {
        if (config.caspar.autoReconnectAttempts !== -1 &&
            this.reconnectAttempts >= config.caspar.autoReconnectAttempts) {
            console.log('🛑 Maximum reconnection attempts reached');
            this.emit('reconnectFailed');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(
            config.caspar.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
            30000 // Max 30 seconds
        );

        console.log(`🔄 Attempting reconnect ${this.reconnectAttempts} in ${delay}ms...`);

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(console.error);
        }, delay);
    }

    startKeepAlive() {
        this.keepAliveTimer = setInterval(() => {
            if (this.connected) {
                this.sendCommand('INFO').catch(console.error);
            }
        }, config.caspar.keepAliveInterval);
    }

    // ================ DATA HANDLING ================

    handleData(data) {
        this.responseBuffer += data.toString();

        // CasparCG uses \r\n\r\n to terminate responses
        while (this.responseBuffer.includes('\r\n\r\n')) {
            const endIndex = this.responseBuffer.indexOf('\r\n\r\n') + 4;
            const response = this.responseBuffer.substring(0, endIndex);
            this.responseBuffer = this.responseBuffer.substring(endIndex);

            this.processResponse(response);
        }
    }

    processResponse(response) {
        const lines = response.trim().split('\r\n');
        if (lines.length === 0) return;

        const firstLine = lines[0];
        const parts = firstLine.split(' ');
        const code = parseInt(parts[0]);

        // Emit response event
        this.emit('response', {
            code,
            raw: response,
            lines,
            success: code >= 200 && code < 400
        });

        // Handle response codes
        switch (true) {
            case (code >= 200 && code < 300):
                console.log(`✅ CasparCG Success [${code}]: ${firstLine}`);
                this.handleSuccessResponse(code, lines);
                break;
            case (code >= 400 && code < 500):
                console.error(`⚠️ CasparCG Client Error [${code}]: ${firstLine}`);
                this.handleErrorResponse(code, lines);
                break;
            case (code >= 500):
                console.error(`❌ CasparCG Server Error [${code}]: ${firstLine}`);
                this.handleErrorResponse(code, lines);
                break;
            default:
                console.log(`📨 CasparCG Info [${code}]: ${firstLine}`);
        }

        // Process pending commands
        if (this.pendingCommands.size > 0) {
            const [commandId, pendingCommand] = this.pendingCommands.entries().next().value;
            if (pendingCommand) {
                this.pendingCommands.delete(commandId);
                if (code >= 200 && code < 300) {
                    pendingCommand.resolve({
                        success: true,
                        code,
                        data: lines.slice(1).join('\n')
                    });
                } else {
                    pendingCommand.reject(new Error(`Command failed with code ${code}: ${firstLine}`));
                }
            }
        }
    }

    handleSuccessResponse(code, lines) {
        // Handle specific success responses
        switch (code) {
            case 200: // OK
            case 201: // Created
            case 202: // Accepted
                break;
        }
    }

    handleErrorResponse(code, lines) {
        // Handle specific error responses
        switch (code) {
            case 400: // Bad Request
            case 401: // Unauthorized
            case 404: // Not Found
            case 500: // Internal Server Error
            case 502: // Bad Gateway
            case 503: // Service Unavailable
                break;
        }
    }

    // ================ COMMAND SENDING ================

    sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                console.log(`📋 Queueing command: ${command}`);
                this.commandQueue.push({ command, resolve, reject });
                return;
            }

            const commandId = ++this.commandId;
            const fullCommand = `${command}\r\n`;

            console.log(`🎬 Sending to CasparCG [${commandId}]: ${command}`);

            try {
                this.socket.write(fullCommand);

                // Store pending command with timeout
                const timeout = setTimeout(() => {
                    if (this.pendingCommands.has(commandId)) {
                        this.pendingCommands.delete(commandId);
                        resolve({
                            success: true,
                            command,
                            message: 'Command sent (timeout)',
                            timeout: true
                        });
                    }
                }, 5000);

                this.pendingCommands.set(commandId, {
                    command,
                    resolve,
                    reject,
                    timeout
                });

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

    // ================ HIGH-LEVEL COMMANDS ================

    async playVideo(channel, layer, filename, options = {}) {
        let command = `PLAY ${channel}-${layer} "${filename}"`;

        // Add optional parameters
        if (options.loop) command += ' LOOP';
        if (options.transition) command += ` ${options.transition}`;
        if (options.duration) command += ` ${options.duration}`;
        if (options.seek) command += ` SEEK ${options.seek}`;
        if (options.length) command += ` LENGTH ${options.length}`;

        return await this.sendCommand(command);
    }

    async stopVideo(channel, layer, options = {}) {
        let command = `STOP ${channel}-${layer}`;

        if (options.transition) command += ` ${options.transition}`;
        if (options.duration) command += ` ${options.duration}`;

        return await this.sendCommand(command);
    }

    // DATA STORE non supporta file binari grandi (video/audio)
    // Per upload file usare FTP configurato su FileZilla Server sul server CasparCG

    async loadTemplate(channel, layer, templateUrl, playOnLoad = false, data = '') {
        const playFlag = playOnLoad ? '1' : '0';
        const dataParam = data ? ` "${JSON.stringify(data)}"` : '';
        return await this.sendCommand(
            `CG ${channel}-${layer} ADD 0 "${templateUrl}" ${playFlag}${dataParam}`
        );
    }

    async playTemplate(channel, layer) {
        return await this.sendCommand(`CG ${channel}-${layer} PLAY 0`);
    }

    async updateTemplate(channel, layer, data) {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
        return await this.sendCommand(`CG ${channel}-${layer} UPDATE 0 "${jsonData}"`);
    }

    async removeTemplate(channel, layer) {
        return await this.sendCommand(`CG ${channel}-${layer} REMOVE 0`);
    }

    async clearLayer(channel, layer) {
        return await this.sendCommand(`CLEAR ${channel}-${layer}`);
    }

    async clearChannel(channel) {
        return await this.sendCommand(`CLEAR ${channel}`);
    }

    async setVolume(channel, layer, volume, options = {}) {
        let command = `MIXER ${channel}-${layer} VOLUME ${volume}`;

        if (options.duration) command += ` ${options.duration}`;
        if (options.easing) command += ` ${options.easing}`;

        return await this.sendCommand(command);
    }

    async getInfo(channel = null, layer = null) {
        let command = 'INFO';
        if (channel) {
            command += ` ${channel}`;
            if (layer) command += `-${layer}`;
        }
        return await this.sendCommand(command);
    }

    async getVersion() {
        return await this.sendCommand('VERSION');
    }

    async getThumbnail(channel, layer = null) {
        let command = `THUMBNAIL ${channel}`;
        if (layer) command += `-${layer}`;
        return await this.sendCommand(command);
    }

    async getMediaList() {
        return await this.sendCommand('CLS');
    }

    async getTemplateList() {
        return await this.sendCommand('TLS');
    }

    // ================ ADVANCED SYNC COMMANDS ================

    async playWithSync(channel, layer, filename, syncOptions = {}) {
        const {
            audioOffsetMs = config.sync.audioOffsetMs,
            audioDelayMs = config.sync.audioDelayMs,
            asyncMode = config.sync.asyncMode,
            vsyncMode = config.sync.vsyncMode
        } = syncOptions;

        // Build FFmpeg filter parameters for zero-latency sync
        const filters = [
            '-fflags nobuffer+fastseek+flush_packets',
            '-analyzeduration 1',
            '-probesize 1024',
            '-max_delay 0',
            `-af aresample=async=${asyncMode}:first_pts=0`,
            `-async ${asyncMode}`,
            `-vsync ${vsyncMode === 'cfr' ? '1' : '0'}`,
            '-avioflags direct',
            '-thread_queue_size 1'
        ];

        // Add audio offset/delay if needed
        if (audioOffsetMs !== 0) {
            filters.push(`-itsoffset ${audioOffsetMs / 1000}`);
        }
        if (audioDelayMs > 0) {
            filters.push(`-af adelay=${audioDelayMs}|${audioDelayMs}`);
        }

        const filterString = filters.join(' ');
        const command = `PLAY ${channel}-${layer} [FFMPEG] "${filename}" ${filterString}`;

        return await this.sendCommand(command);
    }

    // ================ UTILITY METHODS ================

    isConnected() {
        return this.connected;
    }

    getQueueSize() {
        return this.commandQueue.length;
    }

    clearQueue() {
        const count = this.commandQueue.length;
        this.commandQueue = [];
        console.log(`🗑️ Cleared ${count} queued commands`);
        return count;
    }

    async disconnect() {
        console.log('🛑 Disconnecting from CasparCG...');

        // Clear timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }

        // Close socket
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        this.connected = false;
        this.emit('disconnected');
    }
}

// Export singleton instance
module.exports = new CasparService();