/**
 * WebSocketService - Gestione WebSocket ottimizzata
 * Real-time communication con client
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('../config');

class WebSocketService extends EventEmitter {
    constructor() {
        super();
        this.wss = null;
        this.clients = new Map(); // Map of clientId -> { ws, metadata }
        this.rooms = new Map(); // Map of room -> Set of clientIds
        this.heartbeatInterval = null;
        this.clientIdCounter = 0;
    }

    // ================ SERVER MANAGEMENT ================

    /**
     * Start WebSocket server
     * @param {Object} options - Server options
     * @param {number} options.port - Standalone port (for local dev)
     * @param {Server} options.server - HTTP server for upgrade (for production/tunnel)
     */
    start(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const port = options.port || config.server.wsPort;
                const httpServer = options.server;

                // Use HTTP upgrade if server is provided, standalone otherwise
                if (httpServer) {
                    this.wss = new WebSocket.Server({
                        server: httpServer,
                        path: '/ws'  // WebSocket endpoint path
                    });
                    console.log(`📡 WebSocket server attached to HTTP server on path /ws`);
                    this.startHeartbeat();
                    resolve();
                } else {
                    this.wss = new WebSocket.Server({ port });

                    this.wss.on('listening', () => {
                        console.log(`📡 WebSocket server listening on port ${port}`);
                        this.startHeartbeat();
                        resolve();
                    });
                }

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.wss.on('error', (error) => {
                    console.error('🚨 WebSocket server error:', error);
                    this.emit('error', error);
                    reject(error);
                });

            } catch (error) {
                console.error('❌ Failed to start WebSocket server:', error);
                reject(error);
            }
        });
    }

    handleConnection(ws, req) {
        const clientId = ++this.clientIdCounter;
        const clientIp = req.socket.remoteAddress;

        // Store client
        const client = {
            id: clientId,
            ws: ws,
            ip: clientIp,
            connectedAt: new Date(),
            isAlive: true,
            rooms: new Set(),
            metadata: {}
        };

        this.clients.set(clientId, client);

        console.log(`📡 WebSocket client ${clientId} connected from ${clientIp}. Total: ${this.clients.size}`);

        // Setup event handlers
        ws.on('message', (message) => {
            this.handleMessage(clientId, message);
        });

        ws.on('pong', () => {
            client.isAlive = true;
        });

        ws.on('close', () => {
            this.handleDisconnection(clientId);
        });

        ws.on('error', (error) => {
            console.error(`🚨 WebSocket client ${clientId} error:`, error.message);
            this.handleDisconnection(clientId);
        });

        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            timestamp: new Date().toISOString(),
            config: {
                heartbeatInterval: config.websocket.heartbeatInterval,
                serverVersion: '2.0.0'
            }
        });

        // Join default room
        this.joinRoom(clientId, 'default');

        // Emit client connected event
        this.emit('clientConnected', client);
    }

    handleMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        try {
            const data = JSON.parse(message.toString());

            // Update last activity
            client.lastActivity = new Date();

            // Handle different message types
            switch (data.type) {
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
                    break;

                case 'join':
                    if (data.room) {
                        this.joinRoom(clientId, data.room);
                    }
                    break;

                case 'leave':
                    if (data.room) {
                        this.leaveRoom(clientId, data.room);
                    }
                    break;

                case 'broadcast':
                    this.broadcast(data.payload, data.room);
                    break;

                case 'metadata':
                    Object.assign(client.metadata, data.metadata);
                    break;

                default:
                    // Emit custom message event
                    this.emit('message', {
                        clientId,
                        data,
                        client
                    });
            }

        } catch (error) {
            console.error(`❌ Failed to parse message from client ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid message format'
            });
        }
    }

    handleDisconnection(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        // Leave all rooms
        for (const room of client.rooms) {
            this.leaveRoom(clientId, room);
        }

        // Remove client
        this.clients.delete(clientId);

        console.log(`📡 WebSocket client ${clientId} disconnected. Total: ${this.clients.size}`);

        // Emit client disconnected event
        this.emit('clientDisconnected', client);
    }

    // ================ ROOM MANAGEMENT ================

    joinRoom(clientId, room) {
        const client = this.clients.get(clientId);
        if (!client) return false;

        // Add to room
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room).add(clientId);

        // Update client's rooms
        client.rooms.add(room);

        console.log(`👥 Client ${clientId} joined room "${room}"`);

        // Notify room members
        this.broadcastToRoom(room, {
            type: 'memberJoined',
            clientId,
            room,
            timestamp: new Date().toISOString()
        }, clientId); // Exclude the joining client

        return true;
    }

    leaveRoom(clientId, room) {
        const client = this.clients.get(clientId);
        if (!client) return false;

        // Remove from room
        const roomSet = this.rooms.get(room);
        if (roomSet) {
            roomSet.delete(clientId);
            if (roomSet.size === 0) {
                this.rooms.delete(room);
            }
        }

        // Update client's rooms
        client.rooms.delete(room);

        console.log(`👥 Client ${clientId} left room "${room}"`);

        // Notify room members
        this.broadcastToRoom(room, {
            type: 'memberLeft',
            clientId,
            room,
            timestamp: new Date().toISOString()
        });

        return true;
    }

    getRoomMembers(room) {
        const roomSet = this.rooms.get(room);
        if (!roomSet) return [];

        return Array.from(roomSet).map(clientId => {
            const client = this.clients.get(clientId);
            return client ? {
                id: clientId,
                metadata: client.metadata,
                connectedAt: client.connectedAt
            } : null;
        }).filter(Boolean);
    }

    // ================ MESSAGING ================

    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            client.ws.send(message);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send to client ${clientId}:`, error);
            return false;
        }
    }

    sendToClients(clientIds, data) {
        const results = [];
        for (const clientId of clientIds) {
            results.push({
                clientId,
                success: this.sendToClient(clientId, data)
            });
        }
        return results;
    }

    broadcast(data, excludeClientId = null) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        let sent = 0;

        for (const [clientId, client] of this.clients) {
            if (clientId === excludeClientId) continue;
            if (client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(message);
                    sent++;
                } catch (error) {
                    console.error(`❌ Failed to broadcast to client ${clientId}:`, error);
                }
            }
        }

        return sent;
    }

    broadcastToRoom(room, data, excludeClientId = null) {
        const roomSet = this.rooms.get(room);
        if (!roomSet) return 0;

        const message = typeof data === 'string' ? data : JSON.stringify(data);
        let sent = 0;

        for (const clientId of roomSet) {
            if (clientId === excludeClientId) continue;
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(message);
                    sent++;
                } catch (error) {
                    console.error(`❌ Failed to broadcast to client ${clientId} in room ${room}:`, error);
                }
            }
        }

        return sent;
    }

    // ================ HEARTBEAT ================

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();

            for (const [clientId, client] of this.clients) {
                if (!client.isAlive) {
                    console.log(`💔 Client ${clientId} failed heartbeat check`);
                    client.ws.terminate();
                    this.handleDisconnection(clientId);
                } else {
                    client.isAlive = false;
                    client.ws.ping();
                }
            }
        }, config.websocket.heartbeatInterval);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // ================ UTILITY METHODS ================

    getClient(clientId) {
        return this.clients.get(clientId);
    }

    getAllClients() {
        return Array.from(this.clients.values()).map(client => ({
            id: client.id,
            ip: client.ip,
            connectedAt: client.connectedAt,
            rooms: Array.from(client.rooms),
            metadata: client.metadata
        }));
    }

    getStats() {
        return {
            totalClients: this.clients.size,
            totalRooms: this.rooms.size,
            rooms: Array.from(this.rooms.entries()).map(([room, members]) => ({
                name: room,
                members: members.size
            })),
            uptime: process.uptime()
        };
    }

    // ================ CLEANUP ================

    async stop() {
        console.log('🛑 Stopping WebSocket server...');

        // Stop heartbeat
        this.stopHeartbeat();

        // Close all client connections
        for (const [clientId, client] of this.clients) {
            client.ws.close(1000, 'Server shutting down');
        }

        // Close server
        if (this.wss) {
            return new Promise((resolve) => {
                this.wss.close(() => {
                    console.log('✅ WebSocket server stopped');
                    resolve();
                });
            });
        }
    }
}

// Export singleton instance
module.exports = new WebSocketService();