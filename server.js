#!/usr/bin/env node

/**
 * NewsFlow Pro - Server Entry Point
 * Enterprise broadcast newsroom system with modular architecture
 *
 * @version 2.1.0
 * @author NewsFlow Pro Team
 */

// Load environment variables
require('dotenv').config();

// Import application
const Application = require('./src/app');

// Create and start application
const app = new Application();

// Start the server
app.start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});