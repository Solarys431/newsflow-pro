/**
 * UI Module - iNEWS Professional 2025
 * Gestione interfaccia broadcast professionale
 */

class UI {
    constructor() {
        this.notificationTimeout = null;
        this.rundownData = this.createMockRundownData();
    }

    // Create mock rundown data that matches the GUI exactly
    createMockRundownData() {
        return [
            { id: 1, type: 'GFX', slug: 'SIGLA APERTURA', media: ['V', 'A'], duration: '0:15', back: '0:15' },
            { id: 2, type: 'RDR', slug: 'HEADLINES', media: [], duration: '0:30', back: '0:45' },
            { id: 3, type: 'LIVE', slug: 'TERREMOTO MILANO', media: ['G', 'V'], duration: '2:30', back: '3:15' },
            { id: 4, type: 'VO', slug: 'DANNI EPICENTRO', media: ['V', 'V'], duration: '0:45', back: '4:00' },
            { id: 5, type: 'SOT', slug: 'INT SINDACO', media: ['V', 'A'], duration: '1:15', back: '5:15' },
            { id: 6, type: 'PKG', slug: 'ELEZIONI USA', media: ['V', 'I'], duration: '3:20', back: '8:35' },
            { id: 7, type: 'BRK', slug: '--- PUBBLICITÀ ---', media: [], duration: '4:00', back: '12:35' },
            { id: 8, type: 'RDR', slug: 'ECONOMIA', media: [], duration: '0:20', back: '12:55' },
            { id: 9, type: 'VO', slug: 'BORSA MILANO', media: ['V', 'G'], duration: '1:10', back: '14:05' },
            { id: 10, type: 'PKG', slug: 'SERIE A', media: ['V', 'V'], duration: '2:45', back: '16:50' },
            { id: 11, type: 'GFX', slug: 'METEO', media: ['G'], duration: '1:30', back: '18:20' },
            { id: 12, type: 'GFX', slug: 'SIGLA CHIUSURA', media: ['V', 'A'], duration: '0:10', back: '18:30' }
        ];
    }

