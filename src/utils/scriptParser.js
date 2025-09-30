/**
 * Script Parser Utility
 * Parsing degli script in comandi di automazione
 */

const config = require('../config');

/**
 * Parse script text to automation commands
 */
function parseScriptToCommands(script) {
    if (!script) return [];

    const commands = [];
    let currentTime = 0;
    const lines = script.split('\n');
    let textBuffer = '';
    let videoContext = null;  // Track current video context for overlays

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();

        // Check for automation commands
        if (trimmedLine.startsWith('((') && trimmedLine.endsWith('))')) {
            // If we have accumulated text, create a presenter cue
            if (textBuffer.trim()) {
                // IMPORTANT: Close any open video context first!
                // This ensures currentTime is at the end of previous video
                if (videoContext) {
                    currentTime = videoContext.endTime;
                    videoContext = null;
                }

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
                // Handle TAKE VTR - starts a potential video context
                if (command.type === 'TAKE_VTR') {
                    // If we were in video context, close it first
                    if (videoContext) {
                        currentTime = videoContext.endTime;
                    }

                    videoContext = {
                        startTime: currentTime,
                        duration: command.duration,
                        endTime: currentTime + command.duration
                    };
                    commands.push(command);
                    // Don't advance time yet - wait to see if there are overlays
                }
                // Handle WAIT - could be timing for overlays or standalone
                else if (command.type === 'WAIT') {
                    // Check if next command is GFX and we're in video context
                    let nextIsGfx = false;
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        if (nextLine.toUpperCase().includes('GFX') && videoContext) {
                            nextIsGfx = true;
                        }
                    }

                    if (nextIsGfx && videoContext) {
                        // This WAIT sets timing for next GFX within video
                        // Calculate time from video start
                        currentTime = videoContext.startTime + command.duration;
                        // Don't add WAIT to commands - it's just for timing
                    } else if (videoContext) {
                        // WAIT after GFX ON means duration for GFX display
                        // Update time but don't add WAIT
                        currentTime = currentTime + command.duration;
                    } else {
                        // Standalone WAIT - add it
                        commands.push(command);
                        currentTime += command.duration;
                    }
                }
                // Handle GFX ON
                else if (command.type === 'GFX_ON' && videoContext) {
                    // GFX during video - use current time (set by previous WAIT)
                    command.start_time = currentTime;
                    commands.push(command);
                    // Track when GFX was started for proper OFF timing
                    videoContext.gfxStartTime = currentTime;
                    videoContext.gfxDuration = command.duration || 3; // Default 3 seconds
                }
                // Handle GFX OFF
                else if (command.type === 'GFX_OFF' && videoContext) {
                    // GFX OFF should happen after GFX duration
                    if (videoContext.gfxStartTime !== undefined) {
                        command.start_time = videoContext.gfxStartTime + videoContext.gfxDuration;
                    } else {
                        command.start_time = currentTime + 3; // Default 3 seconds after ON
                    }
                    commands.push(command);

                    // After GFX OFF, end video context
                    currentTime = videoContext.endTime;
                    videoContext = null;
                }
                // Other commands
                else {
                    // If we were in video context, end it
                    if (videoContext) {
                        currentTime = videoContext.endTime;
                        videoContext = null;
                    }

                    commands.push(command);

                    if (command.duration) {
                        currentTime += command.duration;
                    }
                }
            }
        } else if (trimmedLine) {
            textBuffer += trimmedLine + ' ';
        }
    }

    // If we ended in video context, update time
    if (videoContext) {
        currentTime = videoContext.endTime;
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

/**
 * Parse individual automation command
 */
function parseAutomationCommand(commandLine, startTime) {
    // Remove (( and ))
    const content = commandLine.slice(2, -2).trim();

    // Handle WAIT commands specially
    if (content.toUpperCase().startsWith('WAIT')) {
        const waitMatch = content.match(/WAIT\s+(\d+)/i);
        const waitTime = waitMatch ? parseInt(waitMatch[1]) : 1;
        return {
            type: 'WAIT',
            start_time: startTime,
            duration: waitTime,
            caspar_command: null,
            parameters: { waitTime }
        };
    }

    // Parse standard commands with delimiter
    const parts = content.split(' - ').map(p => p.trim());
    const commandType = parts[0].toUpperCase();

    switch (commandType) {
        case 'TAKE VTR':
        case 'TAKE PKG':
            const filename = parts[1] ? parts[1].replace(/"/g, '') : '';
            const duration = parts[2] ? parseDuration(parts[2]) : 8;
            return {
                type: 'TAKE_VTR',
                start_time: startTime,
                duration: duration,
                caspar_command: `PLAY 1-1 "${filename}"`,
                parameters: { filename, auto_next: true }
            };

        case 'GFX ON':
            let templateName = parts[1] ? parts[1].replace(/"/g, '') : '';
            // Ensure .html extension
            if (templateName && !templateName.endsWith('.html')) {
                templateName += '.html';
            }
            return {
                type: 'GFX_ON',
                start_time: startTime,
                duration: 5,
                caspar_command: `CG 1-2 ADD 0 "http://${config.server.host}:${config.server.templatePort}/template/${templateName}" 1`,
                parameters: { template: templateName }
            };

        case 'GFX OFF':
            return {
                type: 'GFX_OFF',
                start_time: startTime,
                duration: 1,
                caspar_command: 'CG 1-2 REMOVE 0',
                parameters: {}
            };

        case 'AUDIO':
            const audioFilename = parts[1] ? parts[1].replace(/"/g, '') : '';
            const audioDuration = parts[2] ? parseDuration(parts[2]) : 10;
            return {
                type: 'AUDIO',
                start_time: startTime,
                duration: audioDuration,
                caspar_command: `PLAY 1-2 "${audioFilename}"`,
                parameters: { filename: audioFilename }
            };

        case 'SOT UP':
        case 'SOT UNDER':
            const audioFile = parts[1] ? parts[1].replace(/"/g, '') : '';
            const sotDuration = parts[2] ? parseDuration(parts[2]) : 15;
            const level = commandType === 'SOT UP' ? 1.0 : 0.3;
            return {
                type: 'AUDIO_SOT',
                start_time: startTime,
                duration: sotDuration,
                caspar_command: `MIXER 1-1 VOLUME ${level}`,
                parameters: { file: audioFile, level: commandType }
            };

        default:
            return null;
    }
}

/**
 * Parse duration string (MM:SS or seconds)
 */
function parseDuration(durationStr) {
    if (typeof durationStr === 'number') return durationStr;

    const str = String(durationStr);
    const parts = str.split(':');

    if (parts.length === 2) {
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(str) || 8;
}

/**
 * Estimate reading time for text
 */
function estimateReadingTime(text) {
    // Average reading speed: 150 words per minute
    // Average word length: 5 characters
    const characters = text.length;
    const words = characters / 5;
    const minutes = words / 150;
    return Math.max(Math.ceil(minutes * 60), 5); // Minimum 5 seconds
}

/**
 * Calculate total duration from commands
 */
function calculateTotalDuration(commands) {
    if (!commands || commands.length === 0) return 0;

    let maxEndTime = 0;

    for (const command of commands) {
        const endTime = command.start_time + command.duration;
        if (endTime > maxEndTime) {
            maxEndTime = endTime;
        }
    }

    return maxEndTime;
}

/**
 * Format duration to MM:SS
 */
function formatDuration(seconds) {
    if (!seconds) return '00:00';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Validate script syntax
 */
function validateScript(script) {
    const errors = [];
    const lines = script.split('\n');

    let openParens = 0;

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // Check for unclosed automation commands
        if (trimmed.includes('((')) {
            openParens++;
            if (!trimmed.includes('))')) {
                errors.push({
                    line: index + 1,
                    message: 'Unclosed automation command',
                    text: trimmed
                });
            }
        }

        if (trimmed.includes('))') && !trimmed.includes('((')) {
            errors.push({
                line: index + 1,
                message: 'Closing parentheses without opening',
                text: trimmed
            });
        }

        // Validate command format
        if (trimmed.startsWith('((') && trimmed.endsWith('))')) {
            const content = trimmed.slice(2, -2).trim();
            const validCommands = [
                'TAKE VTR', 'TAKE PKG', 'GFX ON', 'GFX OFF',
                'AUDIO', 'SOT UP', 'SOT UNDER', 'WAIT'
            ];

            const commandType = content.split(' - ')[0].toUpperCase();
            const isWait = content.toUpperCase().startsWith('WAIT');

            if (!isWait && !validCommands.some(cmd => commandType.startsWith(cmd))) {
                errors.push({
                    line: index + 1,
                    message: `Unknown command type: ${commandType}`,
                    text: trimmed
                });
            }
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    parseScriptToCommands,
    parseAutomationCommand,
    parseDuration,
    estimateReadingTime,
    calculateTotalDuration,
    formatDuration,
    validateScript
};