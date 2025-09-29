# 📺 Workflow Operativo Completo - TG 30 Minuti

## 🚨 COMPONENTI MANCANTI CRITICI

### ❌ Attualmente Mancano:
1. **TELEPROMPTER PROFESSIONALE** - Il conduttore non può leggere!
2. **MIXER VIDEO/SWITCHER** - Non c'è switching tra camere
3. **SISTEMA CONTRIBUTI** - Gestione servizi video/collegamenti
4. **AUTOMATION PLAYLIST** - Messa in onda automatica sequenziale
5. **TALLY LIGHT SYSTEM** - Segnalazione camera on-air
6. **INTERCOM/TALKBACK** - Comunicazione regia-studio
7. **RETURN VIDEO** - Monitor studio per conduttore
8. **CLOCK & COUNTDOWN** - Timing preciso per diretta
9. **BACKUP/RIDONDANZA** - Sistema di emergenza

## 📋 WORKFLOW COMPLETO GIORNALISTA/PRODUTTORE

### FASE 1: PRE-PRODUZIONE (3 ore prima)

#### 1.1 Creazione Rundown
```
09:00 - Login sistema iNEWS
      - Crea nuovo rundown "TG 12:00"
      - Imposta durata: 30 minuti
      - Template base con blocchi standard:
        • Sigla apertura (30 sec)
        • Titoli (1 min)
        • Notizie principali (10 min)
        • Sport (5 min)
        • Meteo (3 min)
        • Altre notizie (8 min)
        • Chiusura (30 sec)
```

#### 1.2 Assegnazione Storie
```
09:15 - Assegna giornalisti:
      - Politica → Mario Rossi
      - Cronaca → Laura Bianchi
      - Sport → Giuseppe Verdi
      - Meteo → Anna Russo

      Ogni giornalista riceve notifica e vede le sue storie
```

#### 1.3 Preparazione Contenuti
```
09:30-11:30 - Giornalisti lavorano in parallelo:

      A) SCRITTURA TESTI
         - Apre storia assegnata
         - Scrive testo notizia (campo Script)
         - Sistema calcola tempo lettura automatico
         - Formatta per teleprompter

      B) PREPARAZIONE VIDEO
         - Upload servizi video (package)
         - Taglio e montaggio base
         - Inserisce IN/OUT point
         - Aggiunge metadata (durata, formato)

      C) GRAFICA
         - Seleziona template (lower third, full screen, etc)
         - Inserisce dati (nomi, titoli, cifre)
         - Preview nel webplayer
         - Salva nella storia

      D) COLLEGAMENTI LIVE
         - Prenota satellite/IP link
         - Test connessione
         - Inserisce placeholder nel rundown
```

### FASE 2: FINALIZZAZIONE (1 ora prima)

#### 2.1 Review Rundown Completo
```
11:00 - Producer/Caposervizio:
      - Controlla timing totale (deve essere 30:00)
      - Riordina storie se necessario
      - Verifica tutti i contenuti presenti
      - Approva per messa in onda
```

#### 2.2 Technical Check
```
11:15 - Tecnico regia:
      - Test tutti i video
      - Verifica grafiche su CasparCG
      - Check collegamenti live
      - Test automazione
```

### FASE 3: PREPARAZIONE STUDIO (30 min prima)

#### 3.1 Setup Conduttore
```
11:30 - In studio:
      - Conduttore al desk
      - Microfono check
      - Teleprompter caricato con testi
      - Monitor return video attivo
      - Auricolare per comunicazione regia
```

#### 3.2 Setup Tecnico
```
11:40 - Controllo regia:
      - Camere posizionate e bilanciate
      - Luci studio settate
      - CasparCG pronto con grafiche
      - Video server caricato
      - Collegamenti live testati
```

### FASE 4: MESSA IN ONDA (30 minuti)

