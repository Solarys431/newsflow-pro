/**
 * DatabaseService - Gestione unificata database
 * Supporta sia Supabase che PostgreSQL diretto
 */

const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const config = require('../config');
const Logger = require('../middleware/logger');

class DatabaseService {
    constructor() {
        this.mode = null;
        this.client = null;
        this.pool = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Priorità: Supabase se configurato, altrimenti PostgreSQL diretto
            if (config.database.supabase.serviceKey) {
                await this.initSupabase();
            } else {
                await this.initPostgres();
            }
            this.initialized = true;
            console.log(`✅ Database initialized in ${this.mode} mode`);
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    async initSupabase() {
        this.client = createClient(
            config.database.supabase.url,
            config.database.supabase.serviceKey
        );
        this.mode = 'supabase';

        // Test connection
        const { error } = await this.client.from('stories').select('count').limit(1);
        if (error) throw error;
    }

    async initPostgres() {
        this.pool = new Pool({
            host: config.database.postgres.host,
            port: config.database.postgres.port,
            database: config.database.postgres.database,
            user: config.database.postgres.user,
            password: config.database.postgres.password
        });
        this.mode = 'postgres';

        // Test connection
        const result = await this.pool.query('SELECT 1');
        if (!result) throw new Error('PostgreSQL connection test failed');
    }

    // ================ STORIES ================

    async getStories(filters = {}) {
        if (this.mode === 'supabase') {
            let query = this.client.from('stories').select('*');

            if (filters.status) query = query.eq('status', filters.status);
            if (filters.type) query = query.eq('type', filters.type);
            if (filters.slug) query = query.eq('slug', filters.slug);

            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            let query = 'SELECT * FROM stories WHERE 1=1';
            const params = [];

            if (filters.status) {
                params.push(filters.status);
                query += ` AND status = $${params.length}`;
            }
            if (filters.type) {
                params.push(filters.type);
                query += ` AND type = $${params.length}`;
            }
            if (filters.slug) {
                params.push(filters.slug);
                query += ` AND slug = $${params.length}`;
            }

            query += ' ORDER BY created_at DESC';
            const result = await this.pool.query(query, params);
            return result.rows;
        }
    }

    async getStoryById(id) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('stories')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query('SELECT * FROM stories WHERE id = $1', [id]);
            return result.rows[0];
        }
    }

    async getStoryBySlug(slug) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('stories')
                .select('*')
                .eq('slug', slug)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } else {
            const result = await this.pool.query('SELECT * FROM stories WHERE slug = $1', [slug]);
            return result.rows[0];
        }
    }

    async createStory(story) {
        // Generate unique slug if duplicate
        let uniqueSlug = story.slug;
        let counter = 1;

        while (true) {
            const existing = await this.getStoryBySlug(uniqueSlug);
            if (!existing) {
                break;
            }
            uniqueSlug = `${story.slug}-${counter}`;
            counter++;
        }

        const storyData = {
            slug: uniqueSlug,
            title: story.title,
            type: story.type || 'PKG',
            script: story.script || '',
            presenter: story.presenter,
            producer: story.producer,
            estimated_duration: story.estimated_duration || 0,
            status: story.status || 'draft',
            created_by: story.created_by || 'System'
        };

        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('stories')
                .insert(storyData)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                `INSERT INTO stories (slug, title, type, script, presenter, producer, estimated_duration, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [storyData.slug, storyData.title, storyData.type, storyData.script,
                 storyData.presenter, storyData.producer, storyData.estimated_duration,
                 storyData.status, storyData.created_by]
            );
            return result.rows[0];
        }
    }

    async updateStory(id, updates) {
        delete updates.id; // Don't allow ID updates

        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('stories')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');

            const result = await this.pool.query(
                `UPDATE stories SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
                [id, ...values]
            );
            return result.rows[0];
        }
    }

    async deleteStory(id) {
        // Prima rimuovi gli elementi dal rundown associati a questa storia
        const rundownItems = await this.getRundownItemsByStoryId(id);

        if (rundownItems && rundownItems.length > 0) {
            Logger.info('Database', `Removing story from rundown before deletion (${rundownItems.length} items)`);

            // Elimina tutti gli elementi del rundown associati
            for (const item of rundownItems) {
                // Prima elimina i comandi di automazione
                if (this.mode === 'supabase') {
                    await this.client
                        .from('automation_commands')
                        .delete()
                        .eq('rundown_item_id', item.id);

                    await this.client
                        .from('rundown_items')
                        .delete()
                        .eq('id', item.id);
                } else {
                    await this.pool.query(
                        'DELETE FROM automation_commands WHERE rundown_item_id = $1',
                        [item.id]
                    );
                    await this.pool.query(
                        'DELETE FROM rundown_items WHERE id = $1',
                        [item.id]
                    );
                }
            }
        }

        // Ora elimina la storia
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('stories')
                .delete()
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'DELETE FROM stories WHERE id = $1 RETURNING *',
                [id]
            );
            return result.rows[0];
        }
    }

    // ================ RUNDOWNS ================

    async getRundowns() {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundowns')
                .select('*')
                .order('air_date', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM rundowns ORDER BY air_date DESC, air_time DESC'
            );
            return result.rows;
        }
    }

    async getCurrentRundown() {
        const today = new Date().toISOString().split('T')[0];

        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundowns')
                .select('*')
                .eq('air_date', today)
                .single();

            if (error && error.code === 'PGRST116') {
                // No rundown for today, create one
                return this.createTodaysRundown();
            }
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM rundowns WHERE air_date = $1 LIMIT 1',
                [today]
            );

            if (result.rows.length === 0) {
                return this.createTodaysRundown();
            }
            return result.rows[0];
        }
    }

    async createTodaysRundown() {
        const today = new Date().toISOString().split('T')[0];
        const rundownData = {
            name: `TG - ${today}`,
            show_name: 'TG delle 20:00',
            air_date: today,
            air_time: '20:00:00',
            status: 'preparation',
            created_by: 'System'
        };

        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundowns')
                .insert(rundownData)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                `INSERT INTO rundowns (name, show_name, air_date, air_time, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [rundownData.name, rundownData.show_name, rundownData.air_date,
                 rundownData.air_time, rundownData.status, rundownData.created_by]
            );
            return result.rows[0];
        }
    }

    async createRundown(rundownData) {
        const data = {
            name: rundownData.name || `TG - ${rundownData.air_date}`,
            show_name: rundownData.show_name || 'TG delle 20:00',
            air_date: rundownData.air_date,
            air_time: rundownData.air_time || '20:00:00',
            status: rundownData.status || 'preparation',
            created_by: rundownData.created_by || 'User'
        };

        if (this.mode === 'supabase') {
            const { data: newRundown, error } = await this.client
                .from('rundowns')
                .insert(data)
                .select()
                .single();
            if (error) throw error;
            return newRundown;
        } else {
            const result = await this.pool.query(
                `INSERT INTO rundowns (name, show_name, air_date, air_time, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [data.name, data.show_name, data.air_date,
                 data.air_time, data.status, data.created_by]
            );
            return result.rows[0];
        }
    }

    async updateRundown(id, updates) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundowns')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

            const result = await this.pool.query(
                `UPDATE rundowns SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 RETURNING *`,
                [id, ...values]
            );
            return result.rows[0];
        }
    }

    async deleteRundown(id) {
        // Prima elimina tutti gli elementi del rundown
        if (this.mode === 'supabase') {
            // Prima ottieni tutti i rundown items
            const { data: items } = await this.client
                .from('rundown_items')
                .select('id')
                .eq('rundown_id', id);

            if (items && items.length > 0) {
                const itemIds = items.map(item => item.id);

                // Elimina automation commands
                await this.client
                    .from('automation_commands')
                    .delete()
                    .in('rundown_item_id', itemIds);
            }

            // Elimina rundown items
            await this.client
                .from('rundown_items')
                .delete()
                .eq('rundown_id', id);

            // Elimina rundown
            const { data, error } = await this.client
                .from('rundowns')
                .delete()
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            // PostgreSQL cascading delete
            const result = await this.pool.query(
                'DELETE FROM rundowns WHERE id = $1 RETURNING *',
                [id]
            );
            return result.rows[0];
        }
    }

    async getRundownById(id) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundowns')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM rundowns WHERE id = $1',
                [id]
            );
            return result.rows[0];
        }
    }

    // ================ RUNDOWN ITEMS ================

    async getRundownItems(rundownId) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .select('*, stories(*)')
                .eq('rundown_id', rundownId)
                .order('position');
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(`
                SELECT
                    ri.*,
                    s.slug,
                    s.title,
                    s.type,
                    s.presenter,
                    s.script,
                    (SELECT COUNT(*) FROM automation_commands WHERE rundown_item_id = ri.id) as command_count
                FROM rundown_items ri
                LEFT JOIN stories s ON ri.story_id = s.id
                WHERE ri.rundown_id = $1
                ORDER BY ri.position
            `, [rundownId]);
            return result.rows;
        }
    }

    async getRundownItemsByStoryId(storyId) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .select('*')
                .eq('story_id', storyId);
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM rundown_items WHERE story_id = $1',
                [storyId]
            );
            return result.rows;
        }
    }

    async createRundownItem(rundownId, storyId, position, duration) {
        const itemData = {
            rundown_id: rundownId,
            story_id: storyId,
            position: position,
            estimated_duration: duration,
            status: 'ready'
        };

        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .insert(itemData)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                `INSERT INTO rundown_items (rundown_id, story_id, position, estimated_duration, status)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [itemData.rundown_id, itemData.story_id, itemData.position,
                 itemData.estimated_duration, itemData.status]
            );
            return result.rows[0];
        }
    }

    async deleteRundownItem(itemId) {
        if (this.mode === 'supabase') {
            // Delete automation commands first
            await this.client
                .from('automation_commands')
                .delete()
                .eq('rundown_item_id', itemId);

            const { data, error } = await this.client
                .from('rundown_items')
                .delete()
                .eq('id', itemId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            // Delete automation commands first
            await this.pool.query(
                'DELETE FROM automation_commands WHERE rundown_item_id = $1',
                [itemId]
            );

            const result = await this.pool.query(
                'DELETE FROM rundown_items WHERE id = $1 RETURNING *',
                [itemId]
            );
            return result.rows[0];
        }
    }

    // ================ AUTOMATION COMMANDS ================

    async createAutomationCommand(command) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('automation_commands')
                .insert(command)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                `INSERT INTO automation_commands
                 (rundown_item_id, sequence_order, command_type, start_time, duration, caspar_command, parameters)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [command.rundown_item_id, command.sequence_order, command.command_type,
                 command.start_time, command.duration, command.caspar_command, command.parameters]
            );
            return result.rows[0];
        }
    }

    async getAutomationCommands(rundownItemId) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('automation_commands')
                .select('*')
                .eq('rundown_item_id', rundownItemId)
                .order('sequence_order');
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM automation_commands WHERE rundown_item_id = $1 ORDER BY sequence_order',
                [rundownItemId]
            );
            return result.rows;
        }
    }

    async updateAutomationCommandStatus(commandId, status, error = null) {
        const updates = {
            status: status,
            executed_at: new Date().toISOString()
        };
        if (error) updates.error_message = error;

        if (this.mode === 'supabase') {
            const { data, error: updateError } = await this.client
                .from('automation_commands')
                .update(updates)
                .eq('id', commandId);
            if (updateError) throw updateError;
            return data;
        } else {
            const result = await this.pool.query(
                'UPDATE automation_commands SET status = $1, executed_at = $2, error_message = $3 WHERE id = $4',
                [updates.status, updates.executed_at, updates.error_message, commandId]
            );
            return result.rows[0];
        }
    }

    // ================ RUNDOWN ITEMS (Additional Methods) ================

    async getRundownItemById(itemId) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .select('*')
                .eq('id', itemId)
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM rundown_items WHERE id = $1',
                [itemId]
            );
            return result.rows[0];
        }
    }

    async updateRundownItemStatus(itemId, status) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', itemId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'UPDATE rundown_items SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [status, itemId]
            );
            return result.rows[0];
        }
    }

    async updateRundownItem(itemId, updates) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('rundown_items')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', itemId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
            values.push(itemId);

            const result = await this.pool.query(
                `UPDATE rundown_items SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
                values
            );
            return result.rows[0];
        }
    }

    async deleteAutomationCommands(rundownItemId) {
        if (this.mode === 'supabase') {
            const { error } = await this.client
                .from('automation_commands')
                .delete()
                .eq('rundown_item_id', rundownItemId);
            if (error) throw error;
            return true;
        } else {
            await this.pool.query(
                'DELETE FROM automation_commands WHERE rundown_item_id = $1',
                [rundownItemId]
            );
            return true;
        }
    }

    // ================ MEDIA ASSETS ================

    async getMediaAssets(type = null) {
        if (this.mode === 'supabase') {
            let query = this.client.from('media_assets').select('*');
            if (type) query = query.eq('file_type', type);
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            let query = 'SELECT * FROM media_assets';
            const params = [];
            if (type) {
                params.push(type);
                query += ` WHERE file_type = $${params.length}`;
            }
            query += ' ORDER BY created_at DESC';
            const result = await this.pool.query(query, params);
            return result.rows;
        }
    }

    async createMediaAsset(asset) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('media_assets')
                .insert(asset)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                `INSERT INTO media_assets (filename, original_filename, file_type, file_size, file_path, caspar_path, uploaded_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [asset.filename, asset.original_filename, asset.file_type,
                 asset.file_size, asset.file_path, asset.caspar_path, asset.uploaded_by]
            );
            return result.rows[0];
        }
    }

    async getMediaAssetById(id) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('media_assets')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM media_assets WHERE id = $1',
                [id]
            );
            return result.rows[0];
        }
    }

    async getMediaAssetByFilename(filename) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('media_assets')
                .select('*')
                .eq('filename', filename)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'SELECT * FROM media_assets WHERE filename = $1',
                [filename]
            );
            return result.rows[0];
        }
    }

    async deleteMediaAsset(id) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.client
                .from('media_assets')
                .delete()
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const result = await this.pool.query(
                'DELETE FROM media_assets WHERE id = $1 RETURNING *',
                [id]
            );
            return result.rows[0];
        }
    }

    // ================ LOGGING ================

    async createLog(level, category, message, details = {}, userId = null, sessionId = null) {
        const logEntry = {
            level,
            category,
            message,
            details,
            user_id: userId,
            session_id: sessionId,
            timestamp: new Date().toISOString()
        };

        try {
            if (this.mode === 'supabase') {
                await this.client
                    .from('system_logs')
                    .insert(logEntry);
            } else {
                await this.pool.query(
                    `INSERT INTO system_logs (level, category, message, details, user_id, session_id)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [level, category, message, details, userId, sessionId]
                );
            }
        } catch (error) {
            console.error('Failed to write log to database:', error);
        }
    }

    async getLogs(filters = {}) {
        const limit = filters.limit || 100;

        if (this.mode === 'supabase') {
            let query = this.client.from('system_logs').select('*');
            if (filters.level) query = query.eq('level', filters.level);
            if (filters.category) query = query.eq('category', filters.category);
            const { data, error } = await query
                .order('timestamp', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data;
        } else {
            let query = 'SELECT * FROM system_logs WHERE 1=1';
            const params = [];

            if (filters.level) {
                params.push(filters.level);
                query += ` AND level = $${params.length}`;
            }
            if (filters.category) {
                params.push(filters.category);
                query += ` AND category = $${params.length}`;
            }

            params.push(limit);
            query += ` ORDER BY timestamp DESC LIMIT $${params.length}`;

            const result = await this.pool.query(query, params);
            return result.rows;
        }
    }

    // ================ CLEANUP ================

    async close() {
        if (this.pool) {
            await this.pool.end();
        }
        this.initialized = false;
        console.log('Database connection closed');
    }
}

module.exports = new DatabaseService();