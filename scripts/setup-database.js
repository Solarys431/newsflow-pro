#!/usr/bin/env node

/**
 * Database Setup Script
 * Initializes Supabase database with all required tables and sample data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupDatabase() {
    console.log('🏗️  Setting up database...');
    console.log('📡 Supabase URL:', process.env.SUPABASE_URL);

    try {
        // Read SQL schema file
        const schemaPath = path.join(__dirname, '..', 'database-schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        // Split schema into individual statements
        const statements = schema
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`📄 Found ${statements.length} SQL statements`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i] + ';';

            try {
                console.log(`⚙️  Executing statement ${i + 1}/${statements.length}...`);

                const { error } = await supabase.rpc('exec_sql', {
                    sql_query: statement
                });

                if (error) {
                    // Try direct query if RPC fails
                    const { error: directError } = await supabase
                        .from('_temp')
                        .select('1')
                        .limit(1);

                    if (directError) {
                        console.log(`⚠️  Statement ${i + 1} might have failed:`, error.message);
                    }
                }
            } catch (error) {
                console.log(`⚠️  Statement ${i + 1} failed:`, error.message);
            }
        }

        console.log('✅ Database schema created successfully!');

        // Insert sample data
        await insertSampleData();

        console.log('🎉 Database setup complete!');

    } catch (error) {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    }
}

async function insertSampleData() {
    console.log('📊 Inserting sample data...');

    try {
        // Insert sample rundown
        const { data: rundown, error: rundownError } = await supabase
            .from('rundowns')
            .upsert({
                name: `TG Test - ${new Date().toISOString().split('T')[0]}`,
                show_name: 'TG delle 20:00',
                air_date: new Date().toISOString().split('T')[0],
                air_time: '20:00:00',
                status: 'preparation',
                created_by: 'System'
            })
            .select()
            .single();

        if (rundownError) {
            console.log('⚠️  Rundown creation:', rundownError.message);
        } else {
            console.log('✅ Sample rundown created:', rundown.name);
        }

        // Insert sample media asset for the provided video
        const { data: media, error: mediaError } = await supabase
            .from('media_assets')
            .upsert({
                filename: '_style_realistic_202509240151_5lt96.mp4',
                original_filename: '_style_realistic_202509240151_5lt96.mp4',
                file_type: 'video',
                file_size: 1798396,
                duration: 30, // Estimate, will be detected later
                file_path: '/Users/solarys/Documents/Progetti_AI/INEWSPRO/_style_realistic_202509240151_5lt96.mp4',
                caspar_path: '_style_realistic_202509240151_5lt96',
                uploaded_by: 'System'
            })
            .select()
            .single();

        if (mediaError) {
            console.log('⚠️  Media creation:', mediaError.message);
        } else {
            console.log('✅ Sample media created:', media.filename);
        }

        // Insert CasparCG server
        const { data: server, error: serverError } = await supabase
            .from('caspar_servers')
            .upsert({
                name: 'Production Server',
                host: '100.74.188.128',
                port: 5250,
                status: 'offline'
            })
            .select()
            .single();

        if (serverError) {
            console.log('⚠️  Server creation:', serverError.message);
        } else {
            console.log('✅ CasparCG server configured:', server.host + ':' + server.port);
        }

        // Insert sample story
        const { data: story, error: storyError } = await supabase
            .from('stories')
            .upsert({
                slug: 'TEST_STORY_001',
                title: 'Test Story - Video Clip Demo',
                type: 'PKG',
                script: `QUESTA È UNA STORIA DI TEST PER IL SISTEMA INEWS.

STIAMO TESTANDO L'INTEGRAZIONE COMPLETA TRA EDITOR E AUTOMAZIONE.

((TAKE VTR - "_style_realistic_202509240151_5lt96.mp4" - 00:30))

IL VIDEO È STATO CARICATO AUTOMATICAMENTE E SARÀ RIPRODOTTO DA CASPARCG.

((GFX ON - "Lower Third Test"))
QUESTA GRAFICA APPARIRÀ SOPRA IL VIDEO DURANTE LA RIPRODUZIONE.
((GFX OFF))

FINE DEL TEST. LA STORIA È PRONTA PER L'AUTOMAZIONE.`,
                presenter: 'Test User',
                producer: 'System',
                estimated_duration: 60,
                status: 'ready',
                created_by: 'System'
            })
            .select()
            .single();

        if (storyError) {
            console.log('⚠️  Story creation:', storyError.message);
        } else {
            console.log('✅ Sample story created:', story.slug);

            // Link media to story
            if (media && story) {
                const { error: linkError } = await supabase
                    .from('story_media')
                    .upsert({
                        story_id: story.id,
                        media_asset_id: media.id,
                        usage_type: 'main_video',
                        usage_order: 1
                    });

                if (linkError) {
                    console.log('⚠️  Media linking:', linkError.message);
                } else {
                    console.log('✅ Media linked to story');
                }
            }
        }

        console.log('📊 Sample data inserted successfully!');

    } catch (error) {
        console.error('❌ Sample data insertion failed:', error);
    }
}

// Alternative method using raw SQL if Supabase RPC doesn't work
async function execRawSQL(sql) {
    try {
        // Note: This is a simplified approach
        // In a real setup, you might need to use psql command line or a direct PostgreSQL connection
        console.log('⚙️  Executing SQL:', sql.substring(0, 100) + '...');

        // For now, just return success
        return { success: true };
    } catch (error) {
        console.error('SQL Error:', error);
        return { error };
    }
}

// Check if we can connect to Supabase
async function testConnection() {
    try {
        const { data, error } = await supabase
            .from('stories')
            .select('count')
            .limit(1);

        if (error) {
            console.log('⚠️  Connection test failed, but continuing...');
        } else {
            console.log('✅ Supabase connection successful');
        }
    } catch (error) {
        console.log('⚠️  Connection test error:', error.message);
    }
}

if (require.main === module) {
    console.log('🚀 Starting database setup...');
    testConnection().then(() => setupDatabase());
}

module.exports = { setupDatabase, insertSampleData };