```
12:00:00 - INIZIO TG

RUNDOWN ITEM #1 - SIGLA (30 sec)
├─ [AUTO] Play sigla.mp4 da video server
├─ [AUTO] Audio sigla al mixer
├─ [AUTO] CasparCG: Logo TG overlay
└─ Status: ON AIR

12:00:30 - ITEM #2 - APERTURA CONDUTTORE (45 sec)
├─ [MANUAL] Switch Camera 1 (totale studio)
├─ [AUTO] Teleprompter start scroll
├─ [AUTO] CasparCG: Lower third "Mario Rossi - TG delle 12"
├─ Audio: Mic conduttore ON
└─ Status: ON AIR

12:01:15 - ITEM #3 - NOTIZIA TERREMOTO (3 min)
├─ Conduttore legge intro (30 sec)
├─ [AUTO] Roll VTR servizio_terremoto.mp4 (2 min)
│  └─ Durante VTR:
│      • CasparCG: Sottopancia "Milano - Questa mattina"
│      • Audio: VTR stereo
│      • Conduttore vede return video
├─ [MANUAL] Ritorno Camera 1
├─ Conduttore chiude notizia (30 sec)
└─ Status: ON AIR

12:04:15 - ITEM #4 - LIVE INVIATO (4 min)
├─ Conduttore introduce collegamento (20 sec)
├─ [MANUAL] Switch a segnale satellite/IP
├─ [AUTO] CasparCG: Lower third "Laura Bianchi - In diretta da Roma"
├─ Dialogo conduttore-inviato (3:30)
├─ [MANUAL] Return Camera 1
├─ Conduttore chiude (10 sec)
└─ Status: ON AIR

[... continua per tutti i 30 minuti ...]

12:29:30 - ITEM #24 - CHIUSURA (30 sec)
├─ Conduttore saluti finali
├─ [AUTO] CasparCG: Credits roll
├─ [AUTO] Fade to black
└─ [AUTO] Play sigla chiusura

12:30:00 - FINE TG
```

## 🔧 COMPONENTI SISTEMA NECESSARI

### 1. TELEPROMPTER SYSTEM
```javascript
// Componente mancante CRITICO
class TeleprompterSystem {
    - Display professionale davanti camera
    - Controllo velocità da regia
    - Sync con rundown attivo
    - Evidenziazione testo on-air
    - Controllo remoto iPad per conduttore
    - Mirror mode per hardware telepromter
    - Font size dinamico
    - Countdown timer integrato
}
```

### 2. VIDEO SWITCHER INTEGRATION
```javascript
// Serve per switching tra sorgenti
class VideoSwitcher {
    - Controllo ATEM/TriCaster/vMix
    - Preset per ogni camera
    - Transizioni (cut, dissolve, wipe)
    - Picture-in-Picture
    - DSK per grafiche
    - Aux outputs per monitor studio
    - Macro automazione
}
```

### 3. AUTOMATION SYSTEM
```javascript
// Per messa in onda automatica
class AutomationPlaylist {
    - Playlist sequenziale items
    - Trigger automatici basati su tempo
    - Pre-roll video automatico
    - Hold points per intervento manuale
    - GPI triggers per hardware
    - Backup playlist
    - As-run log per compliance
}
```

### 4. VIDEO PLAYOUT SERVER
```javascript
// Gestione tutti i video
class VideoServer {
    - Ingest multiplo formati
    - Playlist management
    - Clip trimming (IN/OUT points)
    - Preview mentre on-air
    - Slow motion replay
    - Still store per immagini
    - Network storage integration
}
```

### 5. TALLY & INTERCOM
```javascript
// Comunicazione studio-regia
class StudioCommunication {
    - Tally lights su camere
    - Intercom bidirezionale
    - IFB per conduttore
    - Talkback regia-studio
    - Cue lights
    - Countdown clock in studio
    - On-air warning lights
}
```

### 6. LIVE CONTRIBUTION MANAGER
```javascript
// Gestione collegamenti esterni
class LiveContribution {
    - SRT/RTMP/NDI input
    - Satellite IRD control
    - IP contribution (LiveU, etc)
    - Return video to remote
    - IFB audio to remote
    - Confidence monitor
    - Backup connection
}
```

### 7. TIMING & BACKTIMING
```javascript
// Sistema timing professionale
class TimingSystem {
    - Countdown to air
    - Segment timing
    - Backtiming calculator
    - Under/Over indicators
    - Hard out timer
    - Commercial break timer
    - Float time management
}
```

## 📊 DATABASE SCHEMA AGGIORNATO

