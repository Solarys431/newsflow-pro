# iNEWS Professional 2025 - Broadcast Newsroom System

**Sistema broadcast professionale con automazione CasparCG e gestione newsroom completa**

## ✅ Stato Sistema: PRODUCTION READY

- **Database**: Supabase ✅
- **CasparCG**: Connected ✅
- **FTP Upload**: FileZilla Server ✅
- **WebSocket**: Real-time ✅
- **Templates**: HTTP Served ✅

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Start
npm start

# 3. Access
open http://localhost:3333
```

## 🎯 Funzionalità Complete

### **Story Management**
- Editor con script e automazione
- Parser comandi ((TAKE VTR)), ((GFX ON/OFF))
- Timing overlay corretto durante video

### **Media Upload**
- **Local**: Template HTML su Mac (HTTP served)
- **FTP**: Video/audio a CasparCG con progress tracking
- FileZilla Server su Windows CasparCG

### **Rundown Automation**
- Posizionamento flessibile storie
- Esecuzione parallela comandi
- Real-time WebSocket updates

### **CasparCG Integration**
- TCP socket con auto-reconnect
- Command queueing
- Template server HTTP integrato

## 📁 Struttura Progetto

```
INEWSPRO/
├── src/
│   ├── services/        # FTPService, CasparService, DatabaseService
│   ├── controllers/     # API endpoints
│   └── utils/          # scriptParser con timing fix
├── public/             # Frontend SPA modulare
├── templates/          # lower-third.html, news templates
└── server.js          # Entry point porta 3333
```

## 🔧 Configurazione

### **.env File**
```env
# Database
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# CasparCG
CASPAR_HOST=100.74.188.128
CASPAR_PORT=5250

# FTP Upload
FTP_HOST=100.74.188.128
FTP_USER=casparcg
FTP_PASSWORD=casparcg
FTP_SECURE=true
```

### **FileZilla Server (Windows CasparCG)**
1. Install FileZilla Server
2. Create user: `casparcg`
3. Set root: `C:\Users\CasparTP\Documents\casparcg-server\media`
4. Enable FTPS with self-signed cert

## 🎬 Workflow Completo

### **1. Upload Video**
```bash
# Via FTP a CasparCG
curl -X POST http://localhost:3333/api/media/upload-to-caspar \
  -F "file=@test.mp4"
```

### **2. Crea Storia**
```javascript
// Script con timing corretto
Benvenuti al telegiornale.

((TAKE VTR - "9c626bc4-e08a.mp4" - 00:10))
((GFX ON - "lower-third.html" - 00:03))  // Overlay DURANTE video
((GFX OFF))

Grazie per l'attenzione.
```

### **3. Invia a Rundown**
- Posizione specificabile
- Auto-calcolo se omessa
- No duplicate constraint errors

### **4. Esegui Automazione**
- Click Play nel frontend
- Comandi paralleli con timing perfetto
- Video + grafica sincronizzati

## 📡 API Reference

### **Media Management**
```bash
POST /api/media/upload              # Local template
POST /api/media/upload-to-caspar    # FTP video/audio
GET  /api/media/ftp/test           # Test connection
GET  /api/media/ftp/list           # List remote files
```

### **Story & Rundown**
```bash
POST /api/stories/:id/send-to-rundown  # Con position fix
POST /api/automation/execute/:id       # Parallel execution
```

## 🔍 Testing

```bash
# Health Check
curl http://localhost:3333/api/health

# CasparCG Test
curl http://localhost:3333/api/caspar/test

# FTP Test
curl http://localhost:3333/api/media/ftp/test

# WebSocket Monitor
wscat -c ws://localhost:3334
```

## 🐛 Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| FTP timeout | Check FileZilla Server running on Windows |
| Duplicate rundown | Position parameter now handled correctly |
| Graphics timing wrong | Fixed with parallel execution |
| Template not found | Copy to /templates/, served via HTTP |

## 📊 Database Tables

- **stories**: News content with scripts
- **rundowns**: Broadcast schedules
- **rundown_items**: UNIQUE(rundown_id, position)
- **automation_commands**: Parsed CasparCG commands
- **media_assets**: Files with FTP metadata

## 🎯 Key Improvements v2.1

1. **FTP Upload System** - FileZilla Server integration
2. **Position Handling** - Rundown placement fixed
3. **Timing Fix** - Graphics overlay during video
4. **Template Management** - HTTP serve + FTP video separation
5. **Error Recovery** - All services auto-reconnect

## 📝 Script Commands

| Command | Description | Example |
|---------|-------------|---------|
| TAKE VTR | Play video | `((TAKE VTR - "file.mp4" - 00:30))` |
| GFX ON | Show graphic | `((GFX ON - "template.html" - 00:05))` |
| GFX OFF | Hide graphic | `((GFX OFF))` |
| WAIT | Pause | `((WAIT 5))` |

## 🚨 Status Indicators

- 🟢 **Verde**: Servizio connesso
- 🟡 **Giallo**: Riconnessione in corso
- 🔴 **Rosso**: Servizio offline

## 📞 Support

- **Logs**: `tail -f logs/inews-*.log`
- **Console**: Browser DevTools + Terminal
- **WebSocket**: Real-time updates porta 3334
- **Health**: http://localhost:3333/api/health

---

**Version**: 2.1.0
**Updated**: 2025-09-29
**Status**: Production Ready 🚀

## License

MIT License - Enterprise broadcast newsroom system