# Piano di Sviluppo - iNEWS Professional 2025

## 🎯 Obiettivo
Trasformare il prototipo HTML in un sistema newsroom completo con backend, database, gestione media e collaborazione real-time.

## 📊 Stack Tecnologico Consigliato

### Backend
- **Node.js + Express** o **Python FastAPI** per le API
- **PostgreSQL** per il database principale
- **Redis** per cache e sessioni
- **Socket.io** per real-time updates
- **MinIO** o **AWS S3** per storage media

### Frontend
- **React** o **Vue.js** per componentizzazione
- **TypeScript** per type safety
- **TailwindCSS** mantenendo lo stile esistente
- **Redux/Zustand** o **Pinia** per state management
- **Socket.io-client** per real-time

### DevOps
- **Docker** per containerizzazione
- **Nginx** come reverse proxy
- **PM2** per process management
- **GitHub Actions** per CI/CD

## 📋 Fasi di Sviluppo

### FASE 1: Setup Progetto e Architettura (Settimana 1)

#### 1.1 Inizializzazione Backend
```bash
mkdir inews-backend
cd inews-backend
npm init -y
npm install express cors dotenv bcrypt jsonwebtoken
npm install -D typescript @types/node @types/express nodemon
```

#### 1.2 Struttura Directory
```
inews-pro/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── utils/
│   ├── uploads/
│   └── config/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   └── utils/
└── database/
    └── migrations/
```

### FASE 2: Database e Modelli Dati (Settimana 1-2)

#### 2.1 Schema Database PostgreSQL

```sql
-- Utenti e Autenticazione
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'admin', 'editor', 'journalist', 'viewer'
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Programmi/Show
CREATE TABLE shows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    air_time TIME,
    duration_minutes INTEGER,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Rundown (Scaletta)
CREATE TABLE rundowns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id UUID REFERENCES shows(id),
    date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'ready', 'on_air', 'archived'
    total_duration INTEGER,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(show_id, date)
);

-- Storie/Notizie
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rundown_id UUID REFERENCES rundowns(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    slug VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    duration INTEGER, -- in secondi
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'ready', 'on_air', 'completed'
    story_type VARCHAR(50), -- 'vo', 'vosot', 'pkg', 'live', 'gfx'
    created_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Script delle Storie
CREATE TABLE scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    content TEXT,
    teleprompter_text TEXT,
    notes TEXT,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Media Assets
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'video', 'audio', 'image', 'graphic'
    filename VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    duration INTEGER, -- per video/audio
    resolution VARCHAR(20), -- per video/immagini
    file_size BIGINT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Commenti e Note
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### FASE 3: API REST Backend (Settimana 2-3)

#### 3.1 Endpoints Principali

```javascript
// Authentication
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me

// Shows
GET    /api/shows
POST   /api/shows
PUT    /api/shows/:id
DELETE /api/shows/:id

// Rundowns
GET    /api/rundowns
GET    /api/rundowns/:date
POST   /api/rundowns
PUT    /api/rundowns/:id
DELETE /api/rundowns/:id

// Stories
GET    /api/stories/rundown/:rundownId
POST   /api/stories
PUT    /api/stories/:id
DELETE /api/stories/:id
PUT    /api/stories/:id/reorder

// Scripts
GET    /api/scripts/story/:storyId
PUT    /api/scripts/:id
GET    /api/scripts/:id/versions

// Media
GET    /api/media
POST   /api/media/upload
DELETE /api/media/:id
GET    /api/media/story/:storyId

// Real-time
WS     /socket (per updates in tempo reale)
```

### FASE 4: Frontend Modulare (Settimana 3-4)

#### 4.1 Componenti React/Vue

```javascript
// Struttura Componenti
components/
├── Layout/
│   ├── Header.jsx
│   ├── Toolbar.jsx
│   └── Sidebar.jsx
├── Rundown/
│   ├── RundownList.jsx
│   ├── RundownItem.jsx
│   └── RundownTimer.jsx
├── Script/
│   ├── ScriptEditor.jsx
│   ├── ScriptToolbar.jsx
│   └── TeleprompterView.jsx
├── Media/
│   ├── MediaBrowser.jsx
│   ├── MediaItem.jsx
│   └── MediaUploader.jsx
├── Preview/
│   ├── PreviewPanel.jsx
│   └── PreviewControls.jsx
└── Common/
    ├── Modal.jsx
    ├── Dropdown.jsx
    └── LoadingSpinner.jsx
