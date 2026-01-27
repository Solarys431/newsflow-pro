/**
 * Error Handler Middleware
 * Gestione centralizzata degli errori
 */

const Logger = require('./logger');

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();

        Error.captureStackTrace(this, this.constructor);
    }
}

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    Logger.error('API', `${req.method} ${req.originalUrl} - ${err.message}`, {
        statusCode: err.statusCode || 500,
        stack: err.stack,
        body: req.body,
        params: req.params,
        query: req.query,
        ip: req.ip
    });

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Invalid ID format';
        error = new AppError(message, 400);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = new AppError(message, 400);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = new AppError(message, 400);
    }

    // PostgreSQL errors
    if (err.code === '23505') { // Unique violation
        error = new AppError('Duplicate value violates unique constraint', 409);
    }

    if (err.code === '23503') { // Foreign key violation
        error = new AppError('Foreign key constraint violation', 400);
    }

    // Send error response
    res.status(error.statusCode || 500).json({
        success: false,
        error: {
            message: error.message || 'Server Error',
            statusCode: error.statusCode || 500,
            timestamp: error.timestamp || new Date().toISOString(),
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
const notFound = (req, res, next) => {
    const error = new AppError(`Not found - ${req.originalUrl}`, 404);
    next(error);
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler,
    notFound
};