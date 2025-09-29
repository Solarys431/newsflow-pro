/**
 * Stories Controller
 * Gestione delle storie
 */

const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const WebSocketService = require('../services/WebSocketService');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { parseScriptToCommands, calculateTotalDuration } = require('../utils/scriptParser');
const Logger = require('../middleware/logger');

// GET /api/stories
router.get('/', asyncHandler(async (req, res) => {
    const stories = await DatabaseService.getStories(req.query);
    res.json(stories);
}));

// GET /api/stories/:id
router.get('/:id', asyncHandler(async (req, res) => {
    const story = await DatabaseService.getStoryById(req.params.id);
    if (!story) {
        throw new AppError('Story not found', 404);
    }
    res.json(story);
}));

// POST /api/stories
router.post('/', asyncHandler(async (req, res) => {
    const story = await DatabaseService.createStory(req.body);

    WebSocketService.broadcast({
        type: 'story_created',
        story: story,
        timestamp: new Date().toISOString()
    });

    res.status(201).json(story);
}));

// PUT /api/stories/:id
router.put('/:id', asyncHandler(async (req, res) => {
    const story = await DatabaseService.updateStory(req.params.id, req.body);

    if (!story) {
        throw new AppError('Story not found', 404);
    }

    WebSocketService.broadcast({
        type: 'story_updated',
        story: story,
        timestamp: new Date().toISOString()
    });

    res.json(story);
}));

// DELETE /api/stories/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const story = await DatabaseService.deleteStory(req.params.id);

    if (!story) {
        throw new AppError('Story not found', 404);
    }

    WebSocketService.broadcast({
        type: 'story_deleted',
        story: story,
        timestamp: new Date().toISOString()
    });

    res.json({
        success: true,
        message: 'Story deleted successfully',
        deleted_story: story
    });
}));

// POST /api/stories/:id/parse
router.post('/:id/parse', asyncHandler(async (req, res) => {
    const story = await DatabaseService.getStoryById(req.params.id);

    if (!story) {
        throw new AppError('Story not found', 404);
    }

    const commands = parseScriptToCommands(story.script);
    const totalDuration = calculateTotalDuration(commands);

    res.json({
        story_id: story.id,
        commands: commands,
        estimated_duration: totalDuration
    });
}));

// POST /api/stories/:id/send-to-rundown
router.post('/:id/send-to-rundown', asyncHandler(async (req, res) => {
    const story = await DatabaseService.getStoryById(req.params.id);

    if (!story) {
        throw new AppError('Story not found', 404);
    }

    // Parse script to commands
    const commands = parseScriptToCommands(story.script);
    const totalDuration = calculateTotalDuration(commands);

    // Get current rundown or use provided rundown_id
    let rundownId = req.body.rundown_id;
    if (!rundownId) {
        const rundown = await DatabaseService.getCurrentRundown();
        rundownId = rundown.id;
    }

    // Get position from request or calculate next available
    let position = req.body.position;
    const items = await DatabaseService.getRundownItems(rundownId);

    // Check if story is already in this rundown
    const existingItem = items.find(item => item.story_id === story.id);

    let rundownItem;

    if (existingItem) {
        // Story is already in rundown - UPDATE it
        Logger.info('Stories', `Updating existing rundown item for story ${story.id}`);

        // Delete old automation commands
        await DatabaseService.deleteAutomationCommands(existingItem.id);

        // Update position if specified and different
        if (position && position !== existingItem.position) {
            // Check if new position is taken by another story
            const positionTaken = items.some(item =>
                item.position === parseInt(position) && item.id !== existingItem.id
            );

            if (!positionTaken) {
                // Update the position
                await DatabaseService.updateRundownItem(existingItem.id, {
                    position: parseInt(position),
                    estimated_duration: totalDuration
                });
                existingItem.position = parseInt(position);
            } else {
                Logger.warn('Stories', `Position ${position} is taken, keeping current position ${existingItem.position}`);
            }
        } else {
            // Just update duration
            await DatabaseService.updateRundownItem(existingItem.id, {
                estimated_duration: totalDuration
            });
        }

        rundownItem = existingItem;
    } else {
        // Story is not in rundown - ADD it
        if (position) {
            // Check if position is already taken
            const positionTaken = items.some(item => item.position === parseInt(position));
            if (positionTaken) {
                // Find the next available position after the requested one
                const maxPosition = items.reduce((max, item) => Math.max(max, item.position || 0), 0);
                position = maxPosition + 1;
                Logger.warn('Stories', `Position ${req.body.position} was taken, using ${position} instead`);
            }
        } else {
            // Find the max position and add 1
            const maxPosition = items.reduce((max, item) => Math.max(max, item.position || 0), 0);
            position = maxPosition + 1;
        }

        // Create new rundown item
        rundownItem = await DatabaseService.createRundownItem(
            rundownId,
            story.id,
            position,
            totalDuration
        );
    }

    // Create new automation commands
    for (let i = 0; i < commands.length; i++) {
        await DatabaseService.createAutomationCommand({
            rundown_item_id: rundownItem.id,
            sequence_order: i + 1,
            command_type: commands[i].type,
            start_time: commands[i].start_time,
            duration: commands[i].duration,
            caspar_command: commands[i].caspar_command,
            parameters: commands[i].parameters
        });
    }

    // Update story status
    await DatabaseService.updateStory(story.id, {
        status: 'sent'
    });

    WebSocketService.broadcast({
        type: 'story_sent_to_rundown',
        story: story,
        rundown_item: rundownItem,
        commands: commands.length,
        timestamp: new Date().toISOString()
    });

    res.json({
        success: true,
        rundown_item: rundownItem,
        commands_created: commands.length,
        estimated_duration: totalDuration,
        message: existingItem ? 'Story updated in rundown' : 'Story added to rundown'
    });
}));

module.exports = router;