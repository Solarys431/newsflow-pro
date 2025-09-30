/**
 * Main Application Entry Point
 * Inizializzazione applicazione frontend
 */

class NewsroomApp {
    constructor() {
        this.api = new API();
        this.ws = new WebSocketClient();
        this.ui = new UI();

        // Esponi ui globalmente per i modal
        window.ui = this.ui;
        // Esponi app globalmente per i click handlers
        window.app = this;

        this.currentView = 'rundown';
        this.currentStory = null;
        this.currentRundown = null;
        this.selectedRundownItem = null;
        this.stories = [];
        this.rundowns = [];
        this.rundownItems = [];
    }

    async init() {
        console.log('🚀 Starting iNEWS Professional 2025');

        // Initialize new GUI layout
        this.ui.initializeNewGUI();

        // Check system health
        await this.checkHealth();

        // Connect WebSocket
        this.ws.connect();

        // Setup additional event handlers
        this.setupEventHandlers();

        // Load initial data
        await this.loadInitialData();

        console.log('✅ iNEWS Professional ready for broadcast!');
    }

    async loadInitialData() {
        try {
            // Load stories and rundowns in background
            const [stories, rundowns] = await Promise.all([
                this.api.getStories().catch(() => []),
                this.api.getRundowns().catch(() => [])
            ]);

            this.stories = stories;
            this.rundowns = rundowns;

            // Select first rundown item by default (TERREMOTO MILANO)
            setTimeout(() => {
                this.selectRundownItem(3); // Item 3 = TERREMOTO MILANO
            }, 500);
        } catch (error) {
            console.warn('Could not load initial data, using mock data');
        }
    }

    // Select rundown item (exposed globally)
    selectRundownItem(itemId) {
        this.selectedRundownItem = itemId;
        this.ui.selectRundownItem(itemId);
    }

    async checkHealth() {
        try {
            const health = await this.api.getHealth();
            console.log('System health:', health);

            // Update device status in control panel
            this.ui.updateStatus('CasparCG 1', health.services.caspar === 'connected');
            this.ui.updateStatus('Video Server', true); // Mock as connected
            this.ui.updateStatus('Audio Mixer', true); // Mock as connected
            this.ui.updateStatus('Graphics', health.services.caspar === 'connected');

            // Update status bar
            const mosStatus = document.querySelector('.status-bar .status-dot');
            if (mosStatus && health.services.database === 'connected') {
                mosStatus.classList.add('connected');
            }
        } catch (error) {
            console.error('Health check failed:', error);
            this.ui.showNotification('Sistema in modalità offline', 'warning');

            // Set all to disconnected in case of error
            this.ui.updateStatus('CasparCG 1', false);
            this.ui.updateStatus('Graphics', false);
        }
    }

    setupEventHandlers() {
        // WebSocket events for real-time updates
        this.ws.on('story_created', () => {
            this.refreshData();
            this.ui.showNotification('Nuova storia creata', 'success');
        });

        this.ws.on('story_updated', () => {
            this.refreshData();
        });

        this.ws.on('caspar_status', (data) => {
            this.ui.updateStatus('CasparCG 1', data.status === 'connected');
            this.ui.updateStatus('Graphics', data.status === 'connected');
        });

        this.ws.on('upload_progress', (data) => {
            console.log('Upload progress:', data);
        });

        this.ws.on('media_uploaded_to_caspar', () => {
            this.ui.showNotification('File caricato su CasparCG', 'success');
        });

        // Show selector change handler
        const showSelector = document.getElementById('show-selector');
        if (showSelector) {
            showSelector.addEventListener('change', (e) => {
                this.ui.showNotification(`Selezionato: ${e.target.selectedOptions[0].text}`, 'info');
            });
        }
    }

    // Updated for new GUI - no more view switching, everything is visible
    async refreshData() {
        try {
            const [stories, rundowns] = await Promise.all([
                this.api.getStories(),
                this.api.getRundowns()
            ]);

            this.stories = stories;
            this.rundowns = rundowns;

            console.log('Data refreshed:', { stories: stories.length, rundowns: rundowns.length });
        } catch (error) {
            console.error('Error refreshing data:', error);
        }
    }

