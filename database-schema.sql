-- ===================================
-- iNEWS Mini System Database Schema
-- ===================================

-- Enable real-time subscriptions
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- ===================================
-- Core Tables
-- ===================================

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'PKG', -- PKG, VO, SOT, LIVE, GFX
    script TEXT,
    presenter VARCHAR(100),
    producer VARCHAR(100),
    estimated_duration INTEGER DEFAULT 0, -- in seconds
    status VARCHAR(20) DEFAULT 'draft', -- draft, ready, approved, sent, aired
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Rundowns table
CREATE TABLE IF NOT EXISTS rundowns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    show_name VARCHAR(100) NOT NULL,
    air_date DATE NOT NULL,
    air_time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'preparation', -- preparation, ready, live, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Prevent duplicate rundowns for same show at same time
    CONSTRAINT rundowns_unique_show_time UNIQUE (show_name, air_date, air_time)
);

-- Rundown items (stories in rundown)
CREATE TABLE IF NOT EXISTS rundown_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rundown_id UUID REFERENCES rundowns(id) ON DELETE CASCADE,
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    estimated_duration INTEGER DEFAULT 0,
    actual_duration INTEGER,
    status VARCHAR(20) DEFAULT 'ready', -- ready, playing, completed, skipped, error
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(rundown_id, position)
);

-- Automation commands
CREATE TABLE IF NOT EXISTS automation_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rundown_item_id UUID REFERENCES rundown_items(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    command_type VARCHAR(50) NOT NULL, -- PRESENTER_CUE, TAKE_VTR, GFX_ON, GFX_OFF, AUDIO_SOT, etc.
    start_time INTEGER DEFAULT 0, -- relative start time in seconds
    duration INTEGER DEFAULT 0,
    caspar_command TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'ready', -- ready, executing, completed, error
    executed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media assets
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- video, audio, image, template
    file_size INTEGER,
    duration INTEGER, -- for video/audio files
    resolution VARCHAR(20), -- for video files
    file_path TEXT NOT NULL,
    caspar_path TEXT, -- path in CasparCG media folder
    thumbnail_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by VARCHAR(100)
);

-- Story media relations
CREATE TABLE IF NOT EXISTS story_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    media_asset_id UUID REFERENCES media_assets(id) ON DELETE CASCADE,
    usage_type VARCHAR(50) NOT NULL, -- main_video, sot_audio, graphic, background
    usage_order INTEGER DEFAULT 1,
    in_point INTEGER DEFAULT 0, -- trim in point in seconds
    out_point INTEGER, -- trim out point in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CasparCG servers
CREATE TABLE IF NOT EXISTS caspar_servers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(100) NOT NULL,
    port INTEGER DEFAULT 5250,
    status VARCHAR(20) DEFAULT 'offline', -- online, offline, error
    last_ping TIMESTAMP WITH TIME ZONE,
    version VARCHAR(50),
    channels JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SPX Graphics templates
CREATE TABLE IF NOT EXISTS spx_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    template_file VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'lower_third', -- lower_third, fullscreen, ticker, etc.
    data_fields JSONB DEFAULT '{}'::jsonb, -- field definitions
    preview_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================================
-- Indexes for Performance
-- ===================================

CREATE INDEX IF NOT EXISTS idx_stories_slug ON stories(slug);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at);

CREATE INDEX IF NOT EXISTS idx_rundown_items_rundown_id ON rundown_items(rundown_id);
CREATE INDEX IF NOT EXISTS idx_rundown_items_position ON rundown_items(rundown_id, position);
CREATE INDEX IF NOT EXISTS idx_rundown_items_status ON rundown_items(status);

