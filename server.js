#!/usr/bin/env node

/**
 * iNEWS Professional - Server Entry Point
 * Sistema newsroom professionale con architettura modulare
 *
 * @version 2.0.0
 * @author iNEWS Team
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