    // Render complete rundown table
    renderRundownTable() {
        const tbody = document.getElementById('rundown-items');
        if (!tbody) return;

        const rows = this.rundownData.map(item => {
            const mediaIcons = item.media.map(type => {
                const iconClass = type === 'V' ? 'video' : type === 'A' ? 'audio' : 'graphic';
                return `<span class="media-icon ${iconClass}">${type}</span>`;
            }).join('');

            return `
                <tr onclick="app.selectRundownItem(${item.id})" data-item-id="${item.id}">
                    <td><strong>${item.id}</strong></td>
                    <td><span class="type-badge ${item.type.toLowerCase()}">${item.type}</span></td>
                    <td><strong>${item.slug}</strong></td>
                    <td><div class="media-icons">${mediaIcons}</div></td>
                    <td>${item.duration}</td>
                    <td>${item.back}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    }

    // Initialize the new GUI layout
    initializeNewGUI() {
        this.renderRundownTable();
        this.startTimers();
        this.setupEventHandlers();
    }

    // Start all timers (ON AIR, system time)
    startTimers() {
        // ON AIR Timer
        let onAirSeconds = 11;
        const onAirTimer = document.getElementById('on-air-timer');
        if (onAirTimer) {
            setInterval(() => {
                onAirSeconds++;
                const hours = Math.floor(onAirSeconds / 3600);
                const minutes = Math.floor((onAirSeconds % 3600) / 60);
                const seconds = onAirSeconds % 60;
                onAirTimer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }, 1000);
        }

        // System Time
        const systemTime = document.getElementById('system-time');
        if (systemTime) {
            const updateTime = () => {
                const now = new Date();
                systemTime.textContent = now.toLocaleTimeString('it-IT');
            };
            updateTime();
            setInterval(updateTime, 1000);
        }
    }

    // Setup event handlers for new GUI
    setupEventHandlers() {
        // Toolbar button handlers
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleToolbarAction(action);
            });
        });

        // Control panel button handlers
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.classList.contains('cue') ? 'cue' :
                              e.currentTarget.classList.contains('take') ? 'take' : 'stop';
                this.handleControlAction(action);
            });
        });

        // Media add button handlers
        document.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.currentTarget.closest('.media-section');
                const sectionType = section.querySelector('h3').textContent;
                this.handleMediaAdd(sectionType);
            });
        });
    }

    // Handle toolbar actions
    handleToolbarAction(action) {
        // Update active state
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.action === action);
        });

        switch(action) {
            case 'new-story':
                if (window.app && app.createNewStory) {
                    app.createNewStory();
                } else {
                    this.showNotification('Creazione nuova storia', 'info');
                }
                break;
            case 'save':
                this.showNotification('Documento salvato', 'success');
                break;
            case 'rundown':
                this.showNotification('Vista Rundown attiva', 'info');
                break;
            case 'media':
                this.showNotification('Aprendo Media Browser', 'info');
                break;
            default:
                this.showNotification(`Azione ${action} in sviluppo`, 'info');
        }
    }

    // Handle control panel actions
    handleControlAction(action) {
        switch(action) {
            case 'cue':
                this.showNotification('CUE - Item preparato', 'warning');
                break;
            case 'take':
                this.showNotification('TAKE - Item in onda', 'success');
                break;
            case 'stop':
                this.showNotification('STOP - Fermato', 'error');
                break;
        }
    }

    // Handle media add actions
    handleMediaAdd(sectionType) {
        this.showNotification(`Aggiungendo media: ${sectionType}`, 'info');
    }

    // Status management for new GUI
    updateStatus(service, isConnected) {
        // Update device status in control panel
        const deviceStatus = document.querySelector(`.status-item:has(span:contains('${service}'))`);
        if (deviceStatus) {
            deviceStatus.className = `status-item ${isConnected ? 'connected' : 'error'}`;
        }

        // Update bottom status bar if applicable
        const statusIndicator = document.querySelector(`[data-service="${service}"] .status-dot`);
        if (statusIndicator) {
            statusIndicator.className = `status-dot ${isConnected ? 'connected' : 'disconnected'}`;
        }
    }

    // Select rundown item (called when clicking on table row)
    selectRundownItem(itemId) {
        // Remove previous selection
        document.querySelectorAll('.rundown-table tr').forEach(row => {
            row.classList.remove('selected');
        });

        // Add selection to clicked row
        const selectedRow = document.querySelector(`tr[data-item-id="${itemId}"]`);
        if (selectedRow) {
            selectedRow.classList.add('selected');
        }

        // Find and display the story data
        const item = this.rundownData.find(i => i.id === itemId);
        if (item) {
            this.displayStoryInEditor(item);
            this.showNotification(`Selezionato: ${item.slug}`, 'info');
        }
    }

    // Display story content in the center editor
    displayStoryInEditor(item) {
        const storyTitle = document.getElementById('story-title');
        if (storyTitle) {
            storyTitle.textContent = item.slug;
        }

        // Update story type badge
        const typeBadge = document.querySelector('.story-type-badge');
        if (typeBadge) {
            typeBadge.className = `story-type-badge ${item.type.toLowerCase()}`;
            typeBadge.textContent = item.type;
        }

        // Update duration
        const duration = document.querySelector('.story-duration strong');
        if (duration) {
            duration.textContent = item.duration;
        }

        // Update script content based on type
        this.updateScriptContent(item);
    }

    // Update script content based on story type
    updateScriptContent(item) {
        const onCamContent = document.getElementById('on-cam-content');
        const liveContent = document.getElementById('live-content');
        const voContent = document.getElementById('vo-content');

        // Clear all content first
        if (onCamContent) onCamContent.innerHTML = '';
        if (liveContent) liveContent.innerHTML = '';
        if (voContent) voContent.innerHTML = '';

        // Add content based on story type
        switch(item.type) {
            case 'LIVE':
                if (item.slug === 'TERREMOTO MILANO') {
                    if (onCamContent) onCamContent.innerHTML = '<p>Buonasera e bentornati.<br>Iniziamo con una notizia dell\'ultima ora.</p>';
                    if (liveContent) liveContent.innerHTML = '<p>Una forte scossa di terremoto di magnitudo 4.2 è stata registrata alle 14:30 con epicentro nella zona di San Siro a Milano.</p>';
                }
                break;
            case 'VO':
                if (voContent) voContent.innerHTML = `<p>Servizio video per: ${item.slug}<br>Durata: ${item.duration}</p>`;
                break;
            case 'PKG':
                if (onCamContent) onCamContent.innerHTML = `<p>Introduzione al package: ${item.slug}</p>`;
                break;
            case 'GFX':
                if (onCamContent) onCamContent.innerHTML = `<p>Grafica: ${item.slug}<br>Durata: ${item.duration}</p>`;
                break;
            default:
                if (onCamContent) onCamContent.innerHTML = `<p>Contenuto per: ${item.slug}<br>Tipo: ${item.type}</p>`;
        }
    }

    // Notifications
    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
            <span>${message}</span>
        `;

        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, Config.ui.notificationDuration);
    }

    // Stories View
    renderStoriesView(stories, rundowns = [], rundownItems = [], selectedRundownId = 'all') {
        // Crea una mappa di storie per rundown
        const storiesByRundown = {};
        const unassignedStories = [];

        // Prepara mappa di rundown items
        const storyToRundownMap = {};
        rundownItems.forEach(item => {
            if (!storyToRundownMap[item.story_id]) {
                storyToRundownMap[item.story_id] = [];
            }
            storyToRundownMap[item.story_id].push(item.rundown_id);
        });

        // Organizza le storie
        stories.forEach(story => {
            const rundownIds = storyToRundownMap[story.id];
            if (rundownIds && rundownIds.length > 0) {
                rundownIds.forEach(rundownId => {
                    if (!storiesByRundown[rundownId]) {
                        storiesByRundown[rundownId] = [];
                    }
                    storiesByRundown[rundownId].push(story);
                });
            } else {
                unassignedStories.push(story);
            }
        });

        // Filtra le storie basandosi sulla selezione
        let filteredStories = [];
        let currentRundownName = 'Tutte le Storie';

        if (selectedRundownId === 'all') {
            filteredStories = stories;
        } else if (selectedRundownId === 'unassigned') {
            filteredStories = unassignedStories;
            currentRundownName = 'Storie Non Assegnate';
        } else {
            filteredStories = storiesByRundown[selectedRundownId] || [];
            const rundown = rundowns.find(r => r.id === selectedRundownId);
            if (rundown) {
                currentRundownName = rundown.name;
            }
        }

        if (stories.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-newspaper"></i>
                    <h3>Nessuna storia</h3>
                    <p>Crea una nuova storia per iniziare</p>
                    <button class="btn btn-primary" onclick="app.createNewStory()">
                        <i class="fas fa-plus"></i> Nuova Storia
                    </button>
                </div>
            `;
        }

        return `
            <div class="view-header">
                <h2>Storie</h2>
                <div class="header-controls">
                    <select id="rundown-filter" class="form-input" onchange="app.filterStoriesByRundown(this.value)">
                        <option value="all" ${selectedRundownId === 'all' ? 'selected' : ''}>
                            📚 Tutte le Storie (${stories.length})
                        </option>
                        <option value="unassigned" ${selectedRundownId === 'unassigned' ? 'selected' : ''}>
                            📝 Non Assegnate (${unassignedStories.length})
                        </option>
                        <optgroup label="Rundown">
                            ${rundowns.map(r => {
                                const count = storiesByRundown[r.id]?.length || 0;
                                return `
                                    <option value="${r.id}" ${selectedRundownId === r.id ? 'selected' : ''}>
                                        📺 ${r.name} (${count})
                                    </option>
                                `;
                            }).join('')}
                        </optgroup>
                    </select>
                    <button class="btn btn-primary" onclick="app.createNewStory()">
                        <i class="fas fa-plus"></i> Nuova Storia
                    </button>
                </div>
            </div>

            <div class="filter-info">
                <span class="filter-label">Visualizzando: <strong>${currentRundownName}</strong></span>
                <span class="filter-count">${filteredStories.length} storie</span>
            </div>

            <div class="stories-grid">
                ${filteredStories.length === 0 ?
                    '<p class="empty-text">Nessuna storia in questo rundown</p>' :
                    filteredStories.map(story => {
                        const assignedRundowns = storyToRundownMap[story.id] || [];
                        const rundownNames = assignedRundowns
                            .map(rid => rundowns.find(r => r.id === rid)?.name || '')
                            .filter(name => name)
                            .join(', ');

                        return `
                            <div class="story-item" data-story-id="${story.id}">
                                <div class="story-header">
                                    <span class="story-slug">${story.slug}</span>
                                    <span class="story-status status-${story.status}">${story.status}</span>
                                </div>
                                <h3 class="story-title">${story.title}</h3>
                                ${rundownNames ? `<div class="story-rundown"><i class="fas fa-tv"></i> ${rundownNames}</div>` : ''}
                                <div class="story-meta">
                                    <span><i class="fas fa-user"></i> ${story.presenter || 'N/A'}</span>
                                    <span><i class="fas fa-clock"></i> ${this.formatDuration(story.estimated_duration)}</span>
                                    <button class="btn-icon btn-delete-story" title="Elimina storia"
                                        onclick="event.stopPropagation(); app.quickDeleteStory('${story.id}', '${story.slug}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        `;
    }

    // Story Editor
    async renderStoryEditor(story, rundowns = []) {
        // Cerca in quale rundown è già presente questa storia
        let currentRundownId = null;
        let currentPosition = null;

        for (const rundown of rundowns) {
            const items = await window.app.api.getRundownItems(rundown.id).catch(() => []);
            const item = items.find(i => i.story_id === story.id);
            if (item) {
                currentRundownId = rundown.id;
                currentPosition = item.position;
                break;
            }
        }

        return `
            <div class="panel-header">
                <h3>Modifica Storia</h3>
                <button class="btn-close" onclick="document.getElementById('right-panel').classList.remove('active')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="story-form" class="panel-content">
                <div class="form-group">
                    <label>Slug</label>
                    <input type="text" name="slug" value="${story.slug}" class="form-input">
                </div>
                <div class="form-group">
                    <label>Titolo</label>
                    <input type="text" name="title" value="${story.title}" class="form-input">
                </div>
                <div class="form-group">
                    <label>Tipo</label>
                    <select name="type" class="form-input">
                        <option value="PKG" ${story.type === 'PKG' ? 'selected' : ''}>Package</option>
                        <option value="VO" ${story.type === 'VO' ? 'selected' : ''}>Voice Over</option>
                        <option value="SOT" ${story.type === 'SOT' ? 'selected' : ''}>Sound on Tape</option>
                        <option value="LIVE" ${story.type === 'LIVE' ? 'selected' : ''}>Live</option>
                        <option value="GFX" ${story.type === 'GFX' ? 'selected' : ''}>Graphics</option>
                    </select>
                </div>

                <!-- Campo Rundown -->
                <div class="form-group" style="background: var(--bg-primary); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                    <label style="color: var(--primary); font-weight: 600;">
                        <i class="fas fa-clipboard-list"></i> Rundown Associato
                    </label>
                    <select id="story-rundown" class="form-input" style="margin-bottom: 10px;">
                        <option value="">-- Non associato a nessun rundown --</option>
                        ${rundowns.map(r => `
                            <option value="${r.id}" ${currentRundownId === r.id ? 'selected' : ''}>
                                ${r.name} - ${new Date(r.air_date).toLocaleDateString('it-IT')} ${r.air_time.substring(0, 5)}
                            </option>
                        `).join('')}
                    </select>
                    ${currentRundownId ? `
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <label style="flex: 0 0 auto;">Posizione:</label>
                            <input type="number" id="story-position" class="form-input" value="${currentPosition || ''}"
                                min="1" placeholder="Auto" style="width: 100px;">
                            <button type="button" class="btn btn-sm btn-primary" onclick="app.updateRundownAssociation()">
                                <i class="fas fa-sync"></i> Aggiorna Posizione
                            </button>
                        </div>
                    ` : `
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <label style="flex: 0 0 auto;">Posizione:</label>
                            <input type="number" id="story-position" class="form-input"
                                min="1" placeholder="Auto" style="width: 100px;">
                        </div>
                    `}
                </div>

                <div class="form-group">
                    <label>Script</label>
                    <div class="script-toolbar">
                        <button type="button" class="btn btn-sm" onclick="app.showMediaBrowser()" title="Sfoglia Media">
                            <i class="fas fa-folder-open"></i> Media
                        </button>
                    </div>
                    <textarea name="script" id="story-script" class="form-input" rows="10">${story.script || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Giornalista</label>
                    <input type="text" name="presenter" value="${story.presenter || ''}" class="form-input">
                </div>
                <div class="form-group">
                    <label>Produttore</label>
                    <input type="text" name="producer" value="${story.producer || ''}" class="form-input">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-primary" onclick="app.saveStory()">
                        <i class="fas fa-save"></i> Salva
                    </button>
                    <button type="button" class="btn btn-success" onclick="app.saveAndSendToRundown()">
                        <i class="fas fa-paper-plane"></i> Salva e Invia a Rundown
                    </button>
                    <button type="button" class="btn btn-danger" onclick="app.deleteStory()">
                        <i class="fas fa-trash"></i> Elimina Storia
                    </button>
                </div>
            </form>
        `;
    }

    // Rundown Manager View
    renderRundownManagerView(rundowns, currentRundown, items) {
        const statusColors = {
            preparation: 'warning',
            ready: 'success',
            on_air: 'danger',
            completed: 'secondary'
        };

        const statusLabels = {
            preparation: 'In Preparazione',
            ready: 'Pronto',
            on_air: 'In Onda',
            completed: 'Completato'
        };

        return `
            <div class="view-header">
                <h2>Gestione Rundown</h2>
                <div class="rundown-controls">
                    <select id="rundown-selector" class="form-input" style="width: 300px;">
                        ${rundowns.map(r => `
                            <option value="${r.id}" ${currentRundown && r.id === currentRundown.id ? 'selected' : ''}>
                                ${r.name} - ${new Date(r.air_date).toLocaleDateString('it-IT')} ${r.air_time.substring(0, 5)}
                                [${statusLabels[r.status]}]
                            </option>
                        `).join('')}
                    </select>
                    <button id="btn-new-rundown" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Nuovo Rundown
                    </button>
                    <button id="btn-edit-rundown" class="btn btn-secondary" ${!currentRundown ? 'disabled' : ''}>
                        <i class="fas fa-edit"></i> Modifica
                    </button>
                    <button id="btn-delete-rundown" class="btn btn-danger" ${!currentRundown ? 'disabled' : ''}>
                        <i class="fas fa-trash"></i> Elimina
                    </button>
                </div>
            </div>

            ${currentRundown ? `
                <div class="rundown-details">
                    <div class="rundown-meta">
                        <h3>${currentRundown.show_name}</h3>
                        <div class="meta-info">
                            <span class="badge badge-${statusColors[currentRundown.status]}">
                                ${statusLabels[currentRundown.status]}
                            </span>
                            <span><i class="fas fa-calendar"></i> ${new Date(currentRundown.air_date).toLocaleDateString('it-IT')}</span>
                            <span><i class="fas fa-clock"></i> ${currentRundown.air_time}</span>
                            <span><i class="fas fa-list"></i> ${items.length} elementi</span>
                        </div>
                    </div>
                </div>

                <div class="rundown-list">
                    ${items.length === 0 ? '<p class="empty-text">Nessun elemento nel rundown. Aggiungi storie dalla sezione Storie.</p>' : ''}
                    ${items.map(item => `
                        <div class="rundown-item" data-item-id="${item.id}">
                            <div class="item-position">${item.position}</div>
                            <div class="item-content">
                                <div class="item-slug">${item.stories?.slug || 'N/A'}</div>
                                <div class="item-title">${item.stories?.title || 'Senza titolo'}</div>
                            </div>
                            <div class="item-duration">${this.formatDuration(item.estimated_duration)}</div>
                            <div class="item-actions">
                                <button class="btn-icon btn-play" title="Esegui">
                                    <i class="fas fa-play"></i>
                                </button>
                                <button class="btn-icon btn-remove" title="Rimuovi">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Nessun rundown selezionato</h3>
                    <p>Seleziona un rundown dal menu o creane uno nuovo</p>
                </div>
            `}
        `;
    }

    // Backward compatibility - manteniamo il vecchio metodo per sicurezza
    renderRundownView(rundown, items) {
        return this.renderRundownManagerView([rundown], rundown, items);
    }

    // Automation View
    renderAutomationView() {
        return `
            <div class="view-header">
                <h2>Automazione</h2>
            </div>
            <div class="automation-panel">
                <div class="card">
                    <h3>CasparCG Control</h3>
                    <button id="btn-test-caspar" class="btn btn-primary">
                        <i class="fas fa-plug"></i> Test Connessione
                    </button>
                </div>
            </div>
        `;
    }

    // Media View
    renderMediaView(media) {
        return `
            <div class="view-header">
                <h2>Media</h2>
                <div class="media-upload-buttons">
                    <label class="btn btn-primary">
                        <i class="fas fa-upload"></i> Upload Locale
                        <input type="file" id="media-upload-local" hidden>
                    </label>
                    <label class="btn btn-success">
                        <i class="fas fa-server"></i> Upload a CasparCG
                        <input type="file" id="media-upload-caspar" accept=".mp4,.mov,.avi,.mkv,.wav,.mp3,.aiff,.flac" hidden>
                    </label>
                    <button class="btn btn-secondary" onclick="app.testFTPConnection()">
                        <i class="fas fa-network-wired"></i> Test FTP
                    </button>
                </div>
            </div>

            <!-- Progress bar per upload -->
            <div id="upload-progress" style="display: none;">
                <div class="upload-info">
                    <span class="upload-filename"></span>
                    <span class="upload-percent">0%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="upload-stats">
                    <span class="upload-bytes">0 B / 0 B</span>
                </div>
            </div>

            <div class="media-grid">
                ${media.map(file => `
                    <div class="media-item" data-filename="${file.filename}">
                        <div class="media-icon">
                            <i class="fas fa-${file.file_type === 'video' ? 'video' : file.file_type === 'audio' ? 'music' : 'image'}"></i>
                        </div>
                        <div class="media-name">${file.original_filename}</div>
                        <div class="media-info">
                            ${file.file_type} • ${this.formatFileSize(file.file_size)}
                            ${file.metadata?.location === 'remote' ? '<span class="badge badge-success">CasparCG</span>' : '<span class="badge badge-info">Locale</span>'}
                        </div>
                        <div class="media-actions">
                            <button class="btn btn-sm btn-danger" onclick="app.deleteMedia('${file.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Nuova funzione per aggiornare progress bar
    updateUploadProgress(data) {
        const progressEl = document.getElementById('upload-progress');
        if (!progressEl) return;

        progressEl.style.display = 'block';
        progressEl.querySelector('.upload-filename').textContent = data.filename;
        progressEl.querySelector('.upload-percent').textContent = `${data.progress}%`;
        progressEl.querySelector('.progress-fill').style.width = `${data.progress}%`;

        const bytesStr = `${this.formatFileSize(data.bytes)} / ${this.formatFileSize(data.total)}`;
        progressEl.querySelector('.upload-bytes').textContent = bytesStr;

        // Nascondi dopo completamento
        if (data.progress >= 100) {
            setTimeout(() => {
                progressEl.style.display = 'none';
            }, 2000);
        }
    }

    // Utilities
    formatDuration(seconds) {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    showModal(content, title = '') {
        const modal = document.getElementById('modal-container');
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="window.ui.closeModal()"></div>
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="btn-close" onclick="window.ui.closeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
            </div>
        `;
        modal.classList.add('active');
    }

    closeModal() {
        const modal = document.getElementById('modal-container');
        modal.classList.remove('active');
    }

    renderMediaBrowser(mediaFiles) {
        // Separa i file per categoria
        const casparFiles = mediaFiles.filter(f => f.location === 'caspar');
        const templateFiles = mediaFiles.filter(f => f.location === 'template');
        const localFiles = mediaFiles.filter(f => f.location === 'local');

        return `
            <div class="media-browser">
                <div class="media-tabs">
                    <button class="tab active" data-tab="caspar" onclick="app.switchMediaTab('caspar')">
                        CasparCG (${casparFiles.length})
                    </button>
                    <button class="tab" data-tab="templates" onclick="app.switchMediaTab('templates')">
                        Grafiche (${templateFiles.length})
                    </button>
                    <button class="tab" data-tab="local" onclick="app.switchMediaTab('local')">
                        Locale (${localFiles.length})
                    </button>
                </div>

                <div class="media-list" data-tab="caspar">
                    ${casparFiles.length === 0 ? '<p class="empty-text">Nessun file su CasparCG</p>' : ''}
                    ${casparFiles.map(file => this.renderMediaItem(file)).join('')}
                </div>

                <div class="media-list" data-tab="templates" style="display:none;">
                    ${templateFiles.length === 0 ? '<p class="empty-text">Nessun template disponibile</p>' : ''}
                    ${templateFiles.map(file => this.renderMediaItem(file)).join('')}
                </div>

                <div class="media-list" data-tab="local" style="display:none;">
                    ${localFiles.length === 0 ? '<p class="empty-text">Nessun file locale</p>' : ''}
                    ${localFiles.map(file => this.renderMediaItem(file)).join('')}
                </div>
            </div>
        `;
    }

    renderMediaItem(file) {
        const icon = file.type === 'template' ? 'fa-code' :
                    file.type?.includes('video') || file.type === 'movie' ? 'fa-video' :
                    file.type?.includes('audio') || file.type === 'audio' ? 'fa-music' :
                    file.type?.includes('image') || file.type === 'still' ? 'fa-image' : 'fa-file';

        // Usa display_name se disponibile, altrimenti filename
        const displayName = file.display_name || file.filename || file.name || 'Unknown';
        const actualFilename = file.filename || file.name; // Nome reale del file per i comandi

        const location = file.location === 'caspar' ? '🎬' :
                        file.location === 'template' ? '🎨' : '💾';

        // Se abbiamo sia nome originale che filename diverso, mostra entrambi
        const showBothNames = file.display_name && file.display_name !== actualFilename;

        return `
            <div class="media-item" data-filename="${actualFilename}" data-location="${file.location}">
                <div class="media-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="media-info">
                    <div class="media-name">
                        ${location} ${displayName}
                    </div>
                    ${showBothNames ? `<div class="media-filename">[${actualFilename}]</div>` : ''}
                    <div class="media-meta">
                        ${file.size ? this.formatFileSize(file.size) : ''}
                        ${file.duration ? '• ' + this.formatDuration(file.duration) : ''}
                        ${file.fps ? '• ' + file.fps + ' fps' : ''}
                    </div>
                </div>
                <button class="btn btn-sm btn-primary"
                    onclick="app.insertMediaFile('${actualFilename}', '${file.type || 'unknown'}', '${file.location}')">
                    <i class="fas fa-plus"></i> Inserisci
                </button>
                ${file.location === 'caspar' ? `
                    <button class="btn btn-sm btn-danger"
                        onclick="app.deleteFromCaspar('${actualFilename}', '${displayName}')"
                        title="Elimina da CasparCG">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }

    renderSettings() {
        return '<p>Impostazioni in costruzione</p>';
    }
}