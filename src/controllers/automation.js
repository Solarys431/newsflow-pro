/**
 * Automation Controller
 * Gestione automazione CasparCG
 */

const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const CasparService = require('../services/CasparService');
const WebSocketService = require('../services/WebSocketService');
const Logger = require('../middleware/logger');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const config = require('../config');

// POST /api/automation/execute/:itemId
router.post('/execute/:itemId', asyncHandler(async (req, res) => {
    const itemId = req.params.itemId;

    // Get rundown item
    const item = await DatabaseService.getRundownItemById(itemId);
    if (!item) {
        throw new AppError('Rundown item not found', 404);
    }

    // Check CasparCG connection
    if (!CasparService.isConnected()) {
        throw new AppError('CasparCG not connected', 503);
    }

    // Get automation commands
    const commands = await DatabaseService.getAutomationCommands(itemId);

    Logger.info('AUTOMATION', `Executing ${commands.length} commands for item ${itemId}`);

    const results = [];
    const startTime = Date.now();
    let commandsCompleted = 0;
    let maxDuration = 0;

    // Find max duration for response timing
    commands.forEach(cmd => {
        const endTime = cmd.start_time + (cmd.duration || 0);
        if (endTime > maxDuration) maxDuration = endTime;
    });

    // Schedule all commands at once with their absolute timing
    const executeCommand = async (command, index) => {
        const elapsed = command.start_time;
        Logger.info('AUTOMATION', `[${elapsed}s] Executing: ${command.command_type}`);

        try {
            let result;

            switch (command.command_type) {
                case 'TAKE_VTR':
                    const filename = command.parameters.filename;
                    result = await CasparService.playVideo(1, 1, filename);
                    break;

                case 'GFX_ON':
                    let templateName = command.parameters.template;
                    // Ensure .html extension
                    if (templateName && !templateName.endsWith('.html')) {
                        templateName += '.html';
                    }
                    const templateUrl = `http://${config.server.host}:${config.server.templatePort}/template/${templateName}`;
                    result = await CasparService.loadTemplate(1, 2, templateUrl, true);
                    break;

                case 'GFX_OFF':
                    result = await CasparService.removeTemplate(1, 2);
                    break;

                case 'AUDIO':
                    const audioFilename = command.parameters.filename;
                    result = await CasparService.playVideo(1, 10, audioFilename);
                    break;

                case 'AUDIO_SOT':
                    const volume = command.parameters.level === 'UP' ? 1.0 : 0.3;
                    result = await CasparService.setVolume(1, 1, volume);
                    break;

                case 'PRESENTER_CUE':
                case 'WAIT':
                    result = { success: true, message: command.command_type };
                    break;

                default:
                    Logger.warn('AUTOMATION', `Unknown command type: ${command.command_type}`);
                    result = { success: false, message: 'Unknown command' };
            }

            results[index] = {
                command: index + 1,
                type: command.command_type,
                status: 'success',
                result: result,
                executed_at: elapsed
            };

            await DatabaseService.updateAutomationCommandStatus(command.id, 'completed');

        } catch (error) {
            Logger.error('AUTOMATION', `Command failed: ${error.message}`, { command });

            results[index] = {
                command: index + 1,
                type: command.command_type,
                status: 'error',
                error: error.message,
                executed_at: elapsed
            };

            await DatabaseService.updateAutomationCommandStatus(command.id, 'error', error.message);
        }

        commandsCompleted++;

        // If all commands are done, send response
        if (commandsCompleted === commands.length) {
            // Update rundown item status
            await DatabaseService.updateRundownItemStatus(itemId, 'completed');

            WebSocketService.broadcast({
                type: 'automation_executed',
                item_id: itemId,
                commands: results.length,
                success: results.filter(r => r && r.status === 'success').length,
                results: results.filter(r => r) // Filter out any undefined
            });
        }
    };

    // Schedule each command with its absolute start_time
    commands.forEach((command, index) => {
        const delay = command.start_time * 1000; // Convert to milliseconds

        setTimeout(() => {
            executeCommand(command, index);
        }, delay);
    });

    // Return immediately with scheduled status
    res.json({
        success: true,
        commands_scheduled: commands.length,
        total_duration: maxDuration,
        message: 'Commands scheduled for execution'
    });

    // Note: Results will be sent via WebSocket when execution completes
}));

// GET /api/automation/commands/:itemId
router.get('/commands/:itemId', asyncHandler(async (req, res) => {
    const commands = await DatabaseService.getAutomationCommands(req.params.itemId);
    res.json(commands);
}));

module.exports = router;