/**
 * Validation Middleware
 * Validazione input e sanitizzazione
 */

const { AppError } = require('./errorHandler');

// Story validation rules
const storyValidationRules = {
    slug: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: /^[A-Z0-9_-]+$/i
    },
    title: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 500
    },
    type: {
        required: true,
        type: 'string',
        enum: ['PKG', 'VO', 'SOT', 'LIVE', 'GFX']
    },
    script: {
        required: false,
        type: 'string',
        maxLength: 10000
    },
    presenter: {
        required: false,
        type: 'string',
        maxLength: 100
    },
    producer: {
        required: false,
        type: 'string',
        maxLength: 100
    },
    status: {
        required: false,
        type: 'string',
        enum: ['draft', 'ready', 'approved', 'sent', 'aired']
    }
};

// Validate story input
const validateStory = (req, res, next) => {
    const errors = [];

    // Check required fields
    for (const [field, rules] of Object.entries(storyValidationRules)) {
        const value = req.body[field];

        if (rules.required && !value) {
            errors.push(`${field} is required`);
            continue;
        }

        if (!value) continue;

        // Type validation
        if (rules.type && typeof value !== rules.type) {
            errors.push(`${field} must be a ${rules.type}`);
        }

        // Length validation
        if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${field} must be at least ${rules.minLength} characters`);
        }

        if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} must not exceed ${rules.maxLength} characters`);
        }

        // Pattern validation
        if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${field} has invalid format`);
        }

        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
        }
    }

    if (errors.length > 0) {
        return next(new AppError(`Validation failed: ${errors.join(', ')}`, 400));
    }

    // Sanitize input
    sanitizeInput(req.body);

    next();
};

// Sanitize input to prevent XSS
const sanitizeInput = (obj) => {
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            // Remove dangerous tags and scripts
            obj[key] = obj[key]
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeInput(obj[key]);
        }
    }
    return obj;
};

// Validate UUID
const validateUUID = (req, res, next) => {
    const id = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
        return next(new AppError('Invalid ID format', 400));
    }

    next();
};

// Validate pagination
const validatePagination = (req, res, next) => {
    const { limit = 50, offset = 0 } = req.query;

    req.query.limit = Math.min(Math.max(1, parseInt(limit)), 100);
    req.query.offset = Math.max(0, parseInt(offset));

    next();
};

// Validate file upload
const validateFileUpload = (allowedTypes, maxSize) => {
    return (req, res, next) => {
        if (!req.file) {
            return next(new AppError('No file uploaded', 400));
        }

        const extension = req.file.originalname.split('.').pop().toLowerCase();

        if (!allowedTypes.includes(`.${extension}`)) {
            return next(new AppError(`File type .${extension} not allowed`, 400));
        }

        if (req.file.size > maxSize) {
            return next(new AppError(`File size exceeds limit of ${maxSize} bytes`, 400));
        }

        next();
    };
};

// Validate command input
const validateCommand = (req, res, next) => {
    const { command, channel, layer } = req.body;

    if (!command) {
        return next(new AppError('Command is required', 400));
    }

    if (channel !== undefined) {
        const ch = parseInt(channel);
        if (isNaN(ch) || ch < 1 || ch > 10) {
            return next(new AppError('Channel must be between 1 and 10', 400));
        }
        req.body.channel = ch;
    }

    if (layer !== undefined) {
        const ly = parseInt(layer);
        if (isNaN(ly) || ly < 0 || ly > 100) {
            return next(new AppError('Layer must be between 0 and 100', 400));
        }
        req.body.layer = ly;
    }

    next();
};

module.exports = {
    validateStory,
    validateUUID,
    validatePagination,
    validateFileUpload,
    validateCommand,
    sanitizeInput
};