```sql
-- Aggiunte necessarie al database

-- Teleprompter Scripts
CREATE TABLE teleprompter_scripts (
    id UUID PRIMARY KEY,
    story_id UUID REFERENCES rundown_items(id),
    formatted_text TEXT,
    read_speed INTEGER DEFAULT 160, -- parole/minuto
    font_size INTEGER DEFAULT 60,
    last_position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Video Assets Extended
CREATE TABLE video_clips (
    id UUID PRIMARY KEY,
    media_asset_id UUID REFERENCES media_assets(id),
    in_point TIMECODE,
    out_point TIMECODE,
    duration INTEGER,
    slate_info TEXT,
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Live Contributions
CREATE TABLE live_contributions (
    id UUID PRIMARY KEY,
    rundown_item_id UUID REFERENCES rundown_items(id),
    connection_type VARCHAR(50), -- 'satellite', 'ip', 'srt', 'ndi'
    connection_details JSONB,
    test_time TIMESTAMP,
    backup_connection JSONB,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Automation Playlist
CREATE TABLE automation_playlist (
    id UUID PRIMARY KEY,
    rundown_id UUID REFERENCES rundowns(id),
    item_id UUID REFERENCES rundown_items(id),
    sequence INTEGER,
    trigger_type VARCHAR(20), -- 'auto', 'manual', 'follow'
    trigger_time TIMECODE,
    hold_point BOOLEAN DEFAULT FALSE,
    status VARCHAR(20),
    executed_at TIMESTAMP
);

-- Studio Configuration
CREATE TABLE studio_config (
    id UUID PRIMARY KEY,
    camera_presets JSONB,
    audio_routing JSONB,
    tally_mapping JSONB,
    intercom_channels JSONB,
    return_feeds JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## ⚠️ PROBLEMI ATTUALI DA RISOLVERE

### 🔴 CRITICI (Bloccanti per On-Air)
1. **NO TELEPROMPTER** → Conduttore non può leggere
2. **NO VIDEO SWITCHING** → Non posso cambiare camera
3. **NO AUTOMATION** → Tutto manuale, alto rischio errore
4. **NO PLAYOUT SERVER** → Video non gestiti professionalmente

### 🟡 IMPORTANTI (Qualità broadcast)
5. **NO TALLY SYSTEM** → Conduttore non sa quale camera è on-air
6. **NO INTERCOM** → Zero comunicazione regia-studio
7. **NO RETURN VIDEO** → Conduttore non vede cosa va in onda
8. **NO TIMING SYSTEM** → Rischio sforare i 30 minuti

### 🟢 DESIDERABILI (Workflow migliorato)
9. **NO BACKUP SYSTEM** → Se crasha, TG interrotto
10. **NO CONFIDENCE MONITOR** → Preview prima di mandare on-air
11. **NO AS-RUN LOG** → No compliance/verification
12. **NO MEDIA ASSET MANAGEMENT** → File sparsi ovunque

## 💡 SOLUZIONE PROPOSTA

### Architettura Integrata Completa:

```
┌─────────────────────────────────────────────────────────────┐
│                     STUDIO BROADCAST                          │
├────────────────┬──────────────────┬──────────────────────────┤
│   CAMERAS      │   TELEPROMPTER   │   STUDIO MONITORS        │
│   + Tally      │   + Controller   │   + Return Video         │
└────────┬───────┴──────────┬───────┴──────────┬──────────────┘
         │                  │                   │
         ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     VIDEO SWITCHER                           │
│                   (ATEM/vMix/TriCaster)                     │
└────────────────────────────┬─────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  iNEWS SYSTEM   │ │  PLAYOUT SERVER │ │   CasparCG      │
│   (Control)     │ │    (Video)      │ │   (Graphics)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │   PROGRAM OUTPUT   │
                   │    (Broadcast)     │
                   └───────────────────┘
```

## 🚀 PROSSIMI PASSI NECESSARI

1. **Implementare Teleprompter Web-based**
   - Display fullscreen browser
   - WebSocket sync con rundown
   - Controlli velocità remoti

2. **Integrare Video Switcher API**
   - ATEM control via node-atem-connection
   - vMix API via HTTP/TCP
   - Companion integration

3. **Creare Automation Engine**
   - Playlist builder
   - Event scheduler
   - Emergency bypass

4. **Aggiungere Playout Server**
   - FFmpeg-based playout
   - Decklink SDI output
   - File-based workflow

Vuoi che proceda con l'implementazione di questi componenti mancanti?