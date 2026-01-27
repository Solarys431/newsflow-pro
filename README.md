<p align="center">
  <img src="public/images/logo.png" alt="NewsFlow Pro" width="450">
</p>

# NewsFlow Pro

**Broadcast newsroom system with CasparCG automation**

## Status: In Development

| Component | Status |
|-----------|--------|
| Backend API | Working |
| Frontend UI | Working |
| CasparCG | Integrated |
| Database | Supabase |
| WebSocket | Real-time |
| FTP Upload | Implemented |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Solarys431/newsflow-pro.git
cd newsflow-pro
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Run
npm start        # Production
npm run dev      # Development (hot reload)
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
# Server
PORT=3333
WS_PORT=3334
HOST=localhost

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (PostgreSQL alternative)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=newsflow
DB_USER=your_user
DB_PASSWORD=your_password

# CasparCG
CASPAR_HOST=your_caspar_ip
CASPAR_PORT=5250

# FTP (media upload to CasparCG)
FTP_HOST=your_ftp_host
FTP_USER=your_ftp_user
FTP_PASSWORD=your_ftp_password
FTP_SECURE=true
```

> **Important**: The app requires a configured `.env` file. No fallback values.

## Structure

```
newsflow-pro/
├── src/
│   ├── config/         # Configuration
│   ├── controllers/    # API endpoints
│   ├── middleware/     # Error handling, logging
│   ├── services/       # CasparCG, Database, WebSocket, FTP
│   ├── utils/          # Parser, validators
│   └── app.js          # Main application
├── public/
│   ├── css/            # Styles
│   ├── js/             # Frontend modules
│   └── index.html      # Entry point
├── server.js           # Server entry
└── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/stories` | GET/POST | Story management |
| `/api/rundown` | GET | Current rundown |
| `/api/automation/execute/:id` | POST | Execute automation |
| `/api/media` | GET/POST | Media management |
| `/api/caspar/test` | GET | Test CasparCG |

## Features

- **Story Editor**: Create and edit stories with scripts
- **Timeline Builder**: Visual timeline editor
- **Rundown Management**: Show rundown management
- **CasparCG Automation**: Video and graphics control
- **Real-time Updates**: WebSocket live updates
- **Media Upload**: FTP upload to CasparCG

## Testing

```bash
# Health check
curl http://localhost:3333/api/health

# Test CasparCG
curl http://localhost:3333/api/caspar/test
```

## Script Commands

| Command | Description | Example |
|---------|-------------|---------|
| TAKE VTR | Play video | `((TAKE VTR - "file.mp4" - 00:30))` |
| GFX ON | Show graphics | `((GFX ON - "template.html" - 00:05))` |
| GFX OFF | Hide graphics | `((GFX OFF))` |

---

## Author

**Daniele Cappello** (Solarys)

- Website: [museumofsyntheticvoices.com](https://museumofsyntheticvoices.com)
- Email: info@museumofsyntheticvoices.com
- GitHub: [@Solarys431](https://github.com/Solarys431)

## Credits

This project uses [CasparCG](https://casparcg.com/), an open source video playout server originally developed by SVT (Sveriges Television).

---

**Version**: 2.1.0
**Status**: In Development
**License**: MIT
