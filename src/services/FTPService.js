/**
 * FTP Service
 * Gestione upload sicuro di media files a CasparCG
 * ATTENZIONE: Questo servizio gestisce upload critici per il broadcast
 */

const ftp = require('basic-ftp');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const config = require('../config');
const Logger = require('../middleware/logger');

class FTPService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.isConnected = false;
        this.uploadQueue = [];
        this.activeUpload = null;
        this.retryCount = 0;

        // Security: Non loggare mai le password
        this.config = {
            ...config.ftp,
            password: config.ftp.password ? '***' : undefined // Mascherare password nei log
        };

        Logger.info('FTP', 'Service initialized', {
            host: this.config.host,
            enabled: this.config.enabled
        });
    }

    /**
     * Connetti al server FTP con retry logic
     */
    async connect() {
        if (!config.ftp.enabled) {
            Logger.warn('FTP', 'FTP upload is disabled in configuration');
            return false;
        }

        if (!config.ftp.password) {
            Logger.error('FTP', 'FTP password not configured. Set FTP_PASSWORD in .env');
            throw new Error('FTP credentials missing');
        }

        if (this.isConnected) {
            return true;
        }

        this.client = new ftp.Client();

        // Configurazione timeout e verbose
        this.client.ftp.timeout = config.ftp.timeout;
        if (config.ftp.verbose) {
            this.client.ftp.verbose = true;
        }

        try {
            // Progress tracking per debug
            this.client.trackProgress(info => {
                if (this.activeUpload) {
                    const progress = Math.round((info.bytes / info.total) * 100);
                    this.emit('progress', {
                        filename: this.activeUpload,
                        progress,
                        bytes: info.bytes,
                        total: info.total
                    });

                    // Log ogni 10%
                    if (progress % 10 === 0) {
                        Logger.debug('FTP', `Upload progress: ${progress}%`, {
                            file: this.activeUpload
                        });
                    }
                }
            });

            // Connessione con credenziali reali
            await this.client.access({
                host: config.ftp.host,
                port: config.ftp.port,
                user: config.ftp.user,
                password: config.ftp.password, // Password reale, non mascherata
                secure: config.ftp.secure,
                secureOptions: config.ftp.secure ? {
                    rejectUnauthorized: false // Accetta certificati self-signed di FileZilla
                } : undefined
            });

            this.isConnected = true;
            this.retryCount = 0;
            Logger.info('FTP', '✅ Connected to CasparCG FTP server');

            // Verifica se la cartella media esiste
            try {
                await this.client.cd(config.ftp.mediaPath);
                Logger.debug('FTP', `Media directory verified: ${config.ftp.mediaPath}`);
            } catch (err) {
                Logger.warn('FTP', `Media directory not found, will try to create: ${config.ftp.mediaPath}`);
            }

            return true;

        } catch (error) {
            this.isConnected = false;
            this.retryCount++;

            Logger.error('FTP', `Connection failed (attempt ${this.retryCount}/${config.ftp.maxRetries})`, {
                error: error.message
            });

            if (this.retryCount < config.ftp.maxRetries) {
                Logger.info('FTP', `Retrying connection in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await this.connect();
            }

            throw error;
        }
    }

    /**
     * Disconnetti dal server FTP
     */
    async disconnect() {
        if (this.client) {
            this.client.close();
            this.isConnected = false;
            this.client = null;
            Logger.info('FTP', 'Disconnected from FTP server');
        }
    }

    /**
     * Upload file a CasparCG con validazione e safety checks
     * @param {string} localPath - Percorso locale del file
     * @param {string} remoteName - Nome del file su CasparCG (opzionale)
     * @returns {Object} - Risultato upload con percorso remoto
     */
    async uploadFile(localPath, remoteName = null) {
        // Validazioni di sicurezza
        if (!await fs.pathExists(localPath)) {
            throw new Error(`File not found: ${localPath}`);
        }

        const stats = await fs.stat(localPath);
        if (stats.size > config.media.maxFileSize) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${config.media.maxFileSize})`);
        }

        // Validazione estensione file
        const ext = path.extname(localPath).toLowerCase();
        const allowedTypes = [
            ...config.media.allowedVideoTypes,
            ...config.media.allowedAudioTypes
        ];

        if (!allowedTypes.includes(ext)) {
            throw new Error(`File type not allowed: ${ext}`);
        }

        // Nome remoto sicuro (rimuovi caratteri speciali)
        if (!remoteName) {
            remoteName = path.basename(localPath);
        }
        remoteName = this.sanitizeFilename(remoteName);

        // Connetti se necessario
        if (!this.isConnected) {
            await this.connect();
        }

        const remotePath = path.posix.join(config.ftp.mediaPath, remoteName);

        Logger.info('FTP', `Starting upload: ${remoteName}`, {
            size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            remotePath
        });

        this.activeUpload = remoteName;

        try {
            // Check se il file esiste già (opzionale)
            try {
                const remoteSize = await this.client.size(remotePath);
                if (remoteSize === stats.size) {
                    Logger.info('FTP', `File already exists with same size, skipping: ${remoteName}`);
                    return {
                        success: true,
                        filename: remoteName,
                        remotePath: remotePath,
                        skipped: true
                    };
                }

                // File esiste ma dimensione diversa, sovrascrivere
                Logger.warn('FTP', `File exists with different size, overwriting: ${remoteName}`);
            } catch (err) {
                // File non esiste, procedi con upload
            }

            // Upload con retry automatico
            await this.client.uploadFrom(localPath, remotePath);

            Logger.info('FTP', `✅ Upload completed: ${remoteName}`);

            // Verifica upload
            const uploadedSize = await this.client.size(remotePath);
            if (uploadedSize !== stats.size) {
                throw new Error(`Upload verification failed: size mismatch (local: ${stats.size}, remote: ${uploadedSize})`);
            }

            this.activeUpload = null;

            return {
                success: true,
                filename: remoteName,
                remotePath: remotePath,
                casparPath: remoteName, // Per CasparCG usiamo solo il nome file
                size: stats.size,
                verified: true
            };

        } catch (error) {
            this.activeUpload = null;
            Logger.error('FTP', `Upload failed: ${remoteName}`, { error: error.message });

            // Se connessione persa, prova a riconnettersi
            if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
                this.isConnected = false;
                Logger.info('FTP', 'Connection lost, attempting reconnect...');
                await this.connect();

                // Riprova upload una volta
                Logger.info('FTP', 'Retrying upload after reconnection...');
                return await this.uploadFile(localPath, remoteName);
            }

            throw error;
        }
    }

    /**
     * Lista file nella directory media di CasparCG
     */
    async listRemoteFiles() {
        try {
            // Riconnetti se disconnesso o se è passato troppo tempo
            if (!this.isConnected || !this.client.closed === false) {
                Logger.info('FTP', 'Reconnecting for file list...');
                this.isConnected = false; // Forza reset
                await this.connect();
            }

            // Timeout per evitare hanging
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
            }, 10000); // 10 secondi timeout

            try {
                const files = await this.client.list(config.ftp.mediaPath);
                clearTimeout(timeout);

                return files
                    .filter(f => f.type === 1) // Solo file, non directory
                    .map(f => ({
                        name: f.name,
                        size: f.size,
                        date: f.modifiedAt || f.date,
                        type: this.getFileType(f.name)
                    }));
            } catch (listError) {
                clearTimeout(timeout);

                // Se timeout o errore, prova a riconnetterti
                if (listError.message?.includes('ETIMEDOUT') || listError.message?.includes('closed')) {
                    Logger.warn('FTP', 'Connection timeout, reconnecting...');
                    this.isConnected = false;
                    await this.connect();

                    // Riprova una volta
                    const files = await this.client.list(config.ftp.mediaPath);
                    return files
                        .filter(f => f.type === 1)
                        .map(f => ({
                            name: f.name,
                            size: f.size,
                            date: f.modifiedAt || f.date,
                            type: this.getFileType(f.name)
                        }));
                }
                throw listError;
            }

        } catch (error) {
            Logger.error('FTP', 'Failed to list remote files', { error: error.message });

            // Ritorna lista vuota invece di errore per non bloccare l'UI
            return [];
        }
    }

    /**
     * Elimina file da CasparCG (con estrema cautela)
     */
    async deleteRemoteFile(filename) {
        if (!this.isConnected) {
            await this.connect();
        }

        const remotePath = path.posix.join(config.ftp.mediaPath, filename);

        try {
            // Double check - conferma che il file esiste
            await this.client.size(remotePath);

            // Elimina
            await this.client.remove(remotePath);

            Logger.warn('FTP', `File deleted from CasparCG: ${filename}`);

            return { success: true, deleted: filename };

        } catch (error) {
            Logger.error('FTP', `Failed to delete file: ${filename}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Sanitizza nome file per sicurezza
     */
    sanitizeFilename(filename) {
        // Rimuovi caratteri pericolosi
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_') // Solo caratteri sicuri
            .replace(/_{2,}/g, '_') // Rimuovi underscore multipli
            .replace(/^[._-]+|[._-]+$/g, ''); // Rimuovi caratteri speciali all'inizio/fine
    }

    /**
     * Determina tipo file dall'estensione
     */
    getFileType(filename) {
        const ext = path.extname(filename).toLowerCase();

        if (config.media.allowedVideoTypes.includes(ext)) return 'video';
        if (config.media.allowedAudioTypes.includes(ext)) return 'audio';
        if (config.media.allowedImageTypes.includes(ext)) return 'image';

        return 'unknown';
    }

    /**
     * Test connessione FTP
     */
    async testConnection() {
        try {
            await this.connect();
            const files = await this.listRemoteFiles();
            await this.disconnect();

            return {
                success: true,
                message: 'FTP connection successful',
                filesCount: files.length
            };
        } catch (error) {
            return {
                success: false,
                message: 'FTP connection failed',
                error: error.message
            };
        }
    }
}

// Singleton instance
module.exports = new FTPService();