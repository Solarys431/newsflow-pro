# Architettura Tecnica - iNEWS Professional 2025

## 🏗️ Panoramica Sistema

Il sistema è un'applicazione broadcast newsroom professionale che integra:
- **CasparCG Server** (100.74.188.128) per playout grafico
- **Supabase** locale per database e real-time
- **SPX-GC** template system
- **Multiview** professionale
- **WebPlayer** per anteprima template

## 📐 Architettura Componenti

```
┌──────────────────────────────────────────────────────────────┐
│                     iNEWS Professional GUI                    │
│                    (React + TypeScript + Vite)                │
└────────────┬─────────────────────────────────┬───────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────┐       ┌───────────────────────────┐
│    Backend API Layer    │       │   WebSocket Server        │
│   (Node.js + Express)   │◄─────►│    (Socket.io)           │
└────────┬────────────────┘       └───────────────────────────┘
         │
         ├────────────────┬───────────────┬──────────────┬─────────────┐
         ▼                ▼               ▼              ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────┐ ┌──────────┐
│  Supabase    │ │  CasparCG    │ │  SPX-GC     │ │  Media   │ │ Multiview│
│   (Local)    │ │  Controller  │ │  Templates  │ │  Storage │ │  Engine  │
└──────────────┘ └──────────────┘ └─────────────┘ └──────────┘ └──────────┘
```

## 🔧 Stack Tecnologico Dettagliato

### Frontend
```json
{
  "framework": "React 18 + TypeScript",
  "bundler": "Vite",
  "styling": "TailwindCSS + CSS Modules",
  "state": "Zustand + React Query",
  "realtime": "Socket.io-client",
  "video": "Video.js + HLS.js",
  "graphics": "Canvas API + Fabric.js"
}
```

### Backend
```json
{
  "runtime": "Node.js 20",
  "framework": "Express + TypeScript",
  "database": "Supabase (PostgreSQL)",
  "caspar": "casparcg-connection",
  "websocket": "Socket.io",
  "media": "FFmpeg + Sharp",
  "cache": "Node-cache"
}
```

## 💾 Supabase Schema Locale

### Setup Supabase Locale
```bash
# Installazione Supabase CLI
brew install supabase/tap/supabase

# Inizializzazione progetto
cd inews-backend
supabase init

# Start Supabase locale
supabase start
# Studio: http://localhost:54323
# API: http://localhost:54321
# DB: postgresql://postgres:postgres@localhost:54322/postgres
```

### Database Schema
```sql
-- Configurazione Sistema
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caspar_ip VARCHAR(50) DEFAULT '100.74.188.128',
    caspar_port INTEGER DEFAULT 5250,
    caspar_channel INTEGER DEFAULT 1,
    spx_gc_url VARCHAR(255),
    multiview_config JSONB
);

-- Rundown (Scaletta)
CREATE TABLE rundowns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    air_time TIME,
    status VARCHAR(20) DEFAULT 'draft',
    total_duration INTEGER DEFAULT 0,
    current_item UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Rundown Items (Stories + Graphics)
CREATE TABLE rundown_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rundown_id UUID REFERENCES rundowns(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'story', 'gfx', 'video', 'live'
    slug VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    duration INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ready', -- 'ready', 'cued', 'onair', 'done'

    -- Story fields
    script_text TEXT,
    teleprompter_text TEXT,

    -- Graphics fields
    template_id VARCHAR(100),
    template_data JSONB,
    preview_url TEXT,

    -- Video fields
    media_path TEXT,
    media_duration INTEGER,

    -- CasparCG fields
    caspar_layer INTEGER DEFAULT 10,
    caspar_channel INTEGER DEFAULT 1,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Templates SPX-GC
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- 'lower_third', 'fullscreen', 'ticker', 'bug'
    spx_template_id VARCHAR(100),
    thumbnail_url TEXT,
    fields JSONB, -- Campi dinamici del template
    default_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Media Assets
CREATE TABLE media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    type VARCHAR(20), -- 'video', 'audio', 'image'
    duration INTEGER,
    resolution VARCHAR(20),
    file_size BIGINT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Multiview Layouts
CREATE TABLE multiview_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    grid_config JSONB, -- Configurazione griglia
    sources JSONB, -- Sorgenti video
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Utenti (Semplificato per test)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'superuser',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Real-time Subscriptions
ALTER TABLE rundown_items REPLICA IDENTITY FULL;
ALTER TABLE rundowns REPLICA IDENTITY FULL;
```

