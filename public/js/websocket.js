/**
 * WebSocket Client Module
 * Gestione connessione WebSocket lato client
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.url = Config.websocket.url;
        this.reconnectAttempts = 0;
        this.handlers = new Map();
        this.isConnected = false;
    }

    connect() {
        console.log(`📡 Connecting to WebSocket: ${this.url}`);

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 WebSocket message:', data.type);
                this.emit(data.type, data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('❌ WebSocket disconnected');
            this.isConnected = false;
            this.emit('disconnected');
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= Config.websocket.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Config.websocket.reconnectDelay * this.reconnectAttempts;

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    send(type, data = {}) {
        if (!this.isConnected) {
            console.warn('WebSocket not connected');
            return false;
        }

        const message = JSON.stringify({ type, ...data });
        this.ws.send(message);
        return true;
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }

    off(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in WebSocket handler for ${event}:`, error);
                }
            });
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}