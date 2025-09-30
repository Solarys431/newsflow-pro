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
     * Download file da CasparCG via FTP in cache locale
     * Risolve il problema "Premature close" quando si cambia preview rapidamente
     * @param {string} filename - Nome del file da scaricare
     * @param {string} cacheDir - Directory cache locale
     * @returns {string} - Path del file scaricato in cache
     */
    async downloadToCache(filename, cacheDir) {
        if (!config.ftp.enabled) {
            throw new Error('FTP is disabled');
        }

        // Assicurati che la cache directory esista
        await fs.ensureDir(cacheDir);

        const cachePath = path.join(cacheDir, filename);

        // Se il file esiste già in cache, restituiscilo
        if (await fs.pathExists(cachePath)) {
            Logger.debug('FTP', `File found in cache: ${filename}`);
            return cachePath;
        }

        Logger.info('FTP', `Downloading to cache: ${filename}`);

        // Crea un client FTP dedicato per questo download
        const ftp = require('basic-ftp');
        const dedicatedClient = new ftp.Client();
        dedicatedClient.ftp.verbose = false;

        // Download in file temporaneo prima, poi rinomina
        const tempPath = `${cachePath}.tmp`;

        try {
            // Connessione con timeout
            await Promise.race([
                dedicatedClient.access({
                    host: config.ftp.host,
                    port: config.ftp.port,
                    user: config.ftp.user,
                    password: config.ftp.password,
                    secure: config.ftp.secure,
                    secureOptions: {
                        rejectUnauthorized: false // Accept self-signed certificates
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('FTP connection timeout')), 15000)
                )
            ]);

            const remotePath = `${config.ftp.mediaPath}${filename}`;

            // Download nel file temporaneo
            await dedicatedClient.downloadTo(fs.createWriteStream(tempPath), remotePath);

            // Rinomina da .tmp al nome finale (atomic operation)
            await fs.rename(tempPath, cachePath);

            Logger.info('FTP', `✅ File cached successfully: ${filename}`);

            return cachePath;

        } catch (error) {
            // Cleanup file temporaneo in caso di errore
            await fs.remove(tempPath).catch(() => {});

            Logger.error('FTP', `Failed to download file: ${filename}`, { error: error.message });
            throw error;
        } finally {
            // Chiudi sempre la connessione dedicata
            dedicatedClient.close();
        }
    }

    /**
     * Download file da CasparCG via FTP direttamente in uno stream
     * DEPRECATO: Usare downloadToCache() per evitare "Premature close"
     * Mantenuto per backward compatibility
     */
    async downloadFile(filename, destinationStream) {
        if (!config.ftp.enabled) {
            throw new Error('FTP is disabled');
        }

        // Crea un client FTP dedicato per questo download
        const ftp = require('basic-ftp');
        const dedicatedClient = new ftp.Client();
        dedicatedClient.ftp.verbose = false;

        try {
            // Connessione con timeout
            await Promise.race([
                dedicatedClient.access({
                    host: config.ftp.host,
                    port: config.ftp.port,
                    user: config.ftp.user,
                    password: config.ftp.password,
                    secure: config.ftp.secure,
                    secureOptions: {
                        rejectUnauthorized: false // Accept self-signed certificates
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('FTP connection timeout')), 10000)
                )
            ]);

            const remotePath = `${config.ftp.mediaPath}${filename}`;

            Logger.info('FTP', `Downloading file: ${filename}`);

            // Download direttamente nello stream di destinazione
            await dedicatedClient.downloadTo(destinationStream, remotePath);

            Logger.info('FTP', `File downloaded successfully: ${filename}`);

            return true;
        } catch (error) {
            Logger.error('FTP', `Failed to download file: ${filename}`, { error: error.message });
            throw error;
        } finally {
            // Chiudi sempre la connessione dedicata
            dedicatedClient.close();
        }
    }

    /**
     * Pulisce la cache eliminando file non usati di recente
     * LRU (Least Recently Used) cache cleanup
     * @param {string} cacheDir - Directory cache
     * @param {number} maxSizeMB - Dimensione massima cache in MB
     */
    async cleanCache(cacheDir, maxSizeMB = 500) {
        try {
            if (!await fs.pathExists(cacheDir)) {
                return { cleaned: 0, freedMB: 0 };
            }

            const files = await fs.readdir(cacheDir);
            if (files.length === 0) return { cleaned: 0, freedMB: 0 };

            // Ottieni info su tutti i file con ultimo accesso
            const filesWithStats = await Promise.all(
                files
                    .filter(f => !f.endsWith('.tmp')) // Ignora file temporanei
                    .map(async (file) => {
                        const filePath = path.join(cacheDir, file);
                        const stats = await fs.stat(filePath);
                        return {
                            path: filePath,
                            name: file,
                            size: stats.size,
                            atime: stats.atime // Last access time
                        };
                    })
            );

            // Calcola dimensione totale cache
            const totalSize = filesWithStats.reduce((sum, f) => sum + f.size, 0);
            const totalSizeMB = totalSize / (1024 * 1024);

            if (totalSizeMB <= maxSizeMB) {
                Logger.debug('FTP', `Cache size OK: ${totalSizeMB.toFixed(2)}MB / ${maxSizeMB}MB`);
                return { cleaned: 0, freedMB: 0 };
            }

            // Ordina per ultimo accesso (più vecchi prima)
            filesWithStats.sort((a, b) => a.atime - b.atime);

            // Elimina file più vecchi finché non scendiamo sotto il limite
            let currentSize = totalSize;
            let cleaned = 0;
            let freedBytes = 0;

            for (const file of filesWithStats) {
                if (currentSize / (1024 * 1024) <= maxSizeMB * 0.8) break; // 80% del limite

                await fs.remove(file.path);
                currentSize -= file.size;
                freedBytes += file.size;
                cleaned++;

                Logger.debug('FTP', `Cache cleanup: removed ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            }

            const freedMB = freedBytes / (1024 * 1024);
            Logger.info('FTP', `✅ Cache cleanup: removed ${cleaned} files, freed ${freedMB.toFixed(2)}MB`);

            return { cleaned, freedMB };

        } catch (error) {
            Logger.error('FTP', `Cache cleanup failed: ${error.message}`);
            return { cleaned: 0, freedMB: 0, error: error.message };
        }
    }

    /**
     * Elimina file remoto da CasparCG via FTP
     */
    async deleteRemoteFile(filename) {
        if (!config.ftp.enabled) {
            throw new Error('FTP is disabled');
        }

        try {
            await this.connect();

            // Naviga alla directory media se necessario
            if (config.ftp.mediaPath && config.ftp.mediaPath !== '/') {
                await this.client.cd(config.ftp.mediaPath);
            }

            Logger.warn('FTP', `⚠️ Deleting remote file: ${filename}`);

            // Elimina il file remoto (solo il nome del file, non il path completo)
            await this.client.remove(filename);

            Logger.info('FTP', `✅ File deleted successfully: ${filename}`);

            return {
                success: true,
                filename: filename,
                message: 'File deleted from CasparCG'
            };
        } catch (error) {
            Logger.error('FTP', `Failed to delete remote file: ${filename}`, { error: error.message });
            throw error;
        }
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