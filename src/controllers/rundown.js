/**
 * Rundown Controller
 * Gestione dei rundown
 */

const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const WebSocketService = require('../services/WebSocketService');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Logger = require('../middleware/logger');

// GET /api/rundown - Get all rundowns
router.get('/', asyncHandler(async (req, res) => {
    const rundowns = await DatabaseService.getRundowns();
    res.json(rundowns);
}));

// GET /api/rundown/current
router.get('/current', asyncHandler(async (req, res) => {
    const rundown = await DatabaseService.getCurrentRundown();
    res.json(rundown);
}));

// POST /api/rundown - Create new rundown
router.post('/', asyncHandler(async (req, res) => {
    const rundown = await DatabaseService.createRundown(req.body);

    WebSocketService.broadcast({
        type: 'rundown_created',
        rundown: rundown,
        timestamp: new Date().toISOString()
    });

    Logger.info('Rundown', `Created new rundown: ${rundown.name}`);

    res.json({
        success: true,
        rundown
    });
}));

// GET /api/rundown/:id/details - Get rundown details
router.get('/:id/details', asyncHandler(async (req, res) => {
    const rundown = await DatabaseService.getRundownById(req.params.id);
    if (!rundown) {
        throw new AppError('Rundown not found', 404);
    }
    res.json(rundown);
}));

// GET /api/rundown/:id/items - Get rundown items
router.get('/:id/items', asyncHandler(async (req, res) => {
    const items = await DatabaseService.getRundownItems(req.params.id);
    res.json(items);
}));

// Alias for backward compatibility
router.get('/:id', asyncHandler(async (req, res) => {
    const items = await DatabaseService.getRundownItems(req.params.id);
    res.json(items);
}));

// PUT /api/rundown/:id - Update rundown
router.put('/:id', asyncHandler(async (req, res) => {
    const rundown = await DatabaseService.updateRundown(req.params.id, req.body);

    if (!rundown) {
        throw new AppError('Rundown not found', 404);
    }

    WebSocketService.broadcast({
        type: 'rundown_updated',
        rundown: rundown,
        timestamp: new Date().toISOString()
    });

    res.json({
        success: true,
        rundown
    });
}));

// DELETE /api/rundown/:id - Delete rundown
router.delete('/:id', asyncHandler(async (req, res) => {
    const rundown = await DatabaseService.deleteRundown(req.params.id);

    if (!rundown) {
        throw new AppError('Rundown not found', 404);
    }

    WebSocketService.broadcast({
        type: 'rundown_deleted',
        rundown_id: req.params.id,
        timestamp: new Date().toISOString()
    });

    Logger.warn('Rundown', `Deleted rundown: ${rundown.name}`);

    res.json({
        success: true,
        message: 'Rundown deleted successfully',
        deleted_rundown: rundown
    });
}));

// DELETE /api/rundown/items/:id
router.delete('/items/:id', asyncHandler(async (req, res) => {
    const item = await DatabaseService.deleteRundownItem(req.params.id);

    if (!item) {
        throw new AppError('Rundown item not found', 404);
    }

    WebSocketService.broadcast({
        type: 'rundown_item_removed',
        item_id: req.params.id,
        timestamp: new Date().toISOString()
    });

    res.json({
        success: true,
        message: 'Rundown item removed successfully',
        removed_item: item
    });
}));

module.exports = router;