CREATE INDEX IF NOT EXISTS idx_automation_commands_rundown_item ON automation_commands(rundown_item_id);
CREATE INDEX IF NOT EXISTS idx_automation_commands_sequence ON automation_commands(rundown_item_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_automation_commands_status ON automation_commands(status);

CREATE INDEX IF NOT EXISTS idx_media_assets_filename ON media_assets(filename);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(file_type);

-- ===================================
-- Functions and Triggers
-- ===================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_stories_updated_at BEFORE UPDATE ON stories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rundowns_updated_at BEFORE UPDATE ON rundowns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rundown_items_updated_at BEFORE UPDATE ON rundown_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spx_templates_updated_at BEFORE UPDATE ON spx_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate story duration from automation commands
CREATE OR REPLACE FUNCTION calculate_story_duration(story_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    max_end_time INTEGER := 0;
    cmd_record RECORD;
BEGIN
    FOR cmd_record IN
        SELECT ac.start_time, ac.duration
        FROM automation_commands ac
        JOIN rundown_items ri ON ac.rundown_item_id = ri.id
        WHERE ri.story_id = story_uuid
    LOOP
        IF (cmd_record.start_time + cmd_record.duration) > max_end_time THEN
            max_end_time := cmd_record.start_time + cmd_record.duration;
        END IF;
    END LOOP;

    RETURN max_end_time;
END;
$$ LANGUAGE plpgsql;

-- ===================================
-- Row Level Security (RLS)
-- ===================================

-- Enable RLS on all tables
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rundowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rundown_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE caspar_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE spx_templates ENABLE ROW LEVEL SECURITY;

-- Basic policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all operations" ON stories FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON rundowns FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON rundown_items FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON automation_commands FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON media_assets FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON story_media FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON caspar_servers FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON spx_templates FOR ALL USING (true);

-- ===================================
-- Initial Data
-- ===================================

-- Insert default CasparCG server
INSERT INTO caspar_servers (name, host, port, status)
VALUES ('Production Server', '100.74.188.128', 5250, 'offline')
ON CONFLICT DO NOTHING;

-- Insert default rundown
INSERT INTO rundowns (name, show_name, air_date, air_time, status, created_by)
VALUES (
    'TG Test - ' || CURRENT_DATE,
    'TG delle 20:00',
    CURRENT_DATE,
    '20:00:00',
    'preparation',
    'System'
) ON CONFLICT DO NOTHING;

-- Insert sample SPX templates
INSERT INTO spx_templates (name, template_file, category, data_fields, preview_image)
VALUES
    (
        'Lower Third Standard',
        'lower-third-standard.html',
        'lower_third',
        '{"title": {"type": "text", "label": "Titolo"}, "subtitle": {"type": "text", "label": "Sottotitolo"}}',
        '/templates/previews/lower-third-standard.png'
    ),
    (
        'Breaking News',
        'breaking-news.html',
        'fullscreen',
        '{"headline": {"type": "text", "label": "Titolo Breaking"}, "description": {"type": "textarea", "label": "Descrizione"}}',
        '/templates/previews/breaking-news.png'
    )
ON CONFLICT DO NOTHING;

-- ===================================
-- Real-time Setup
-- ===================================

-- Enable real-time for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE rundowns;
ALTER PUBLICATION supabase_realtime ADD TABLE rundown_items;
ALTER PUBLICATION supabase_realtime ADD TABLE automation_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE media_assets;

-- ===================================
-- Views for easier querying
-- ===================================

-- Complete rundown view with stories
CREATE OR REPLACE VIEW rundown_complete AS
SELECT
    r.id as rundown_id,
    r.name as rundown_name,
    r.show_name,
    r.air_date,
    r.air_time,
    r.status as rundown_status,
    ri.id as item_id,
    ri.position,
    ri.status as item_status,
    ri.estimated_duration,
    ri.actual_duration,
    s.id as story_id,
    s.slug,
    s.title,
    s.type,
    s.presenter,
    s.status as story_status,
    COUNT(ac.id) as command_count
FROM rundowns r
LEFT JOIN rundown_items ri ON r.id = ri.rundown_id
LEFT JOIN stories s ON ri.story_id = s.id
LEFT JOIN automation_commands ac ON ri.id = ac.rundown_item_id
GROUP BY r.id, ri.id, s.id
ORDER BY r.air_date DESC, r.air_time DESC, ri.position ASC;

-- Stories with media count
CREATE OR REPLACE VIEW stories_with_media AS
SELECT
    s.*,
    COUNT(sm.id) as media_count,
    ARRAY_AGG(ma.filename) FILTER (WHERE ma.filename IS NOT NULL) as media_files
FROM stories s
LEFT JOIN story_media sm ON s.id = sm.story_id
LEFT JOIN media_assets ma ON sm.media_asset_id = ma.id
GROUP BY s.id;

COMMENT ON TABLE stories IS 'Main stories table containing script content and metadata';
COMMENT ON TABLE rundowns IS 'Broadcast rundowns/playlists';
COMMENT ON TABLE rundown_items IS 'Stories assigned to specific rundowns with position';
COMMENT ON TABLE automation_commands IS 'CasparCG automation commands generated from stories';
COMMENT ON TABLE media_assets IS 'Video, audio, and graphic files used in stories';
COMMENT ON TABLE story_media IS 'Many-to-many relationship between stories and media';
COMMENT ON TABLE caspar_servers IS 'CasparCG server configurations';
COMMENT ON TABLE spx_templates IS 'SPX Graphics template definitions';