## 🎮 Integrazione CasparCG

### Controller Module
```javascript
// caspar-controller.js
import { CasparCG } from 'casparcg-connection';

class CasparController {
    constructor() {
        this.connection = new CasparCG({
            host: '100.74.188.128',
            port: 5250,
            autoConnect: true,
            onConnected: () => console.log('✅ CasparCG Connected'),
            onDisconnected: () => console.log('❌ CasparCG Disconnected')
        });
    }

    // Play grafica
    async playGraphic(channel, layer, template, data) {
        await this.connection.cgAdd(channel, layer, template, true, data);
    }

    // Update data grafica
    async updateGraphic(channel, layer, data) {
        await this.connection.cgUpdate(channel, layer, data);
    }

    // Stop grafica
    async stopGraphic(channel, layer) {
        await this.connection.cgStop(channel, layer);
    }

    // Play video
    async playVideo(channel, layer, file, loop = false) {
        await this.connection.play(channel, layer, file, loop);
    }

    // Load media
    async loadMedia(channel, layer, file) {
        await this.connection.loadbg(channel, layer, file);
    }

    // Clear layer
    async clear(channel, layer) {
        await this.connection.clear(channel, layer);
    }

    // Get server info
    async getInfo() {
        return await this.connection.info();
    }

    // Get media list
    async getMediaList() {
        return await this.connection.cls();
    }

    // Get template list
    async getTemplateList() {
        return await this.connection.tls();
    }
}
```

## 🖼️ WebPlayer Anteprima Template

### Template Preview Component
```javascript
// TemplatePreview.jsx
import React, { useEffect, useRef, useState } from 'react';

const TemplatePreview = ({ templateId, templateData }) => {
    const iframeRef = useRef(null);
    const [previewUrl, setPreviewUrl] = useState('');

    useEffect(() => {
        // Genera URL preview dal template SPX-GC
        const generatePreview = async () => {
            const response = await fetch('/api/templates/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId, data: templateData })
            });
            const { url } = await response.json();
            setPreviewUrl(url);
        };

        generatePreview();
    }, [templateId, templateData]);

    // Comunica con iframe del template
    const updateTemplateData = (newData) => {
        if (iframeRef.current) {
            iframeRef.current.contentWindow.postMessage({
                type: 'UPDATE_DATA',
                data: newData
            }, '*');
        }
    };

    return (
        <div className="template-preview">
            <div className="preview-container">
                <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    width="1920"
                    height="1080"
                    style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}
                />
            </div>
            <div className="preview-controls">
                <button onClick={() => updateTemplateData(templateData)}>
                    Update Preview
                </button>
                <button onClick={() => sendToCaspar()}>
                    Send to CasparCG
                </button>
            </div>
        </div>
    );
};
```

### Backend Preview Generator
```javascript
// template-preview.js
app.post('/api/templates/preview', async (req, res) => {
    const { templateId, data } = req.body;

    // Genera HTML statico dal template SPX-GC
    const templateHtml = await generateTemplateHtml(templateId, data);

    // Salva preview temporaneo
    const previewId = uuidv4();
    const previewPath = `/previews/${previewId}.html`;

    fs.writeFileSync(`public${previewPath}`, templateHtml);

    // Ritorna URL preview
    res.json({
        url: `http://localhost:3000${previewPath}`,
        previewId
    });
});

// Integrazione con SPX-GC esistente
async function generateTemplateHtml(templateId, data) {
    // Chiama il tuo sistema SPX-GC esistente
    const template = await spxGC.getTemplate(templateId);
    const html = await spxGC.renderTemplate(template, data);

    // Aggiungi wrapper per preview
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; overflow: hidden; }
                #template { width: 1920px; height: 1080px; }
            </style>
        </head>
        <body>
            <div id="template">${html}</div>
            <script>
                window.addEventListener('message', (e) => {
                    if (e.data.type === 'UPDATE_DATA') {
                        // Update template with new data
                        updateTemplate(e.data.data);
                    }
                });
            </script>
        </body>
        </html>
    `;
}
```