```

### FASE 5: Funzionalità Core (Settimana 4-5)

#### 5.1 Editor di Script Avanzato
- Rich text editing con formattazione
- Auto-save ogni 30 secondi
- Versioning degli script
- Conteggio parole e tempo stimato lettura
- Evidenziazione sintassi per comandi teleprompter

#### 5.2 Gestione Media
- Upload multipli con progress bar
- Thumbnail automatici per video
- Drag & drop nel script editor
- Anteprima media inline
- Conversione formati automatica

#### 5.3 Teleprompter
- Vista fullscreen
- Controllo velocità scorrimento
- Font size adjustable
- Mirror mode per teleprompter fisici
- Controllo remoto via tablet/smartphone

### FASE 6: Real-time Collaboration (Settimana 5-6)

#### 6.1 WebSocket Events
```javascript
// Eventi Socket.io
socket.on('rundown:updated', (data) => {})
socket.on('story:locked', (data) => {})
socket.on('story:unlocked', (data) => {})
socket.on('script:changed', (data) => {})
socket.on('user:typing', (data) => {})
socket.on('onair:status', (data) => {})
```

#### 6.2 Features Collaborative
- Lock automatico quando un utente modifica
- Indicatori presenza utenti
- Cursori multipli in script editor
- Chat integrata per team
- Notifiche push per cambiamenti

### FASE 7: Features Avanzate (Settimana 6-7)

#### 7.1 Automazione Broadcast
- Integrazione con automation playout
- MOS Protocol support
- Newsroom Computer System (NRCS) compatibility
- Graphics template system
- Rundown timing calculator

#### 7.2 Mobile App
- App React Native per giornalisti
- Editing script da mobile
- Upload media da smartphone
- Notifiche push

### FASE 8: Testing e Deployment (Settimana 7-8)

#### 8.1 Testing
```javascript
// Test suites
- Unit tests (Jest)
- Integration tests (Supertest)
- E2E tests (Cypress)
- Load testing (K6)
```

#### 8.2 Docker Setup
```dockerfile
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379

  frontend:
    build: ./frontend
    ports:
      - "80:80"

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7

  minio:
    image: minio/minio
    volumes:
      - media:/data
```

## 🚀 Roadmap Implementazione

### Sprint 1 (2 settimane)
- [x] Setup ambiente sviluppo
- [ ] Database design e migrations
- [ ] API authentication e user management
- [ ] CRUD base per shows e rundowns

### Sprint 2 (2 settimane)
- [ ] Stories e Scripts management
- [ ] Media upload e storage
- [ ] Frontend refactoring con React
- [ ] Integrazione API nel frontend

### Sprint 3 (2 settimane)
- [ ] Real-time con Socket.io
- [ ] Script editor avanzato
- [ ] Teleprompter functionality
- [ ] Preview e playout controls

### Sprint 4 (2 settimane)
- [ ] Testing completo
- [ ] Ottimizzazione performance
- [ ] Documentazione
- [ ] Deployment production

## 📝 Note Importanti

1. **Sicurezza**: Implementare JWT con refresh tokens, rate limiting, input validation
2. **Performance**: Utilizzare cache Redis per queries frequenti, CDN per media
3. **Scalabilità**: Architettura microservices-ready, load balancing
4. **Backup**: Automated backups database e media files
5. **Monitoring**: Logs strutturati, APM con Elastic/DataDog

## 🎯 MVP Features (Prima Release)
- ✅ Gestione rundown base
- ✅ Editor script con autosave
- ✅ Upload e gestione media
- ✅ Multi-utente con permessi
- ✅ Teleprompter base
- ✅ Export rundown in PDF

## 🔮 Future Enhancements
- AI-powered script writing assistant
- Voice-to-text per trascrizioni
- Integrazione social media
- Analytics e reporting
- Multi-lingua support