    async loadStories(selectedRundownId = null) {
        // Carica tutti i dati necessari
        const [stories, rundowns] = await Promise.all([
            this.api.getStories(),
            this.api.getRundowns()
        ]);

        // Carica tutti i rundown items per mappare le storie
        const rundownItems = [];
        for (const rundown of rundowns) {
            const items = await this.api.getRundownItems(rundown.id);
            rundownItems.push(...items);
        }

        this.stories = stories;
        this.rundowns = rundowns;
        this.rundownItems = rundownItems;

        // Usa il filtro salvato o quello passato
        const filterValue = selectedRundownId || this.selectedRundownFilter || 'all';
        this.selectedRundownFilter = filterValue;

        const container = document.getElementById('content-container');
        container.innerHTML = this.ui.renderStoriesView(stories, rundowns, rundownItems, filterValue);

        // Setup click handlers
        document.querySelectorAll('.story-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectStory(item.dataset.storyId);
            });
        });
    }

    filterStoriesByRundown(rundownId) {
        this.selectedRundownFilter = rundownId;
        this.loadStories(rundownId);
    }

    async selectStory(storyId) {
        const story = await this.api.getStory(storyId);
        this.currentStory = story;

        // Carica anche i rundown disponibili
        const rundowns = await this.api.getRundowns();

        const panel = document.getElementById('right-panel');
        panel.innerHTML = await this.ui.renderStoryEditor(story, rundowns);
        panel.classList.add('active');
    }

    async saveStory() {
        if (!this.currentStory) return;

        const form = document.getElementById('story-form');
        const formData = new FormData(form);
        const updates = Object.fromEntries(formData.entries());

        try {
            await this.api.updateStory(this.currentStory.id, updates);
            this.ui.showNotification('Storia salvata', 'success');
            await this.loadStories();
        } catch (error) {
            this.ui.showNotification('Errore salvataggio', 'error');
        }
    }

    async createNewStory() {
        const rundowns = await this.api.getRundowns();

        const content = `
            <form id="create-story-form">
                <div class="form-group">
                    <label>Slug *</label>
                    <input type="text" name="slug" class="form-input" placeholder="es. APERTURA-TG" required>
                </div>
                <div class="form-group">
                    <label>Titolo *</label>
                    <input type="text" name="title" class="form-input" placeholder="es. Apertura Telegiornale" required>
                </div>
                <div class="form-group">
                    <label>Tipo</label>
                    <select name="type" class="form-input">
                        <option value="PKG">Package</option>
                        <option value="VO">Voice Over</option>
                        <option value="SOT">Sound on Tape</option>
                        <option value="LIVE">Live</option>
                        <option value="GFX">Graphics</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Giornalista</label>
                    <input type="text" name="presenter" class="form-input" placeholder="Nome del giornalista">
                </div>
                <div class="form-group">
                    <label>Produttore</label>
                    <input type="text" name="producer" class="form-input" placeholder="Nome del produttore">
                </div>

                <!-- Selezione Rundown -->
                <div class="form-group" style="background: var(--bg-primary); padding: 12px; border-radius: 8px;">
                    <label style="color: var(--primary); font-weight: 600;">
                        <i class="fas fa-clipboard-list"></i> Aggiungi a Rundown (opzionale)
                    </label>
                    <select name="rundown_id" class="form-input">
                        <option value="">-- Non aggiungere a nessun rundown --</option>
                        ${rundowns.map(r => `
                            <option value="${r.id}">
                                ${r.name} - ${new Date(r.air_date).toLocaleDateString('it-IT')} ${r.air_time.substring(0, 5)}
                            </option>
                        `).join('')}
                    </select>
                    <label style="margin-top: 8px;">Posizione nel rundown</label>
                    <input type="number" name="position" class="form-input" min="1" placeholder="Automatica">
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Crea Storia
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="window.ui.closeModal()">
                        Annulla
                    </button>
                </div>
            </form>
        `;

        this.ui.showModal(content, 'Nuova Storia');

        document.getElementById('create-story-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);

            try {
                // Crea la storia
                const story = await this.api.createStory({
                    slug: formData.get('slug').toUpperCase(),
                    title: formData.get('title'),
                    type: formData.get('type'),
                    presenter: formData.get('presenter'),
                    producer: formData.get('producer'),
                    status: 'draft'
                });

                this.ui.showNotification('Storia creata', 'success');

                // Se c'è un rundown selezionato, aggiungi la storia
                const rundownId = formData.get('rundown_id');
                if (rundownId) {
                    const position = formData.get('position');
                    const params = { rundown_id: rundownId };
                    if (position) params.position = parseInt(position);

                    await this.api.sendToRundown(story.id, params);
                    this.ui.showNotification('Storia aggiunta al rundown', 'success');
                }

                this.ui.closeModal();
                await this.loadStories();
                this.selectStory(story.id);
            } catch (error) {
                console.error('Create story error:', error);
                this.ui.showNotification('Errore creazione storia', 'error');
            }
        });
    }

    async saveAndSendToRundown() {
        if (!this.currentStory) return;

        // Prima salva la storia
        await this.saveStory();

        // Poi gestisci l'invio al rundown
        const rundownSelect = document.getElementById('story-rundown');
        const positionInput = document.getElementById('story-position');

        if (!rundownSelect || !rundownSelect.value) {
            this.ui.showNotification('Seleziona un rundown', 'warning');
            return;
        }

        try {
            const params = { rundown_id: rundownSelect.value };
            if (positionInput && positionInput.value) {
                params.position = parseInt(positionInput.value);
            }

            const result = await this.api.sendToRundown(this.currentStory.id, params);

            // Mostra messaggio appropriato
            if (result && result.message && result.message.includes('updated')) {
                this.ui.showNotification('Storia aggiornata nel rundown', 'success');
            } else {
                this.ui.showNotification('Storia salvata e inviata al rundown', 'success');
            }

            // Ricarica la vista per aggiornare lo stato
            await this.selectStory(this.currentStory.id);
        } catch (error) {
            console.error('Send to rundown error:', error);
            // Mostra un messaggio più specifico se la storia è già nel rundown
            if (error.message && error.message.includes('409')) {
                this.ui.showNotification('Questa storia è già presente nel rundown selezionato', 'error');
            } else {
                this.ui.showNotification('Errore invio al rundown', 'error');
            }
        }
    }

    async updateRundownAssociation() {
        if (!this.currentStory) return;

        const positionInput = document.getElementById('story-position');
        if (!positionInput) return;

        // TODO: Implementare l'aggiornamento della posizione nel rundown
        // Per ora mostra solo un messaggio
        this.ui.showNotification('Funzionalità in sviluppo', 'info');
    }

    async sendToRundown() {
        if (!this.currentStory) return;

        // Carica i rundown disponibili
        const rundowns = await this.api.getRundowns();

        if (rundowns.length === 0) {
            this.ui.showNotification('Nessun rundown disponibile. Crea prima un rundown.', 'warning');
            return;
        }

        // Se c'è solo un rundown o abbiamo già un rundown attivo, usa quello
        let targetRundownId = null;

        if (rundowns.length === 1) {
            targetRundownId = rundowns[0].id;
        } else if (this.currentRundown) {
            targetRundownId = this.currentRundown.id;
        } else {
            // Mostra dialog per scegliere il rundown
            const content = `
                <form id="select-rundown-form">
                    <div class="form-group">
                        <label>Seleziona Rundown di destinazione</label>
                        <select name="rundown_id" class="form-input" required>
                            ${rundowns.map(r => `
                                <option value="${r.id}">
                                    ${r.name} - ${new Date(r.air_date).toLocaleDateString('it-IT')} ${r.air_time.substring(0, 5)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Posizione nel rundown (opzionale)</label>
                        <input type="number" name="position" class="form-input" min="1" placeholder="Automatica">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Invia al Rundown</button>
                        <button type="button" class="btn btn-secondary" onclick="window.ui.closeModal()">Annulla</button>
                    </div>
                </form>
            `;

            this.ui.showModal(content, 'Invia Storia al Rundown');

            document.getElementById('select-rundown-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                targetRundownId = formData.get('rundown_id');
                const position = formData.get('position');

                try {
                    const params = { rundown_id: targetRundownId };
                    if (position) params.position = parseInt(position);

                    await this.api.sendToRundown(this.currentStory.id, params);
                    this.ui.showNotification('Storia inviata al rundown', 'success');
                    this.ui.closeModal();
                } catch (error) {
                    this.ui.showNotification('Errore invio al rundown', 'error');
                }
            });
            return;
        }

        // Invia direttamente al rundown selezionato
        try {
            await this.api.sendToRundown(this.currentStory.id, { rundown_id: targetRundownId });
            this.ui.showNotification('Storia inviata al rundown', 'success');
        } catch (error) {
            this.ui.showNotification('Errore invio al rundown', 'error');
        }
    }

    async deleteStory() {
        if (!this.currentStory) return;

        const confirmDelete = confirm(`Eliminare la storia "${this.currentStory.slug}"?\n\nQuesta azione è irreversibile!`);
        if (!confirmDelete) return;

        try {
            await this.api.deleteStory(this.currentStory.id);
            this.ui.showNotification('Storia eliminata', 'success');

            // Chiudi il pannello e ricarica le storie
            document.getElementById('right-panel').classList.remove('active');
            this.currentStory = null;
            await this.loadStories();
        } catch (error) {
            console.error('Error deleting story:', error);
            this.ui.showNotification('Errore eliminazione storia', 'error');
        }
    }

    async quickDeleteStory(storyId, storySlug) {
        const confirmDelete = confirm(`Eliminare la storia "${storySlug}"?\n\nQuesta azione è irreversibile!`);
        if (!confirmDelete) return;

        try {
            console.log(`Deleting story: ${storySlug} (ID: ${storyId})`);
            await this.api.deleteStory(storyId);
            this.ui.showNotification(`Storia "${storySlug}" eliminata`, 'success');

            // Se la storia eliminata era aperta, chiudi il pannello
            if (this.currentStory && this.currentStory.id === storyId) {
                document.getElementById('right-panel').classList.remove('active');
                this.currentStory = null;
            }

            // Ricarica le storie mantenendo il filtro corrente
            await this.loadStories(this.selectedRundownFilter);
        } catch (error) {
            console.error('Error deleting story:', error);
            this.ui.showNotification('Errore eliminazione storia', 'error');
        }
    }

    async loadRundown() {
        // Carica tutti i rundown disponibili
        const rundowns = await this.api.getRundowns();
        this.rundowns = rundowns;

        // Se non c'è un rundown corrente, usa quello di oggi
        if (!this.currentRundown) {
            this.currentRundown = await this.api.getCurrentRundown();
        }

        const items = await this.api.getRundownItems(this.currentRundown.id);
        this.rundownItems = items;

        const container = document.getElementById('content-container');
        container.innerHTML = this.ui.renderRundownManagerView(this.rundowns, this.currentRundown, items);

        // Setup handlers per selezione rundown
        document.getElementById('rundown-selector')?.addEventListener('change', async (e) => {
            const rundownId = e.target.value;
            if (rundownId) {
                this.currentRundown = await this.api.getRundownById(rundownId);
                await this.loadRundown();
            }
        });

        // Handler per creare nuovo rundown
        document.getElementById('btn-new-rundown')?.addEventListener('click', () => {
            this.showCreateRundownDialog();
        });

        // Handler per modificare rundown
        document.getElementById('btn-edit-rundown')?.addEventListener('click', () => {
            if (this.currentRundown) {
                this.showEditRundownDialog(this.currentRundown);
            }
        });

        // Handler per eliminare rundown
        document.getElementById('btn-delete-rundown')?.addEventListener('click', () => {
            if (this.currentRundown) {
                this.deleteRundown(this.currentRundown.id);
            }
        });

        // Setup handlers esistenti per items
        document.querySelectorAll('.btn-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = e.target.closest('.rundown-item').dataset.itemId;
                this.executeAutomation(itemId);
            });
        });

        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = e.target.closest('.rundown-item').dataset.itemId;
                this.removeFromRundown(itemId);
            });
        });
    }

    async executeAutomation(itemId) {
        try {
            await this.api.executeAutomation(itemId);
            this.ui.showNotification('Automazione eseguita', 'success');
        } catch (error) {
            this.ui.showNotification('Errore automazione', 'error');
        }
    }

    async removeFromRundown(itemId) {
        if (!confirm('Rimuovere dal rundown?')) return;

        try {
            await this.api.removeFromRundown(itemId);
            this.ui.showNotification('Rimosso dal rundown', 'success');
            await this.loadRundown();
        } catch (error) {
            this.ui.showNotification('Errore rimozione', 'error');
        }
    }

    async loadMedia() {
        const media = await this.api.getMedia();
        const container = document.getElementById('content-container');
        container.innerHTML = this.ui.renderMediaView(media);

        // Setup upload locale
        document.getElementById('media-upload-local')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                await this.api.uploadMedia(file);
                this.ui.showNotification('File caricato localmente', 'success');
                await this.loadMedia();
            } catch (error) {
                this.ui.showNotification('Errore upload locale', 'error');
            }
        });

        // Setup upload a CasparCG via FTP
        document.getElementById('media-upload-caspar')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                await this.api.uploadMediaToCaspar(file);
                this.ui.showNotification('Upload a CasparCG avviato', 'info');
                // Progress sarà mostrato via WebSocket
            } catch (error) {
                this.ui.showNotification('Errore upload a CasparCG', 'error');
            }
        });
    }

    async testFTPConnection() {
        try {
            const result = await this.api.testFTPConnection();
            this.ui.showNotification(
                result.success ?
                `FTP connesso (${result.filesCount} file)` :
                `FTP non connesso: ${result.error}`,
                result.success ? 'success' : 'error'
            );
        } catch (error) {
            this.ui.showNotification('Errore test FTP', 'error');
        }
    }

    async deleteMedia(mediaId) {
        if (!confirm('Eliminare questo file?')) return;

        try {
            await this.api.deleteMedia(mediaId);
            this.ui.showNotification('File eliminato', 'success');
            await this.loadMedia();
        } catch (error) {
            this.ui.showNotification('Errore eliminazione', 'error');
        }
    }

    setupAutomationHandlers() {
        document.getElementById('btn-test-caspar')?.addEventListener('click', async () => {
            try {
                const result = await this.api.testCaspar();
                this.ui.showNotification(
                    result.connected ? 'CasparCG connesso' : 'CasparCG non connesso',
                    result.connected ? 'success' : 'error'
                );
            } catch (error) {
                this.ui.showNotification('Errore test', 'error');
            }
        });
    }

    // Clock is now handled by UI module in startTimers()

    showSettings() {
        this.ui.showModal(this.ui.renderSettings(), 'Impostazioni');
    }

    // Media Browser functions
    async showMediaBrowser() {
        try {
            // Carica tutti i tipi di media
            const [localMedia, casparMedia, templates] = await Promise.all([
                this.api.getMedia(),          // Media locali dal database
                this.api.getRemoteMedia(),    // Media su CasparCG
                this.api.getTemplates()       // Template HTML locali
            ]);

            // Combina tutto
            const allMedia = [
                ...casparMedia.map(m => ({...m, location: 'caspar'})),
                ...templates.map(t => ({...t, location: 'template'})),
                ...localMedia.map(m => ({...m, location: 'local'}))
            ];

            const content = this.ui.renderMediaBrowser(allMedia);
            this.ui.showModal(content, 'Seleziona Media');
        } catch (error) {
            console.error('Media browser error:', error);
            this.ui.showNotification('Errore caricamento media', 'error');
        }
    }

    insertMediaFile(filename, type, location) {
        const scriptField = document.getElementById('story-script');
        if (!scriptField) return;

        let command = '';

        // Gestisci in base al tipo e alla posizione
        if (location === 'template' || type === 'template') {
            // Template grafico
            const duration = prompt('Durata della grafica in secondi:', '5');
            if (duration) {
                command = `((GFX ON - "${filename}" - 00:${duration.padStart(2, '0')}))\n((GFX OFF))`;
            }
        } else if (type === 'movie' || type === 'video' || filename.match(/\.(mp4|mov|avi|mkv)$/i)) {
            // Video file
            const duration = prompt('Durata del video in secondi:', '10');
            if (duration) {
                command = `((TAKE VTR - "${filename}" - 00:${duration.padStart(2, '0')}))`;
            }
        } else if (type === 'audio' || filename.match(/\.(mp3|wav|aiff|flac)$/i)) {
            // Audio file
            const duration = prompt('Durata audio in secondi:', '5');
            if (duration) {
                command = `((AUDIO - "${filename}" - 00:${duration.padStart(2, '0')}))`;
            }
        } else if (type === 'still' || type === 'image' || filename.match(/\.(png|jpg|jpeg|gif)$/i)) {
            // Image file
            const duration = prompt('Durata immagine in secondi:', '5');
            if (duration) {
                command = `((GFX ON - "${filename}" - 00:${duration.padStart(2, '0')}))\n((GFX OFF))`;
            }
        } else {
            // Tipo sconosciuto - chiedi all'utente
            const cmdType = prompt('Tipo di comando (VTR/GFX/AUDIO):', 'VTR');
            const duration = prompt('Durata in secondi:', '5');
            if (cmdType && duration) {
                if (cmdType.toUpperCase() === 'VTR') {
                    command = `((TAKE VTR - "${filename}" - 00:${duration.padStart(2, '0')}))`;
                } else if (cmdType.toUpperCase() === 'GFX') {
                    command = `((GFX ON - "${filename}" - 00:${duration.padStart(2, '0')}))\n((GFX OFF))`;
                } else if (cmdType.toUpperCase() === 'AUDIO') {
                    command = `((AUDIO - "${filename}" - 00:${duration.padStart(2, '0')}))`;
                }
            }
        }

        if (command) {
            // Inserisci il comando nella posizione del cursore
            const start = scriptField.selectionStart;
            const end = scriptField.selectionEnd;
            const text = scriptField.value;

            scriptField.value = text.substring(0, start) + '\n' + command + '\n' + text.substring(end);
            scriptField.selectionStart = scriptField.selectionEnd = start + command.length + 2;
            scriptField.focus();

            // Chiudi il modal
            this.ui.closeModal();
            this.ui.showNotification(`Inserito: ${filename}`, 'success');
        }
    }

    switchMediaTab(tabName) {
        // Cambia tab attivo
        document.querySelectorAll('.media-tabs .tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Mostra/nascondi liste
        document.querySelectorAll('.media-list').forEach(list => {
            const isActive = list.dataset.tab === tabName;
            list.style.display = isActive ? 'block' : 'none';
        });
    }

    async deleteFromCaspar(filename, displayName) {
        const confirmMsg = displayName && displayName !== filename ?
            `Eliminare "${displayName}" (${filename}) da CasparCG?\n\nQuesta azione è irreversibile!` :
            `Eliminare "${filename}" da CasparCG?\n\nQuesta azione è irreversibile!`;

        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            await this.api.deleteFromCaspar(filename);
            this.ui.showNotification(`File eliminato da CasparCG: ${displayName || filename}`, 'success');

            // Ricarica il media browser
            this.ui.closeModal();
            setTimeout(() => this.showMediaBrowser(), 500);
        } catch (error) {
            console.error('Delete error:', error);
            this.ui.showNotification('Errore durante l\'eliminazione del file', 'error');
        }
    }

    // Rundown Management Methods
    showCreateRundownDialog() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];

        const content = `
            <form id="create-rundown-form">
                <div class="form-group">
                    <label>Nome Rundown</label>
                    <input type="text" name="name" class="form-input" placeholder="es. TG Serale" required>
                </div>
                <div class="form-group">
                    <label>Nome Show</label>
                    <input type="text" name="show_name" class="form-input" value="TG delle 20:00" required>
                </div>
                <div class="form-group">
                    <label>Data Messa in Onda</label>
                    <input type="date" name="air_date" class="form-input" value="${dateStr}" required>
                </div>
                <div class="form-group">
                    <label>Ora Messa in Onda</label>
                    <input type="time" name="air_time" class="form-input" value="20:00" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Crea Rundown</button>
                    <button type="button" class="btn btn-secondary" onclick="window.ui.closeModal()">Annulla</button>
                </div>
            </form>
        `;

        this.ui.showModal(content, 'Nuovo Rundown');

        document.getElementById('create-rundown-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const rundownData = {
                name: formData.get('name') || `TG - ${formData.get('air_date')}`,
                show_name: formData.get('show_name'),
                air_date: formData.get('air_date'),
                air_time: formData.get('air_time') + ':00'
            };

            try {
                const newRundown = await this.api.createRundown(rundownData);
                this.ui.showNotification('Rundown creato con successo', 'success');
                this.currentRundown = newRundown.rundown;
                this.ui.closeModal();
                await this.loadRundown();
            } catch (error) {
                this.ui.showNotification('Errore creazione rundown', 'error');
            }
        });
    }

    showEditRundownDialog(rundown) {
        const content = `
            <form id="edit-rundown-form">
                <div class="form-group">
                    <label>Nome Rundown</label>
                    <input type="text" name="name" class="form-input" value="${rundown.name}" required>
                </div>
                <div class="form-group">
                    <label>Nome Show</label>
                    <input type="text" name="show_name" class="form-input" value="${rundown.show_name}" required>
                </div>
                <div class="form-group">
                    <label>Data Messa in Onda</label>
                    <input type="date" name="air_date" class="form-input" value="${rundown.air_date}" required>
                </div>
                <div class="form-group">
                    <label>Ora Messa in Onda</label>
                    <input type="time" name="air_time" class="form-input" value="${rundown.air_time.substring(0, 5)}" required>
                </div>
                <div class="form-group">
                    <label>Stato</label>
                    <select name="status" class="form-input">
                        <option value="preparation" ${rundown.status === 'preparation' ? 'selected' : ''}>In Preparazione</option>
                        <option value="ready" ${rundown.status === 'ready' ? 'selected' : ''}>Pronto</option>
                        <option value="on_air" ${rundown.status === 'on_air' ? 'selected' : ''}>In Onda</option>
                        <option value="completed" ${rundown.status === 'completed' ? 'selected' : ''}>Completato</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Salva Modifiche</button>
                    <button type="button" class="btn btn-secondary" onclick="window.ui.closeModal()">Annulla</button>
                </div>
            </form>
        `;

        this.ui.showModal(content, 'Modifica Rundown');

        document.getElementById('edit-rundown-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const updates = {
                name: formData.get('name'),
                show_name: formData.get('show_name'),
                air_date: formData.get('air_date'),
                air_time: formData.get('air_time') + ':00',
                status: formData.get('status')
            };

            try {
                const updated = await this.api.updateRundown(rundown.id, updates);
                this.ui.showNotification('Rundown aggiornato', 'success');
                this.currentRundown = updated.rundown;
                this.ui.closeModal();
                await this.loadRundown();
            } catch (error) {
                this.ui.showNotification('Errore aggiornamento rundown', 'error');
            }
        });
    }

    async deleteRundown(rundownId) {
        if (!confirm('Eliminare questo rundown? Tutte le storie associate verranno rimosse dal rundown.')) {
            return;
        }

        try {
            await this.api.deleteRundown(rundownId);
            this.ui.showNotification('Rundown eliminato', 'success');
            this.currentRundown = null;
            await this.loadRundown();
        } catch (error) {
            this.ui.showNotification('Errore eliminazione rundown', 'error');
        }
    }

    insertMedia(type) {
        const scriptField = document.getElementById('story-script');
        if (!scriptField) return;

        let command = '';

        if (type === 'VTR') {
            const filename = prompt('Nome del file video:', 'video.mp4');
            const duration = prompt('Durata in secondi:', '10');
            if (filename && duration) {
                command = `((TAKE VTR - "${filename}" - 00:${duration.padStart(2, '0')}))`;
            }
        } else if (type === 'GFX') {
            // Inserisci grafica lower third con timing corretto
            command = `((GFX ON - "lower-third.html" - 00:03))\n((GFX OFF))`;
        }

        if (command) {
            // Inserisci alla posizione del cursore
            const start = scriptField.selectionStart;
            const end = scriptField.selectionEnd;
            const text = scriptField.value;

            scriptField.value = text.substring(0, start) + '\n' + command + '\n' + text.substring(end);
            scriptField.selectionStart = scriptField.selectionEnd = start + command.length + 2;
            scriptField.focus();
        }
    }
}

// Initialize on DOM ready
// NOTE: NewsroomApp is deprecated - using iNEWSApp from inews-integrated.js instead
// document.addEventListener('DOMContentLoaded', () => {
//     window.app = new NewsroomApp();
//     app.init();
// });