## 📺 Multiview Professionale

### Multiview Engine
```javascript
// multiview-engine.js
class MultiviewEngine {
    constructor() {
        this.sources = [];
        this.layout = null;
        this.canvas = null;
        this.ctx = null;
    }

    // Inizializza canvas multiview
    initCanvas(container, width = 1920, height = 1080) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        container.appendChild(this.canvas);
    }

    // Aggiungi sorgente video
    addSource(source) {
        const video = document.createElement('video');
        video.src = source.url;
        video.autoplay = true;
        video.muted = true;

        this.sources.push({
            id: source.id,
            name: source.name,
            video: video,
            position: source.position,
            size: source.size
        });
    }

    // Rendering loop
    render() {
        if (!this.ctx) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Disegna ogni sorgente
        this.sources.forEach(source => {
            const { video, position, size } = source;

            if (video.readyState >= 2) {
                this.ctx.drawImage(
                    video,
                    position.x, position.y,
                    size.width, size.height
                );

                // Aggiungi label
                this.drawLabel(source.name, position.x, position.y);
            }
        });

        // Aggiungi tally lights
        this.drawTallyLights();

        // Loop
        requestAnimationFrame(() => this.render());
    }

    // Disegna label sorgente
    drawLabel(text, x, y) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(x, y, 200, 30);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(text, x + 10, y + 20);
    }

    // Indicatori On-Air
    drawTallyLights() {
        this.sources.forEach(source => {
            if (source.onAir) {
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(
                    source.position.x - 2,
                    source.position.y - 2,
                    source.size.width + 4,
                    source.size.height + 4
                );
            }
        });
    }
}

// Configurazioni layout predefinite
const MULTIVIEW_LAYOUTS = {
    '2x2': {
        sources: 4,
        grid: [
            { x: 0, y: 0, w: 960, h: 540 },
            { x: 960, y: 0, w: 960, h: 540 },
            { x: 0, y: 540, w: 960, h: 540 },
            { x: 960, y: 540, w: 960, h: 540 }
        ]
    },
    '1+5': {
        sources: 6,
        grid: [
            { x: 0, y: 0, w: 1280, h: 720 },      // Main
            { x: 1280, y: 0, w: 320, h: 180 },    // PVW 1
            { x: 1600, y: 0, w: 320, h: 180 },    // PVW 2
            { x: 1280, y: 180, w: 320, h: 180 },  // PVW 3
            { x: 1600, y: 180, w: 320, h: 180 },  // PVW 4
            { x: 1280, y: 360, w: 640, h: 360 }   // PGM
        ]
    },
    '1+7': {
        sources: 8,
        grid: [
            { x: 0, y: 0, w: 1440, h: 810 },      // Main
            { x: 1440, y: 0, w: 240, h: 135 },    // PVW 1
            { x: 1680, y: 0, w: 240, h: 135 },    // PVW 2
            { x: 1440, y: 135, w: 240, h: 135 },  // PVW 3
            { x: 1680, y: 135, w: 240, h: 135 },  // PVW 4
            { x: 1440, y: 270, w: 240, h: 135 },  // PVW 5
            { x: 1680, y: 270, w: 240, h: 135 },  // PVW 6
            { x: 1440, y: 405, w: 480, h: 270 }   // PGM
        ]
    }
};
```

## 🎬 Workflow Operativo

### 1. Preparazione Rundown
```javascript
// Creazione nuovo rundown
const rundown = await supabase
    .from('rundowns')
    .insert({
        name: 'TG delle 20:00',
        date: '2024-01-27',
        air_time: '20:00:00'
    })
    .single();

// Aggiunta items
const items = [
    {
        type: 'story',
        slug: 'TERREMOTO',
        title: 'Terremoto Milano',
        script_text: '...',
        duration: 120
    },
    {
        type: 'gfx',
        slug: 'LOWER_THIRD_01',
        template_id: 'lower_third_basic',
        template_data: {
            title: 'Mario Rossi',
            subtitle: 'Sindaco di Milano'
        }
    }
];
```

