/**
 * Media Controller
 * Gestione file media
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const DatabaseService = require('../services/DatabaseService');
const WebSocketService = require('../services/WebSocketService');
const FTPService = require('../services/FTPService');
const Logger = require('../middleware/logger');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const config = require('../config');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        await fs.ensureDir(config.media.uploadPath);
        cb(null, config.media.uploadPath);
    },
    filename: (req, file, cb) => {
        const fileId = uuidv4();
        const extension = path.extname(file.originalname);
        cb(null, `${fileId}${extension}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: config.media.maxFileSize },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const allowedTypes = [
            ...config.media.allowedVideoTypes,
            ...config.media.allowedAudioTypes,
            ...config.media.allowedImageTypes,
            ...config.media.allowedTemplateTypes
        ];

        if (allowedTypes.includes(extension)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${extension} not allowed`));
        }
    }
});

// GET /api/media
router.get('/', asyncHandler(async (req, res) => {
    const { type } = req.query;
    const media = await DatabaseService.getMediaAssets(type);
    res.json(media);
}));

// POST /api/media/upload
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError('No file uploaded', 400);
    }

    const extension = path.extname(req.file.originalname).toLowerCase();
    const fileType = getFileType(extension);

    const mediaAsset = {
        filename: req.file.filename,
        original_filename: req.file.originalname,
        file_type: fileType,
        file_size: req.file.size,
        file_path: req.file.path,
        caspar_path: req.file.filename,
        uploaded_by: req.body.uploaded_by || 'System'
    };

    // Extract video metadata if video file
    if (fileType === 'video') {
        try {
            const metadata = await getVideoMetadata(req.file.path);
            mediaAsset.duration = metadata.duration;
            mediaAsset.resolution = metadata.resolution;
            Logger.info('MEDIA', `Video metadata extracted: ${metadata.duration}s, ${metadata.resolution}`);
        } catch (error) {
            Logger.warn('MEDIA', `Failed to extract metadata: ${error.message}`);
        }
    }

    const asset = await DatabaseService.createMediaAsset(mediaAsset);

    Logger.info('MEDIA', `File uploaded: ${req.file.originalname}`, {
        size: req.file.size,
        type: fileType
    });

    WebSocketService.broadcast({
        type: 'media_uploaded',
        media: asset,
        timestamp: new Date().toISOString()
    });

    res.json(asset);
}));

// POST /api/media/scan
router.post('/scan', asyncHandler(async (req, res) => {
    Logger.info('MEDIA', 'Starting media scan');

    const mediaDir = config.media.uploadPath;
    const files = await fs.readdir(mediaDir);
    const added = [];

    for (const file of files) {
        const filePath = path.join(mediaDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
            const extension = path.extname(file).toLowerCase();
            const fileType = getFileType(extension);

            // Check if already in database
            const existing = await DatabaseService.getMediaAssetByFilename(file);
            if (!existing) {
                const asset = await DatabaseService.createMediaAsset({
                    filename: file,
                    original_filename: file,
                    file_type: fileType,
                    file_size: stats.size,
                    file_path: filePath,
                    caspar_path: file,
                    uploaded_by: 'Scanner'
                });
                added.push(asset);
            }
        }
    }

    Logger.info('MEDIA', `Media scan completed. Added ${added.length} files`);

    res.json({
        success: true,
        scanned: files.length,
        added: added.length,
        files: added
    });
}));

// DELETE /api/media/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const asset = await DatabaseService.getMediaAssetById(req.params.id);

    if (!asset) {
        throw new AppError('Media asset not found', 404);
    }

    // Check if file is stored remotely on CasparCG
    const isRemote = asset.metadata && asset.metadata.location === 'remote';

    // Delete file from CasparCG via FTP if remote
    if (isRemote && config.ftp.enabled) {
        try {
            Logger.info('MEDIA', `Deleting remote file from CasparCG: ${asset.filename}`);
            await FTPService.deleteRemoteFile(asset.filename);
            Logger.info('MEDIA', `✅ Remote file deleted from CasparCG: ${asset.filename}`);
        } catch (error) {
            Logger.error('MEDIA', `Failed to delete remote file: ${error.message}`);
            // Continue with database deletion even if FTP delete fails
        }
    }

    // Delete file from local disk if exists
    if (asset.file_path && await fs.pathExists(asset.file_path)) {
        await fs.remove(asset.file_path);
        Logger.info('MEDIA', `Local file deleted: ${asset.file_path}`);
    }

    // Delete from database
    await DatabaseService.deleteMediaAsset(req.params.id);

    Logger.info('MEDIA', `Media asset deleted: ${asset.original_filename}`);

    WebSocketService.broadcast({
        type: 'media_deleted',
        media_id: req.params.id,
        timestamp: new Date().toISOString()
    });

    res.json({
        success: true,
        message: 'Media asset deleted successfully',
        deleted_from_caspar: isRemote,
        deleted_asset: asset
    });
}));

// POST /api/media/upload-to-caspar
// Upload video/audio direttamente a CasparCG (prima prova FTP, poi fallback a AMCP)
router.post('/upload-to-caspar', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError('No file uploaded', 400);
    }

    // Verifica che sia un video o audio (non template)
    const extension = path.extname(req.file.originalname).toLowerCase();
    const fileType = getFileType(extension);

    if (fileType !== 'video' && fileType !== 'audio') {
        // Cleanup file locale
        await fs.unlink(req.file.path).catch(() => {});
        throw new AppError(`File type ${fileType} should not be uploaded to CasparCG. Use local upload for templates.`, 400);
    }

    Logger.info('MEDIA', `Starting FTP upload to CasparCG: ${req.file.originalname}`);

    // Progress tracking via WebSocket
    const progressHandler = (data) => {
        if (data.filename === req.file.filename) {
            WebSocketService.broadcast({
                type: 'upload_progress',
                filename: req.file.originalname,
                progress: data.progress,
                bytes: data.bytes,
                total: data.total
            });
        }
    };

    // Registra handler per progress
    FTPService.on('progress', progressHandler);

    try {
        // Upload solo via FTP (rimosso fallback AMCP che non funziona per file binari)
        if (!config.ftp.enabled) {
            throw new AppError('FTP upload is not configured. Please configure FileZilla Server on CasparCG.', 503);
        }

        // Usa il nome originale invece dell'UUID per CasparCG
        // Sanitizza il nome per evitare problemi con caratteri speciali
        const safeName = req.file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_') // Sostituisci caratteri speciali con _
            .replace(/_{2,}/g, '_'); // Rimuovi underscore multipli

        const uploadResult = await FTPService.uploadFile(
            req.file.path,
            safeName  // Usa il nome originale sanitizzato
        );

        // Salva nel database
        const mediaAsset = {
            filename: uploadResult.filename,
            original_filename: req.file.originalname,
            file_type: fileType,
            file_size: req.file.size,
            file_path: uploadResult.casparPath || uploadResult.filename, // Usa path remoto
            caspar_path: uploadResult.casparPath || uploadResult.filename, // Path su CasparCG
            uploaded_by: req.body.uploaded_by || 'System',
            metadata: {
                location: 'remote',
                upload_method: 'FTP',
                upload_date: new Date().toISOString()
            }
        };

        // Extract video metadata if video file (before cleanup)
        if (fileType === 'video') {
            try {
                const metadata = await getVideoMetadata(req.file.path);
                mediaAsset.duration = metadata.duration;
                mediaAsset.resolution = metadata.resolution;
                Logger.info('MEDIA', `Video metadata extracted: ${metadata.duration}s, ${metadata.resolution}`);
            } catch (error) {
                Logger.warn('MEDIA', `Failed to extract metadata: ${error.message}`);
            }
        }

        const asset = await DatabaseService.createMediaAsset(mediaAsset);

        // Cleanup file locale dopo upload riuscito
        await fs.unlink(req.file.path).catch(() => {});

        Logger.info('MEDIA', `✅ FTP upload completed: ${req.file.originalname}`);

        // Notifica clients
        WebSocketService.broadcast({
            type: 'media_uploaded_to_caspar',
            media: asset,
            timestamp: new Date().toISOString()
        });

        // IMPORTANTE: Rimuovi event listener per evitare memory leak
        FTPService.removeListener('progress', progressHandler);

        res.json({
            success: true,
            message: 'File uploaded to CasparCG successfully via FTP',
            media: asset,
            uploadDetails: uploadResult
        });

    } catch (error) {
        // IMPORTANTE: Rimuovi event listener anche in caso di errore
        FTPService.removeListener('progress', progressHandler);

        // Cleanup file locale in caso di errore
        await fs.unlink(req.file.path).catch(() => {});

        Logger.error('MEDIA', `FTP upload failed: ${error.message}`);
        throw new AppError(`Failed to upload to CasparCG via FTP: ${error.message}`, 500);
    }
}));

// GET /api/media/ftp/test
// Test connessione FTP a CasparCG
router.get('/ftp/test', asyncHandler(async (req, res) => {
    Logger.info('MEDIA', 'Testing FTP connection to CasparCG');

    const result = await FTPService.testConnection();

    if (result.success) {
        Logger.info('MEDIA', '✅ FTP connection test successful');
    } else {
        Logger.error('MEDIA', `❌ FTP connection test failed: ${result.error}`);
    }

    res.json(result);
}));

// GET /api/media/ftp/list
// Lista file remoti su CasparCG
router.get('/ftp/list', asyncHandler(async (req, res) => {
    Logger.info('MEDIA', 'Listing remote files on CasparCG');

    try {
        const files = await FTPService.listRemoteFiles();

        Logger.info('MEDIA', `Found ${files.length} files on CasparCG`);

        res.json({
            success: true,
            count: files.length,
            files: files
        });

    } catch (error) {
        Logger.error('MEDIA', `Failed to list remote files: ${error.message}`);
        throw new AppError('Failed to list remote files', 500);
    }
}));

// GET /api/media/templates
// Lista template HTML disponibili localmente
router.get('/templates', asyncHandler(async (req, res) => {
    Logger.info('MEDIA', 'Getting template list');

    try {
        const templateDir = path.join(__dirname, '../../templates');
        const files = await fs.readdir(templateDir);

        const templates = [];

        for (const file of files) {
            if (file.endsWith('.html')) {
                const stats = await fs.stat(path.join(templateDir, file));
                templates.push({
                    filename: file,
                    name: file.replace('.html', ''),
                    type: 'template',
                    size: stats.size,
                    location: 'local',
                    url: `http://${config.server.host}:${config.server.templatePort}/template/${file}`,
                    modified: stats.mtime
                });
            }
        }

        Logger.info('MEDIA', `Found ${templates.length} templates`);

        res.json({
            success: true,
            count: templates.length,
            files: templates
        });

    } catch (error) {
        Logger.error('MEDIA', `Failed to get templates: ${error.message}`);
        throw new AppError('Failed to get template list', 500);
    }
}));

// GET /api/media/caspar
// Lista media disponibili su CasparCG usando FTP fallback
router.get('/caspar', asyncHandler(async (req, res) => {
    Logger.info('MEDIA', 'Getting media list from CasparCG');

    try {
        // Usa FTP per ottenere la lista dei file
        const files = await FTPService.listRemoteFiles();

        // Ottieni i media dal database per recuperare i nomi originali
        const dbMedia = await DatabaseService.getMediaAssets();

        // Trasforma il formato per il frontend
        const mediaFiles = files.map(file => {
            const filename = file.name || file.filename;

            // Cerca se abbiamo il nome originale nel database
            const dbEntry = dbMedia.find(m =>
                m.filename === filename ||
                m.caspar_path === filename ||
                m.file_path === filename
            );

            return {
                filename: filename,  // Nome reale del file su CasparCG
                name: filename,
                display_name: dbEntry?.original_filename || filename, // Nome da mostrare
                original_name: dbEntry?.original_filename,
                type: file.type || 'unknown',
                size: file.size || 0,
                location: 'caspar',
                modified: file.modifiedAt || file.date
            };
        });

        Logger.info('MEDIA', `Found ${mediaFiles.length} media files on CasparCG`);

        res.json({
            success: true,
            count: mediaFiles.length,
            files: mediaFiles
        });

    } catch (error) {
        Logger.error('MEDIA', `Failed to get media from CasparCG: ${error.message}`);

        // Fallback: restituisci lista vuota invece di errore
        res.json({
            success: true,
            count: 0,
            files: [],
            warning: 'Could not connect to CasparCG media server'
        });
    }
}));

// DELETE /api/media/ftp/:filename
// Elimina file remoto da CasparCG (USARE CON CAUTELA!)
router.delete('/ftp/:filename', asyncHandler(async (req, res) => {
    const filename = req.params.filename;

    // Conferma sicurezza - richiedi conferma esplicita
    if (req.body.confirm !== true) {
        throw new AppError('Deletion must be explicitly confirmed with confirm:true', 400);
    }

    Logger.warn('MEDIA', `⚠️ Deleting remote file from CasparCG: ${filename}`);

    try {
        const result = await FTPService.deleteRemoteFile(filename);

        // Rimuovi anche dal database
        const assets = await DatabaseService.getMediaAssets();
        const asset = assets.find(a => a.filename === filename || a.caspar_path === filename);

        if (asset) {
            await DatabaseService.deleteMediaAsset(asset.id);
        }

        Logger.warn('MEDIA', `File deleted from CasparCG: ${filename}`);

        WebSocketService.broadcast({
            type: 'media_deleted_from_caspar',
            filename: filename,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'File deleted from CasparCG',
            ...result
        });

    } catch (error) {
        Logger.error('MEDIA', `Failed to delete remote file: ${error.message}`);
        throw new AppError(`Failed to delete file: ${error.message}`, 500);
    }
}));

// GET /api/media/stream/:filename - Stream video from CasparCG via FTP
router.get('/stream/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    try {
        // Verifica se il file esiste localmente
        const localPath = path.join(config.media.uploadPath, filename);
        const existsLocally = await fs.pathExists(localPath);

        if (existsLocally) {
            // Serve il file locale
            Logger.info('MEDIA', `Streaming local file: ${filename}`);
            res.sendFile(path.resolve(localPath));
        } else {
            // Scarica da CasparCG via FTP e streamma
            Logger.info('MEDIA', `Streaming from CasparCG via FTP: ${filename}`);

            if (!config.ftp.enabled) {
                throw new AppError('FTP is not configured', 503);
            }

            // Imposta headers appropriati
            const ext = path.extname(filename).toLowerCase();
            let contentType = 'application/octet-stream';

            if (ext === '.mp4') contentType = 'video/mp4';
            else if (ext === '.mov') contentType = 'video/quicktime';
            else if (ext === '.avi') contentType = 'video/x-msvideo';
            else if (ext === '.mkv') contentType = 'video/x-matroska';
            else if (ext === '.wav') contentType = 'audio/wav';
            else if (ext === '.mp3') contentType = 'audio/mpeg';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

            // Streamma direttamente dalla connessione FTP alla risposta HTTP
            await FTPService.downloadFile(filename, res);
        }
    } catch (error) {
        Logger.error('MEDIA', `Streaming error: ${error.message}`, { filename });

        if (!res.headersSent) {
            res.status(404).json({
                error: 'File not found',
                message: error.message
            });
        }
    }
}));

// Helper function to extract video metadata (duration, resolution)
function getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                Logger.warn('MEDIA', `Failed to extract video metadata: ${err.message}`);
                return resolve({ duration: null, resolution: null });
            }

            try {
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                const duration = metadata.format.duration ? Math.round(metadata.format.duration) : null;
                const resolution = videoStream ? `${videoStream.width}×${videoStream.height}` : null;

                resolve({ duration, resolution });
            } catch (error) {
                Logger.warn('MEDIA', `Failed to parse video metadata: ${error.message}`);
                resolve({ duration: null, resolution: null });
            }
        });
    });
}

// Helper function to determine file type
function getFileType(extension) {
    if (config.media.allowedVideoTypes.includes(extension)) return 'video';
    if (config.media.allowedAudioTypes.includes(extension)) return 'audio';
    if (config.media.allowedImageTypes.includes(extension)) return 'image';
    if (config.media.allowedTemplateTypes.includes(extension)) return 'template';
    return 'unknown';
}

module.exports = router;