### 2. Preview Template
```javascript
// Genera anteprima
const preview = await generateTemplatePreview(template_id, data);

// Mostra nel webplayer
showPreview(preview.url);

// Utente approva -> Aggiungi a rundown
await addToRundown(rundown_id, template_item);
```

### 3. On Air Workflow
```javascript
// TAKE - Manda in onda
async function take(item) {
    if (item.type === 'gfx') {
        // Invia a CasparCG
        await caspar.playGraphic(
            item.caspar_channel,
            item.caspar_layer,
            item.template_id,
            item.template_data
        );
    } else if (item.type === 'video') {
        await caspar.playVideo(
            item.caspar_channel,
            item.caspar_layer,
            item.media_path
        );
    }

    // Update status
    await updateItemStatus(item.id, 'onair');

    // Broadcast to all clients
    io.emit('item:onair', item);
}

// CUE - Prepara prossimo
async function cue(item) {
    if (item.type === 'video') {
        await caspar.loadMedia(
            item.caspar_channel,
            item.caspar_layer,
            item.media_path
        );
    }

    await updateItemStatus(item.id, 'cued');
    io.emit('item:cued', item);
}

// STOP - Ferma grafica
async function stop(item) {
    await caspar.clear(item.caspar_channel, item.caspar_layer);
    await updateItemStatus(item.id, 'done');
    io.emit('item:stopped', item);
}
```

## 🔌 API Endpoints

```javascript
// Rundown Management
GET    /api/rundowns
GET    /api/rundowns/:id
POST   /api/rundowns
PUT    /api/rundowns/:id
DELETE /api/rundowns/:id

// Rundown Items
GET    /api/rundowns/:id/items
POST   /api/rundowns/:id/items
PUT    /api/items/:id
DELETE /api/items/:id
PUT    /api/items/:id/reorder

// Templates
GET    /api/templates
GET    /api/templates/:id
POST   /api/templates/preview
POST   /api/templates/render

// CasparCG Control
POST   /api/caspar/play
POST   /api/caspar/stop
POST   /api/caspar/clear
GET    /api/caspar/status
GET    /api/caspar/media
GET    /api/caspar/templates

// Multiview
GET    /api/multiview/layouts
POST   /api/multiview/layout
PUT    /api/multiview/source
GET    /api/multiview/stream

// WebSocket Events
ws://localhost:3000/socket
- rundown:updated
- item:added
- item:updated
- item:onair
- item:cued
- caspar:connected
- caspar:disconnected
```

## 🚀 Startup Sequence

```javascript
// 1. Start Supabase
await exec('supabase start');

// 2. Initialize database
await runMigrations();
await seedDatabase();

// 3. Connect to CasparCG
await caspar.connect('100.74.188.128', 5250);

// 4. Start backend server
const server = app.listen(3000);

// 5. Initialize WebSocket
const io = new Server(server);

// 6. Start frontend
await exec('npm run dev'); // Vite dev server

// 7. Open browser
await open('http://localhost:5173');
```

## 📦 Installazione Rapida

```bash
# Clone repo
git clone https://github.com/your-repo/inews-pro
cd inews-pro

# Install dependencies
npm install

# Setup Supabase
supabase init
supabase start

# Configure .env
cp .env.example .env
# Edit .env with:
# SUPABASE_URL=http://localhost:54321
# SUPABASE_ANON_KEY=your-key
# CASPAR_IP=100.74.188.128
# CASPAR_PORT=5250

# Run migrations
npm run db:migrate

# Start development
npm run dev
```

## ⚡ Performance Ottimizzazioni

1. **Template Caching**: Cache preview HTML per 5 minuti
2. **WebSocket Throttling**: Batch updates ogni 100ms
3. **Multiview Encoding**: Hardware acceleration con NVENC/QuickSync
4. **Database Indexing**: Index su rundown_id, position, status
5. **CDN per Media**: Servire media statici da CDN locale

## 🔐 Security Notes

- CORS configurato per domini specifici
- Rate limiting su API endpoints
- Validazione input con Joi/Yup
- Sanitizzazione HTML nei template
- WebSocket authentication con token JWT