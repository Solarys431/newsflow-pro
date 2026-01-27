/**
 * NewsFlow Pro 2025 - Integrated Application
 * Complete integration of all operational features with new GUI
 */

class NewsFlowApp {
    constructor() {
        this.api = new API();
        this.ws = new WebSocketClient();

        // State management
        this.currentRundown = null;
        this.currentStory = null;
        this.selectedItem = null;
        this.stories = [];
        this.rundownItems = [];
        this.mediaAssets = [];
        this.textItems = []; // Text voiceover items for timeline

        // Timeline Builder
        this.timelineBuilder = null;
        this.currentMode = 'text'; // 'text' or 'timeline'

        // Expose globally
        window.app = this;
    }

    async init() {
        console.log('🚀 Starting NewsFlow Pro 2025 - Integrated System');

        try {
            // Initialize timers
            this.startTimers();

            // Check health
            await this.checkHealth();

            // Connect WebSocket
            this.setupWebSocket();

            // Load data from database
            await this.loadInitialData();

            // Setup event handlers
            this.setupEventHandlers();

            // Render initial UI
            this.renderRundownTable();

            console.log('✅ NewsFlow Pro ready!');
        } catch (error) {
            console.error('Init error:', error);
            this.showNotification('Errore inizializzazione. Modalità offline attiva.', 'warning');
        }
    }

    /**
     * TIMERS
     */
    startTimers() {
        // ON AIR Timer
        let onAirSeconds = 0;
        const onAirTimer = document.getElementById('on-air-timer');
        if (onAirTimer) {
            setInterval(() => {
                onAirSeconds++;
                const h = Math.floor(onAirSeconds / 3600);
                const m = Math.floor((onAirSeconds % 3600) / 60);
                const s = onAirSeconds % 60;
                onAirTimer.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

    /**
     * HEALTH CHECK
     */
    async checkHealth() {
        try {
            const health = await this.api.getHealth();
            console.log('System health:', health);

            // Update CasparCG status in status bar
            const casparDot = document.getElementById('caspar-dot');
            const casparStatus = document.getElementById('caspar-status');
            if (casparDot && casparStatus) {
                if (health.services.caspar === 'connected') {
                    casparDot.classList.add('connected');
                    casparStatus.textContent = 'Connected';
                } else {
                    casparDot.classList.remove('connected');
                    casparStatus.textContent = 'Disconnected';
                }
            }

            // Update Database status
            const dbStatus = document.getElementById('db-status');
            if (dbStatus) {
                dbStatus.textContent = health.services.caspar === 'connected' ? 'Connected' : 'Disconnected';
            }

            // Update device status in preview panel
            const statusCaspar = document.getElementById('status-caspar');
            if (statusCaspar) {
                if (health.services.caspar === 'connected') {
                    statusCaspar.classList.add('connected');
                    statusCaspar.classList.remove('error');
                } else {
                    statusCaspar.classList.remove('connected');
                    statusCaspar.classList.add('error');
                }
            }

            // Update Graphics status based on CasparCG
            const statusGraphics = document.getElementById('status-graphics');
            if (statusGraphics && health.services.caspar === 'connected') {
                statusGraphics.classList.add('connected');
            }

        } catch (error) {
            console.warn('Health check failed, continuing in offline mode');
        }
    }

    /**
     * WEBSOCKET SETUP
     */
    setupWebSocket() {
        this.ws.connect();

        this.ws.on('story_created', () => {
            this.loadStories();
            this.showNotification('Nuova storia creata', 'success');
        });

        this.ws.on('story_updated', () => {
            this.loadStories();
        });

        this.ws.on('story_sent_to_rundown', () => {
            this.loadRundownData();
            this.showNotification('Storia aggiunta al rundown', 'success');
        });

        this.ws.on('automation_executed', (data) => {
            this.showNotification(`Automazione completata: ${data.success}/${data.commands} comandi`, 'success');
        });

        this.ws.on('upload_progress', (data) => {
            console.log('Upload progress:', data);
        });

        this.ws.on('media_uploaded_to_caspar', () => {
            this.loadMediaAssets();
            this.showNotification('Media caricato su CasparCG', 'success');
        });
    }

    /**
     * LOAD INITIAL DATA FROM DATABASE
     */
    async loadInitialData() {
        try {
            // Load all rundowns and populate dropdown
            await this.loadRundowns();

            // Load current rundown
            this.currentRundown = await this.api.getCurrentRundown();
            console.log('Current rundown:', this.currentRundown);

            // Select current rundown in dropdown
            if (this.currentRundown) {
                const selector = document.getElementById('show-selector');
                if (selector) {
                    selector.value = this.currentRundown.id;
                }
            }

            // Load rundown items
            await this.loadRundownData();

            // Load stories
            await this.loadStories();

            // Load media
            await this.loadMediaAssets();

        } catch (error) {
            console.warn('Could not load data from database, using mock data');
            this.useMockData();
        }
    }

    async loadRundowns() {
        try {
            const rundowns = await this.api.getRundowns();

            const selector = document.getElementById('show-selector');
            if (selector && rundowns.length > 0) {
                selector.innerHTML = rundowns.map(r => {
                    const label = `${r.show_name || r.name} - ${r.air_date || ''}`;
                    return `<option value="${r.id}">${label}</option>`;
                }).join('');
            }
        } catch (error) {
            console.error('Error loading rundowns:', error);
        }
    }

    async switchRundown(rundownId) {
        try {
            const response = await fetch(`${Config.api.baseUrl}/rundown/${rundownId}`);
            const data = await response.json();

            // The API returns the rundown directly, make sure it has an id
            this.currentRundown = data;

            // If the API returns just the rundown without id, use rundownId
            if (!this.currentRundown.id) {
                this.currentRundown.id = rundownId;
            }

            await this.loadRundownData();
            this.showNotification(`Caricato: ${this.currentRundown.name}`, 'success');
        } catch (error) {
            console.error('Error switching rundown:', error);
            this.showNotification('Errore caricamento rundown', 'error');
        }
    }

    async loadRundownData() {
        if (!this.currentRundown) return;

        try {
            const items = await this.api.getRundownItems(this.currentRundown.id);
            this.rundownItems = items;

            // Render table with real data
            this.renderRundownTable();

            // Update stats
            this.updateRundownStats();
        } catch (error) {
            console.error('Error loading rundown items:', error);
        }
    }

    async loadStories() {
        try {
            this.stories = await this.api.getStories();
            console.log('Loaded stories:', this.stories.length);
        } catch (error) {
            console.error('Error loading stories:', error);
        }
    }

    async loadMediaAssets() {
        try {
            this.mediaAssets = await this.api.getMedia();
            this.renderMediaPanel();

            // Re-setup drag and drop for timeline after media loaded
            if (this.timelineBuilder) {
                this.timelineBuilder.setupMediaLibraryDragDrop();
            }
        } catch (error) {
            console.error('Error loading media:', error);
        }
    }

    useMockData() {
        this.rundownItems = [
            { id: 1, position: 1, story: { type: 'GFX', slug: 'SIGLA APERTURA' }, estimated_duration: '0:15' },
            { id: 2, position: 2, story: { type: 'RDR', slug: 'HEADLINES' }, estimated_duration: '0:30' },
            { id: 3, position: 3, story: { type: 'LIVE', slug: 'TERREMOTO MILANO' }, estimated_duration: '2:30' }
        ];
        this.renderRundownTable();
    }

    /**
     * RUNDOWN TABLE RENDERING
     */
    renderRundownTable() {
        const tbody = document.getElementById('rundown-items');
        if (!tbody) return;

        if (this.rundownItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">Nessun item nel rundown</td></tr>';
            return;
        }

        let backTime = 0;
        const rows = this.rundownItems.map((item, index) => {
            // Database returns 'stories' (plural) from relation
            const story = item.stories || item.story || {};
            const type = story.type || 'RDR';
            const slug = story.slug || story.title || item.slug || 'Untitled';
            const duration = item.estimated_duration || '0:00';

            // Calculate back time
            const durationSec = this.parseDuration(duration);
            backTime += durationSec;
            const back = this.formatDuration(backTime);

            // Media icons (mock for now, should come from automation_commands)
            const mediaIcons = this.getMediaIconsForType(type);

            return `
                <tr data-item-id="${item.id}">
                    <td><strong>${item.position || index + 1}</strong></td>
                    <td><span class="type-badge ${type.toLowerCase()}">${type}</span></td>
                    <td onclick="app.selectRundownItem('${item.id}')" style="cursor: pointer;"><strong>${slug}</strong></td>
                    <td><div class="media-icons">${mediaIcons}</div></td>
                    <td>${duration}</td>
                    <td>${back}</td>
                    <td style="text-align: center;">
                        <button class="btn-play-inline" onclick="app.executeRundownItem('${item.id}'); event.stopPropagation();" title="Play">
                            <i class="fas fa-play"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;

        // Update stats
        document.getElementById('total-duration').textContent = this.formatDuration(backTime);
        document.getElementById('items-count').textContent = this.rundownItems.length;
    }

    getMediaIconsForType(type) {
        // Map type to typical media icons
        const iconMap = {
            'GFX': '<span class="media-icon video">V</span><span class="media-icon audio">A</span>',
            'LIVE': '<span class="media-icon graphic">G</span><span class="media-icon video">V</span>',
            'VO': '<span class="media-icon video">V</span><span class="media-icon video">V</span>',
            'SOT': '<span class="media-icon video">V</span><span class="media-icon audio">A</span>',
            'PKG': '<span class="media-icon video">V</span><span class="media-icon graphic">I</span>',
            'RDR': '',
            'BRK': ''
        };
        return iconMap[type] || '';
    }

    parseDuration(duration) {
        if (!duration) return 0;

        // If duration is already a number, return it
        if (typeof duration === 'number') return duration;

        // If duration is a string, parse it
        if (typeof duration === 'string') {
            const parts = duration.split(':');
            if (parts.length === 2) {
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            } else if (parts.length === 3) {
                return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            }
        }

        return 0;
    }

    formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    updateRundownStats() {
        // Stats are updated in renderRundownTable
    }

    /**
     * SELECT RUNDOWN ITEM
     */
    async selectRundownItem(itemId) {
        // Remove previous selection
        document.querySelectorAll('.rundown-table tr').forEach(row => {
            row.classList.remove('selected');
        });

        // Add selection
        const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
        if (row) {
            row.classList.add('selected');
        }

        // Find item
        this.selectedItem = this.rundownItems.find(i => i.id === itemId);

        if (this.selectedItem && this.selectedItem.story_id) {
            // Load full story data
            try {
                this.currentStory = await this.api.getStory(this.selectedItem.story_id);
                this.displayStory(this.currentStory);
            } catch (error) {
                console.error('Error loading story:', error);
                this.displayItemBasicInfo(this.selectedItem);
            }
        } else {
            this.displayItemBasicInfo(this.selectedItem);
        }
    }

    displayStory(story) {
        // Update story header in info bar
        document.getElementById('story-title').textContent = story.slug || story.title;

        // Update type badge
        const typeBadge = document.getElementById('story-type');
        if (typeBadge && story.type) {
            typeBadge.className = `story-type-badge ${story.type.toLowerCase()}`;
            typeBadge.textContent = story.type;
        }

        // Update duration
        const durationEl = document.getElementById('story-duration');
        if (durationEl && this.selectedItem) {
            durationEl.textContent = this.selectedItem.estimated_duration || '0:00';
        }

        // Update writer
        const writerEl = document.getElementById('story-writer');
        if (writerEl) {
            writerEl.textContent = story.presenter || '-';
        }

        // Parse metadata
        let metadata = {};
        try {
            metadata = typeof story.metadata === 'string'
                ? JSON.parse(story.metadata)
                : story.metadata || {};
        } catch (e) {
            console.warn('[DISPLAY] Invalid metadata:', e);
        }

        // Update currentStory with parsed metadata
        if (this.currentStory && this.currentStory.id === story.id) {
            this.currentStory.metadata = metadata;
        }

        const format = metadata.format || 'text';

        // Display script content
        this.displayScriptContent(story);

        // If timeline format, load timeline and switch mode
        if (format === 'timeline' && this.timelineBuilder && metadata.timeline) {
            console.log('[DISPLAY] Loading timeline with', metadata.timeline.items?.length || 0, 'items');

            // Clear existing timeline (silent mode - no confirm dialog)
            this.timelineBuilder.clearTimeline(true);

            // Load timeline items
            if (metadata.timeline.items && metadata.timeline.items.length > 0) {
                metadata.timeline.items.forEach(itemData => {
                    this.timelineBuilder.addTimelineItem(itemData);
                });
            }

            // Load sidebar text items
            if (metadata.textItems && metadata.textItems.length > 0) {
                this.textItems = metadata.textItems;
                this.renderTextItems();
                console.log('[DISPLAY] Loaded', this.textItems.length, 'text items from sidebar');
            } else {
                this.textItems = [];
                this.renderTextItems();
            }

            // Switch to timeline mode
            setTimeout(() => {
                this.switchMode('timeline');
            }, 100);
        } else {
            // Text format - switch to text mode
            setTimeout(() => {
                this.switchMode('text');
            }, 100);
        }
    }

    displayItemBasicInfo(item) {
        const story = item.story || {};
        document.getElementById('story-title').textContent = story.slug || 'Untitled';

        const typeBadge = document.getElementById('story-type');
        if (typeBadge && story.type) {
            typeBadge.className = `story-type-badge ${story.type.toLowerCase()}`;
            typeBadge.textContent = story.type;
        }

        const writerEl = document.getElementById('story-writer');
        if (writerEl) writerEl.textContent = '-';

        // Show empty state
        const scriptContainer = document.getElementById('script-sections');
        if (scriptContainer) {
            scriptContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>No script available for this item</p>
                </div>
            `;
        }
    }

    displayScriptContent(story) {
        const scriptContainer = document.getElementById('script-sections');
        if (!scriptContainer) return;

        if (!story.script && !story.id) {
            scriptContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>No script content</p>
                </div>
            `;
            return;
        }

        // Show editable form
        scriptContainer.innerHTML = `
            <div class="story-edit-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Slug</label>
                        <input type="text" id="edit-slug" value="${story.slug || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="edit-title" value="${story.title || ''}" class="form-input">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Type</label>
                        <select id="edit-type" class="form-input">
                            <option value="PKG" ${story.type === 'PKG' ? 'selected' : ''}>PKG</option>
                            <option value="VO" ${story.type === 'VO' ? 'selected' : ''}>VO</option>
                            <option value="SOT" ${story.type === 'SOT' ? 'selected' : ''}>SOT</option>
                            <option value="LIVE" ${story.type === 'LIVE' ? 'selected' : ''}>LIVE</option>
                            <option value="RDR" ${story.type === 'RDR' ? 'selected' : ''}>RDR</option>
                            <option value="GFX" ${story.type === 'GFX' ? 'selected' : ''}>GFX</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Presenter</label>
                        <input type="text" id="edit-presenter" value="${story.presenter || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Producer</label>
                        <input type="text" id="edit-producer" value="${story.producer || ''}" class="form-input">
                    </div>
                </div>
                <div class="form-group">
                    <label>Script</label>
                    <textarea id="edit-script" class="form-textarea" rows="20">${story.script || ''}</textarea>
                </div>
            </div>
        `;

        // Add event listeners to sync changes
        ['slug', 'title', 'type', 'presenter', 'producer', 'script'].forEach(field => {
            const input = document.getElementById(`edit-${field}`);
            if (input) {
                input.addEventListener('input', (e) => {
                    if (this.currentStory) {
                        this.currentStory[field] = e.target.value;
                    }
                });
            }
        });
    }

    parseScriptIntoSections(script) {
        // Split script into sections based on automation commands and paragraph breaks
        const sections = [];
        const lines = script.split('\n');
        let currentSection = {
            header: 'SCRIPT',
            type: null,
            content: ''
        };

        lines.forEach(line => {
            const trimmed = line.trim();

            // Check for automation commands
            if (trimmed.startsWith('((')) {
                // If we have accumulated content, save it as a section
                if (currentSection.content.trim()) {
                    sections.push({...currentSection});
                }

                // Parse automation command
                const match = trimmed.match(/\(\((.*?)\)\)/);
                if (match) {
                    const cmd = match[1].trim();
                    if (cmd.includes('TAKE VTR') || cmd.includes('VO')) {
                        currentSection = {
                            header: cmd,
                            type: 'vo',
                            content: ''
                        };
                    } else if (cmd.includes('GFX')) {
                        currentSection = {
                            header: cmd,
                            type: 'gfx',
                            content: ''
                        };
                    } else if (cmd.includes('SOT') || cmd.includes('AUDIO')) {
                        currentSection = {
                            header: cmd,
                            type: 'sot',
                            content: ''
                        };
                    } else if (cmd.includes('LIVE')) {
                        currentSection = {
                            header: cmd,
                            type: 'live',
                            content: ''
                        };
                    } else {
                        currentSection = {
                            header: cmd,
                            type: null,
                            content: ''
                        };
                    }
                }
            } else if (trimmed) {
                // Regular script line
                if (currentSection.content) {
                    currentSection.content += '\n';
                }
                currentSection.content += line;
            }
        });

        // Add last section
        if (currentSection.content.trim()) {
            sections.push(currentSection);
        }

        // If no sections were created, return the whole script as one section
        if (sections.length === 0) {
            sections.push({
                header: 'SCRIPT',
                type: null,
                content: script
            });
        }

        return sections;
    }

    /**
     * MEDIA PANEL
     */
    renderMediaPanel() {
        // Video Clips
        const videoClips = this.mediaAssets.filter(m => m.file_type === 'video');
        this.renderMediaSection('video-clips', videoClips, 'video');

        // Audio/SOT
        const audioClips = this.mediaAssets.filter(m => m.file_type === 'audio');
        this.renderMediaSection('audio-clips', audioClips, 'audio');

        // Graphics - load templates separately
        this.loadGraphics();
    }

    renderMediaSection(containerId, assets, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (assets.length === 0) {
            container.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Nessun media disponibile</div>';
            return;
        }

        container.innerHTML = assets.map(asset => {
            // Format duration from seconds to M:SS
            const durationText = asset.duration ? this.formatDuration(asset.duration) : '0:00';

            return `
                <div class="media-item" data-asset-id="${asset.id}" onclick="app.selectMediaItem('${asset.id}')" style="cursor: pointer;">
                    <button class="btn-delete" onclick="app.deleteMedia('${asset.id}', '${asset.filename}'); event.stopPropagation();" title="Elimina">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="media-icon ${type}">${type.toUpperCase()}</div>
                    <div class="media-info">
                        <div class="media-name">${asset.original_filename || asset.filename}</div>
                        <div class="media-specs">${this.getMediaSpecs(asset)}</div>
                        <div class="media-duration">${durationText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectMediaItem(assetId) {
        // Remove previous selection
        document.querySelectorAll('.media-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection
        const item = document.querySelector(`.media-item[data-asset-id="${assetId}"]`);
        if (item) {
            item.classList.add('selected');
        }

        // Find asset
        this.selectedMedia = this.mediaAssets.find(a => a.id === assetId);
        // Popup rimosso - feedback visivo già presente tramite classe 'selected'

        // Show preview
        this.showMediaPreview(this.selectedMedia);
    }

    async loadGraphics() {
        try {
            console.log('[DEBUG] loadGraphics() called');
            const result = await this.api.getTemplates();
            console.log('[DEBUG] API response:', result);
            console.log('[DEBUG] Is array?', Array.isArray(result));
            console.log('[DEBUG] Result type:', typeof result);

            // Ensure we have an array
            const templates = Array.isArray(result) ? result : (result?.files || []);
            console.log('[DEBUG] Final templates array:', templates);
            console.log('Loading graphics, found:', templates.length, templates);

            const container = document.getElementById('graphics');
            console.log('Graphics container:', container);

            if (!container) {
                console.error('Graphics container not found!');
                return;
            }

            if (!templates || templates.length === 0) {
                container.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Nessuna grafica disponibile</div>';
                return;
            }

            container.innerHTML = templates.map(template => `
                <div class="media-item" onclick="app.selectGraphic('${template.filename}')" style="cursor: pointer;">
                    <button class="btn-delete" onclick="app.deleteGraphic('${template.name}'); event.stopPropagation();" title="Elimina">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="media-icon gfx">GFX</div>
                    <div class="media-info">
                        <div class="media-name">${template.name}</div>
                        <div class="media-specs">Template • CasparCG</div>
                        <div class="media-duration">-</div>
                    </div>
                </div>
            `).join('');

            console.log('Graphics rendered:', container.children.length);

            // Re-setup drag and drop for timeline after graphics loaded
            if (this.timelineBuilder) {
                this.timelineBuilder.setupMediaLibraryDragDrop();
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    getMediaSpecs(asset) {
        if (asset.file_type === 'video') {
            return '1920×1080 • 25fps • H.264';
        } else if (asset.file_type === 'audio') {
            return '48kHz • Stereo • WAV';
        }
        return 'Media file';
    }

    selectGraphic(templateName) {
        document.querySelectorAll('.media-item').forEach(item => {
            item.classList.remove('selected');
        });

        event.target.closest('.media-item')?.classList.add('selected');
        this.selectedGraphic = templateName;
        // Popup rimosso - feedback visivo già presente tramite classe 'selected'

        // Show preview
        this.showGraphicPreview(templateName);
    }

    showMediaPreview(asset) {
        const previewVideo = document.getElementById('preview-video');
        const previewGraphic = document.getElementById('preview-graphic');
        const previewPlaceholder = document.querySelector('.preview-placeholder');
        const previewInfo = document.getElementById('preview-info');
        const previewDuration = document.getElementById('preview-duration');
        const playerControls = document.getElementById('video-player-controls');

        // Hide all previews first
        previewVideo.style.display = 'none';
        previewGraphic.style.display = 'none';
        previewPlaceholder.style.display = 'none';
        previewInfo.style.display = 'none';
        playerControls.style.display = 'none';

        // IMPORTANTE: Rimuovi tutti gli event handler per evitare errori spurii
        previewVideo.onerror = null;
        previewVideo.onloadedmetadata = null;
        previewGraphic.onerror = null;
        previewGraphic.onload = null;

        if (!asset) {
            previewPlaceholder.style.display = 'flex';
            previewDuration.textContent = '--:--';
            return;
        }

        if (asset.file_type === 'video') {
            console.log('[PREVIEW] Loading video:', asset.filename);

            // Use streaming endpoint that handles both local and remote (CasparCG) files
            const videoUrl = `${Config.api.baseUrl}/media/stream/${asset.filename}`;
            previewVideo.src = videoUrl;
            previewVideo.style.display = 'block';
            previewInfo.style.display = 'grid';
            playerControls.style.display = 'flex';

            // Update info
            document.getElementById('preview-name').textContent = asset.original_filename || asset.filename;
            document.getElementById('preview-type').textContent = 'Video';
            document.getElementById('preview-resolution').textContent = asset.resolution || '1920×1080';

            // Get duration when metadata loads
            previewVideo.onloadedmetadata = () => {
                const duration = previewVideo.duration;
                const mins = Math.floor(duration / 60);
                const secs = Math.floor(duration % 60);
                previewDuration.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                // Update player time display
                document.getElementById('player-time').textContent = `0:00 / ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                console.log('[PREVIEW] Video loaded, duration:', duration);
            };

            // Handle video loading errors
            previewVideo.onerror = () => {
                console.error('[PREVIEW] Video load error');
                // Popup rimosso - messaggio visivo nel preview è sufficiente
                previewPlaceholder.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444;"></i>
                    <p style="margin-top: 16px;">Video non disponibile</p>
                `;
                previewPlaceholder.style.display = 'flex';
                previewVideo.style.display = 'none';
                playerControls.style.display = 'none';
            };

        } else if (asset.file_type === 'audio') {
            console.log('[PREVIEW] Loading audio:', asset.filename);

            // Use streaming endpoint that handles both local and remote (CasparCG) files
            const audioUrl = `${Config.api.baseUrl}/media/stream/${asset.filename}`;
            previewVideo.src = audioUrl;
            previewInfo.style.display = 'grid';
            playerControls.style.display = 'flex';

            // Show audio placeholder with waveform icon
            previewPlaceholder.innerHTML = `
                <i class="fas fa-music" style="font-size: 64px;"></i>
                <p style="margin-top: 16px;">${asset.original_filename || asset.filename}</p>
            `;
            previewPlaceholder.style.display = 'flex';

            document.getElementById('preview-name').textContent = asset.original_filename || asset.filename;
            document.getElementById('preview-type').textContent = 'Audio';
            document.getElementById('preview-resolution').textContent = '48kHz Stereo';

            // Get duration when metadata loads
            previewVideo.onloadedmetadata = () => {
                const duration = previewVideo.duration;
                const mins = Math.floor(duration / 60);
                const secs = Math.floor(duration % 60);
                previewDuration.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                document.getElementById('player-time').textContent = `0:00 / ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            };
        }
    }

    async getMediaDuration(filename) {
        try {
            // Try to get duration from CasparCG CLS command
            const response = await fetch(`${Config.api.baseUrl}/caspar/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: `CLS`
                })
            });

            if (response.ok) {
                const data = await response.json();
                // Parse CLS response to extract duration for this file
                // CLS returns: "200 CLS OK\r\n202 CLS OK\r\n..."
                // We would need to parse this, but for now return null
                // TODO: Implement proper CLS parsing
            }
        } catch (error) {
            console.warn('Could not get duration from CasparCG:', error);
        }
        return null;
    }

    showGraphicPreview(templateName) {
        const previewVideo = document.getElementById('preview-video');
        const previewGraphic = document.getElementById('preview-graphic');
        const previewPlaceholder = document.querySelector('.preview-placeholder');
        const previewInfo = document.getElementById('preview-info');
        const previewDuration = document.getElementById('preview-duration');
        const playerControls = document.getElementById('video-player-controls');

        console.log('[PREVIEW] Loading graphic:', templateName);

        // Hide all previews first
        previewVideo.style.display = 'none';

        // IMPORTANTE: Rimuovi error handler PRIMA di svuotare src
        // altrimenti il video.onerror viene triggerato e mostra il triangolo rosso
        previewVideo.onerror = null;
        previewVideo.onloadedmetadata = null;
        previewVideo.src = '';

        previewPlaceholder.style.display = 'none';

        // IMPORTANTE: Nascondi i controlli video quando mostri una grafica
        // I controlli play/pause/stop hanno senso solo per video/audio
        playerControls.style.display = 'none';

        // Show graphic preview in iframe
        // Add autoshow parameter to trigger template display
        const templateUrl = `${Config.server.templateBaseUrl}/template/${templateName}?autoshow=1`;
        console.log('[PREVIEW] Template URL:', templateUrl);

        // Force reload iframe
        previewGraphic.src = '';
        setTimeout(() => {
            previewGraphic.src = templateUrl;
            previewGraphic.style.display = 'block';

            // Calculate scale factor for 1920x1080 content
            const scaleIframe = () => {
                const container = previewGraphic.parentElement;
                const scaleX = container.clientWidth / 1920;
                const scaleY = container.clientHeight / 1080;
                const scale = Math.min(scaleX, scaleY);

                // Center the scaled content
                const translateX = (container.clientWidth - 1920 * scale) / 2;
                const translateY = (container.clientHeight - 1080 * scale) / 2;

                previewGraphic.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                console.log('[PREVIEW] Scaled template:', { scale, translateX, translateY });
            };

            // Scale on load and auto-show via URL parameter
            previewGraphic.onload = () => {
                console.log('[PREVIEW] Template loaded successfully with autoshow');
                scaleIframe();
            };

            // Scale on window resize
            window.removeEventListener('resize', this._scaleHandler);
            this._scaleHandler = scaleIframe;
            window.addEventListener('resize', this._scaleHandler);
        }, 50);

        previewInfo.style.display = 'grid';

        // Update info
        document.getElementById('preview-name').textContent = templateName;
        document.getElementById('preview-type').textContent = 'HTML Template';
        document.getElementById('preview-resolution').textContent = '1920×1080';
        previewDuration.textContent = 'Template';

        // Error handler
        previewGraphic.onerror = () => {
            console.error('[PREVIEW] Template load error');
            // Popup rimosso - errore loggato in console è sufficiente
            // L'iframe mostrerà automaticamente errore se template non carica
        };
    }

    async deleteMedia(assetId, filename) {
        // Find the asset to check if it's remote
        const asset = this.mediaAssets.find(a => a.id === assetId);
        const isRemote = asset && asset.metadata && asset.metadata.location === 'remote';

        const message = isRemote
            ? `⚠️ ATTENZIONE: Questo eliminerà "${filename}" sia dal database che da CasparCG!\n\nConfermi l'eliminazione?`
            : `Confermi eliminazione di "${filename}"?`;

        if (!confirm(message)) return;

        try {
            const response = await fetch(`${Config.api.baseUrl}/media/${assetId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Delete failed');

            const result = await response.json();

            if (result.deleted_from_caspar) {
                this.showNotification('✅ Media eliminato da database e CasparCG', 'success');
            } else {
                this.showNotification('Media eliminato', 'success');
            }

            await this.loadMediaAssets();
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Errore eliminazione media', 'error');
        }
    }

    async deleteGraphic(templateName) {
        if (!confirm(`Confermi eliminazione grafica "${templateName}"?`)) return;

        try {
            const response = await fetch(`${Config.api.baseUrl}/media/template/${encodeURIComponent(templateName)}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Delete failed');

            this.showNotification('Grafica eliminata', 'success');
            await this.loadGraphics();
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Errore eliminazione grafica', 'error');
        }
    }

    /**
     * TEXT ITEMS MANAGEMENT (for Timeline Text Track)
     */
    showAddTextModal(editItem = null) {
        const isEdit = editItem !== null;
        const title = isEdit ? 'Modifica Testo Voiceover' : 'Nuovo Testo Voiceover';
        const buttonLabel = isEdit ? 'Aggiorna' : 'Crea';

        const defaultText = isEdit ? editItem.text : '';
        const defaultDuration = isEdit ? editItem.duration : 5;

        const modal = document.getElementById('modal-container');
        modal.innerHTML = `
            <div class="modal-overlay" onclick="app.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); border-radius: 12px; padding: 32px; max-width: 600px; width: 90%;">
                    <h2 style="margin: 0 0 24px 0; color: var(--text-primary);">${title}</h2>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label>Testo Voiceover *</label>
                            <textarea id="text-input" class="form-textarea" placeholder="Inserisci il testo da leggere..." rows="8" style="min-height: 150px;">${defaultText}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Durata (secondi) *</label>
                            <input type="number" id="text-duration" class="form-input" value="${defaultDuration}" min="1" max="300">
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button onclick="${isEdit ? `app.updateTextItem('${editItem.id}')` : 'app.createTextItem()'}" style="flex: 1; padding: 12px; background: var(--color-success); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">${buttonLabel}</button>
                        <button onclick="app.closeModal()" style="padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer;">Annulla</button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'block';
    }

    createTextItem() {
        const textInput = document.getElementById('text-input');
        const durationInput = document.getElementById('text-duration');

        if (!textInput || !durationInput) return;

        const text = textInput.value.trim();
        const duration = parseInt(durationInput.value);

        if (!text) {
            this.showNotification('Il testo non può essere vuoto', 'warning');
            return;
        }

        if (duration < 1) {
            this.showNotification('La durata deve essere almeno 1 secondo', 'warning');
            return;
        }

        // Create text item
        const textItem = {
            id: `text-${Date.now()}`,
            type: 'text',
            text: text,
            duration: duration,
            filename: `voiceover-${Date.now()}`,
            originalFilename: text.substring(0, 30) + (text.length > 30 ? '...' : '')
        };

        this.textItems.push(textItem);
        this.renderTextItems();
        this.closeModal();
        this.showNotification('✅ Testo creato con successo', 'success');
    }

    updateTextItem(itemId) {
        const textInput = document.getElementById('text-input');
        const durationInput = document.getElementById('text-duration');

        if (!textInput || !durationInput) return;

        const text = textInput.value.trim();
        const duration = parseInt(durationInput.value);

        if (!text) {
            this.showNotification('Il testo non può essere vuoto', 'warning');
            return;
        }

        if (duration < 1) {
            this.showNotification('La durata deve essere almeno 1 secondo', 'warning');
            return;
        }

        // Find and update text item in sidebar list
        const item = this.textItems.find(t => t.id === itemId);
        if (item) {
            item.text = text;
            item.duration = duration;
            item.originalFilename = text.substring(0, 30) + (text.length > 30 ? '...' : '');
            this.renderTextItems();
        }

        // Update item in timeline if it exists there
        if (this.timelineBuilder && this.timelineBuilder.items) {
            const timelineItem = this.timelineBuilder.items.find(i => i.id === itemId);
            if (timelineItem) {
                timelineItem.text = text;
                timelineItem.duration = duration;
                timelineItem.originalFilename = text.substring(0, 30) + (text.length > 30 ? '...' : '');

                // Update DOM element
                const domElement = document.querySelector(`.timeline-item[data-id="${itemId}"]`);
                if (domElement) {
                    domElement.dataset.duration = duration;

                    // Update displayed name
                    const nameEl = domElement.querySelector('.item-name');
                    if (nameEl) nameEl.textContent = timelineItem.originalFilename;

                    // Update duration display
                    const durationEl = domElement.querySelector('.item-duration');
                    if (durationEl) durationEl.textContent = this.timelineBuilder.formatTime(duration);

                    // Recalculate width based on new duration
                    const widthPercent = (duration / this.timelineBuilder.totalDuration) * 100;
                    domElement.style.width = `${widthPercent}%`;
                }

                this.timelineBuilder.checkOverlaps();
                this.timelineBuilder.updateStats();
            }
        }

        this.closeModal();
        this.showNotification('✅ Testo aggiornato', 'success');
    }

    deleteTextItem(itemId) {
        if (!confirm('Confermi eliminazione del testo?')) return;

        this.textItems = this.textItems.filter(t => t.id !== itemId);
        this.renderTextItems();
        this.showNotification('Testo eliminato', 'success');
    }

    renderTextItems() {
        const container = document.getElementById('text-items');
        if (!container) return;

        if (this.textItems.length === 0) {
            container.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Nessun testo disponibile</div>';
            return;
        }

        container.innerHTML = this.textItems.map(item => {
            const durationText = `${item.duration}s`;

            return `
                <div class="media-item" data-text-id="${item.id}" onclick="app.selectTextItem('${item.id}')" style="cursor: pointer;">
                    <button class="btn-delete" onclick="app.deleteTextItem('${item.id}'); event.stopPropagation();" title="Elimina">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="media-icon text" style="background: var(--color-info);">TXT</div>
                    <div class="media-info">
                        <div class="media-name">${item.originalFilename}</div>
                        <div class="media-specs">${item.text.length} caratteri</div>
                        <div class="media-duration">${durationText}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Setup drag & drop for text items
        this.setupTextItemsDragDrop();
    }

    selectTextItem(itemId) {
        // Remove previous selection
        document.querySelectorAll('.media-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Add selection
        const item = document.querySelector(`.media-item[data-text-id="${itemId}"]`);
        if (item) {
            item.classList.add('selected');
        }
    }

    setupTextItemsDragDrop() {
        const textItems = document.querySelectorAll('.media-item[data-text-id]');

        textItems.forEach(item => {
            const textId = item.dataset.textId;
            const textItem = this.textItems.find(t => t.id === textId);
            if (!textItem) return;

            item.draggable = true;
            item.classList.add('draggable');

            item.addEventListener('dragstart', (e) => {
                const dragData = {
                    type: 'text',
                    filename: textItem.filename,
                    originalFilename: textItem.originalFilename,
                    duration: textItem.duration,
                    text: textItem.text,
                    textId: textItem.id
                };

                e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                e.dataTransfer.effectAllowed = 'copy';
                item.style.opacity = '0.5';
            });

            item.addEventListener('dragend', (e) => {
                item.style.opacity = '1';
            });

            // Double-click to edit
            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.showAddTextModal(textItem);
            });
        });
    }

    /**
     * SCRIPT EDITOR FUNCTIONS
     */
    insertMediaCommand(type) {
        if (!this.currentStory) {
            this.showNotification('Seleziona prima una storia', 'warning');
            return;
        }

        let command = '';
        if (type === 'video' && this.selectedMedia) {
            const filename = this.selectedMedia.caspar_path || this.selectedMedia.filename;
            command = `\n\n((TAKE VTR - "${filename}" - 00:08))\n\n`;
        } else if (type === 'audio' && this.selectedMedia) {
            const filename = this.selectedMedia.caspar_path || this.selectedMedia.filename;
            command = `\n\n((AUDIO SOT - "${filename}" - 00:05))\n\n`;
        } else if (type === 'graphic' && this.selectedGraphic) {
            command = `\n\n((GFX ON - "${this.selectedGraphic}" - 00:05))\n((GFX OFF))\n\n`;
        } else {
            this.showNotification('Seleziona prima un media dal pannello', 'warning');
            return;
        }

        // Append to current script
        this.currentStory.script = (this.currentStory.script || '') + command;
        this.displayStory(this.currentStory);
        this.showNotification('Comando inserito nello script', 'success');
    }

    async saveStory() {
        if (!this.currentStory || !this.currentStory.id) {
            this.showNotification('Nessuna storia da salvare', 'warning');
            return;
        }

        try {
            // Parse metadata
            let metadata = {};
            try {
                metadata = typeof this.currentStory.metadata === 'string'
                    ? JSON.parse(this.currentStory.metadata)
                    : this.currentStory.metadata || {};
            } catch (e) {
                console.warn('Invalid metadata, using empty object');
            }

            const format = metadata.format || 'text';
            let script = this.currentStory.script;

            // If timeline format, save timeline state and generate script
            if (format === 'timeline' && this.timelineBuilder) {
                // Save timeline items to metadata
                metadata.timeline = {
                    items: this.timelineBuilder.items,
                    duration: this.timelineBuilder.items.reduce((total, item) =>
                        Math.max(total, item.start + item.duration), 0
                    )
                };

                // Save sidebar text items (not yet dropped on timeline)
                metadata.textItems = this.textItems || [];

                // Auto-generate script from timeline
                script = this.timelineBuilder.generateScript();
                this.currentStory.script = script; // Update local reference

                console.log('[SAVE] Timeline items saved:', metadata.timeline.items.length);
                console.log('[SAVE] Text items saved:', metadata.textItems.length);
                console.log('[SAVE] Generated script:', script);
            }

            const response = await fetch(`${Config.api.baseUrl}/stories/${this.currentStory.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script: script,
                    slug: this.currentStory.slug,
                    title: this.currentStory.title,
                    type: this.currentStory.type,
                    presenter: this.currentStory.presenter,
                    producer: this.currentStory.producer,
                    metadata: JSON.stringify(metadata)
                })
            });

            if (!response.ok) throw new Error('Save failed');

            const formatLabel = format === 'timeline' ? '🎬 Timeline' : '📝 Text';
            this.showNotification(`✓ ${formatLabel} story saved successfully`, 'success');
        } catch (error) {
            console.error('Save error:', error);
            this.showNotification('Errore salvataggio storia', 'error');
        }
    }

    async sendStoryToRundown() {
        if (!this.currentStory || !this.currentStory.id) {
            this.showNotification('Nessuna storia selezionata', 'warning');
            return;
        }

        if (!this.currentRundown || !this.currentRundown.id) {
            this.showNotification('Nessun rundown attivo', 'warning');
            return;
        }

        try {
            const payload = { rundown_id: this.currentRundown.id };

            // Only send duration from timeline if we're CURRENTLY in timeline mode AND story has timeline data
            if (this.currentMode === 'timeline' && this.timelineBuilder && this.timelineBuilder.items.length > 0) {
                payload.estimated_duration = this.timelineBuilder.items.reduce((sum, item) => {
                    return Math.max(sum, item.start + item.duration);
                }, 0);
            }

            const response = await fetch(`${Config.api.baseUrl}/stories/${this.currentStory.id}/send-to-rundown`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Send failed');

            const result = await response.json();
            this.showNotification(`✓ Storia aggiunta al rundown: ${result.commands_created} comandi creati`, 'success');
            await this.loadRundownData();
        } catch (error) {
            console.error('Send error:', error);
            this.showNotification('Errore invio al rundown', 'error');
        }
    }

    sendStoryToRundownModal() {
        if (!this.currentStory || !this.currentStory.id) {
            this.showNotification('Nessuna storia selezionata', 'warning');
            return;
        }

        const modal = document.getElementById('modal-container');
        const rundownOptions = this.stories.length > 0 ?
            `<option value="">Select Rundown</option>` +
            Array.from(document.getElementById('show-selector').options)
                .filter(opt => opt.value)
                .map(opt => `<option value="${opt.value}">${opt.textContent}</option>`)
                .join('')
            : '<option value="">No rundowns available</option>';

        modal.innerHTML = `
            <div class="modal-overlay" onclick="app.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); border-radius: 12px; padding: 32px; max-width: 500px; width: 90%;">
                    <h2 style="margin: 0 0 24px 0; color: var(--text-primary);">Send to Rundown</h2>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-group">
                            <label>Story: <strong>${this.currentStory.slug || this.currentStory.title}</strong></label>
                        </div>
                        <div class="form-group">
                            <label>Select Target Rundown</label>
                            <select id="target-rundown" class="form-input">
                                ${rundownOptions}
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button onclick="app.sendToSelectedRundown()" style="flex: 1; padding: 12px; background: var(--color-success); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">Send to Rundown</button>
                        <button onclick="app.closeModal()" style="padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'block';
    }

    async sendToSelectedRundown() {
        const rundownId = document.getElementById('target-rundown').value;
        if (!rundownId) {
            this.showNotification('Seleziona un rundown', 'warning');
            return;
        }

        try {
            // Calculate duration from timeline if in timeline mode
            let estimatedDuration = null;
            if (this.timelineBuilder && this.timelineBuilder.items.length > 0) {
                estimatedDuration = this.timelineBuilder.items.reduce((sum, item) => {
                    return Math.max(sum, item.start + item.duration);
                }, 0);
            }

            const response = await fetch(`${Config.api.baseUrl}/stories/${this.currentStory.id}/send-to-rundown`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rundown_id: rundownId,
                    estimated_duration: estimatedDuration
                })
            });

            if (!response.ok) throw new Error('Send failed');

            const result = await response.json();
            this.closeModal();
            this.showNotification(`✓ Storia aggiunta al rundown: ${result.commands_created} comandi creati`, 'success');

            // If it's the current rundown, reload
            if (this.currentRundown && this.currentRundown.id === rundownId) {
                await this.loadRundownData();
            }
        } catch (error) {
            console.error('Send error:', error);
            this.showNotification('Errore invio al rundown', 'error');
        }
    }

    createNewRundown() {
        const modal = document.getElementById('modal-container');
        modal.innerHTML = `
            <div class="modal-overlay" onclick="app.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); border-radius: 12px; padding: 32px; max-width: 600px; width: 90%;">
                    <h2 style="margin: 0 0 24px 0; color: var(--text-primary);">New Rundown</h2>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Rundown Name *</label>
                                <input type="text" id="new-rundown-name" class="form-input" placeholder="TG SERA">
                            </div>
                            <div class="form-group">
                                <label>Show Name *</label>
                                <input type="text" id="new-show-name" class="form-input" placeholder="Telegiornale delle 20:00">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Air Date</label>
                                <input type="date" id="new-air-date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div class="form-group">
                                <label>Air Time</label>
                                <input type="time" id="new-air-time" class="form-input" value="20:00">
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button onclick="app.createRundownSubmit()" style="flex: 1; padding: 12px; background: var(--color-success); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">Create Rundown</button>
                        <button onclick="app.closeModal()" style="padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'block';
    }

    async createRundownSubmit() {
        const name = document.getElementById('new-rundown-name').value.trim();
        const showName = document.getElementById('new-show-name').value.trim();
        const airDate = document.getElementById('new-air-date').value;
        const airTime = document.getElementById('new-air-time').value;

        if (!name || !showName) {
            this.showNotification('Name and Show Name are required', 'warning');
            return;
        }

        try {
            const response = await fetch(`${Config.api.baseUrl}/rundown`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    show_name: showName,
                    air_date: airDate,
                    air_time: airTime,
                    status: 'preparation'
                })
            });

            if (!response.ok) throw new Error('Create failed');

            const result = await response.json();
            this.closeModal();
            this.showNotification('✓ Rundown created successfully', 'success');

            // Reload rundowns and switch to new one
            await this.loadRundowns();
            if (result.id) {
                await this.switchRundown(result.id);
            }
        } catch (error) {
            console.error('Create rundown error:', error);
            this.showNotification('Error creating rundown', 'error');
        }
    }

    async deleteCurrentRundown() {
        const selector = document.getElementById('show-selector');
        const rundownId = selector.value;

        if (!rundownId) {
            this.showNotification('⚠️ Seleziona un rundown da eliminare', 'warning');
            return;
        }

        // Get rundown name for confirmation
        const rundownName = selector.options[selector.selectedIndex].text;

        const confirmDelete = confirm(
            `⚠️ ATTENZIONE: Eliminazione Rundown\n\n` +
            `Rundown: ${rundownName}\n\n` +
            `Questa operazione eliminerà:\n` +
            `• Il rundown selezionato\n` +
            `• Tutte le storie associate al rundown\n` +
            `• Tutti i comandi di automazione\n\n` +
            `Questa azione è IRREVERSIBILE!\n\n` +
            `Confermi l'eliminazione?`
        );

        if (!confirmDelete) return;

        try {
            const response = await fetch(`${Config.api.baseUrl}/rundown/${rundownId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Delete failed');

            this.showNotification('✓ Rundown eliminato con successo', 'success');

            // Reload rundowns and select first available
            await this.loadRundowns();

            // Clear current rundown
            this.currentRundown = null;
            await this.loadRundownData();

        } catch (error) {
            console.error('Delete rundown error:', error);
            this.showNotification('❌ Errore eliminazione rundown', 'error');
        }
    }

    /**
     * EVENT HANDLERS
     */
    setupEventHandlers() {
        // ==== TIMELINE BUILDER ====
        // Initialize Timeline Builder
        if (typeof TimelineBuilder !== 'undefined') {
            this.timelineBuilder = new TimelineBuilder(this);
            this.timelineBuilder.init();
            console.log('[APP] Timeline Builder initialized');
        }

        // Mode Toggle Buttons (Text / Timeline)
        const btnTextMode = document.getElementById('btn-text-mode');
        const btnTimelineMode = document.getElementById('btn-timeline-mode');

        if (btnTextMode) {
            btnTextMode.addEventListener('click', () => this.switchMode('text'));
        }

        if (btnTimelineMode) {
            btnTimelineMode.addEventListener('click', () => this.switchMode('timeline'));
        }

        // Global mouse handlers for timeline drag & resize
        document.addEventListener('mousemove', (e) => {
            if (this.timelineBuilder) {
                this.timelineBuilder.handleMouseMove(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.timelineBuilder) {
                this.timelineBuilder.handleMouseUp(e);
            }
        });

        // Toolbar buttons
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleToolbarAction(action);
            });
        });

        // Control buttons
        const cueBtn = document.getElementById('btn-cue');
        const takeBtn = document.getElementById('btn-take');
        const stopBtn = document.getElementById('btn-stop');

        if (cueBtn) cueBtn.addEventListener('click', () => this.handleCue());
        if (takeBtn) takeBtn.addEventListener('click', () => this.handleTake());
        if (stopBtn) stopBtn.addEventListener('click', () => this.handleStop());

        // Video Player Controls
        const playerPlay = document.getElementById('player-play');
        const playerPause = document.getElementById('player-pause');
        const playerStop = document.getElementById('player-stop');
        const playerTimeline = document.querySelector('.player-timeline');
        const previewVideo = document.getElementById('preview-video');

        if (playerPlay) {
            playerPlay.addEventListener('click', () => {
                if (previewVideo.src) {
                    previewVideo.play();
                    console.log('[PLAYER] Play');
                }
            });
        }

        if (playerPause) {
            playerPause.addEventListener('click', () => {
                if (previewVideo.src) {
                    previewVideo.pause();
                    console.log('[PLAYER] Pause');
                }
            });
        }

        if (playerStop) {
            playerStop.addEventListener('click', () => {
                if (previewVideo.src) {
                    previewVideo.pause();
                    previewVideo.currentTime = 0;
                    console.log('[PLAYER] Stop');
                }
            });
        }

        // Timeline seek
        if (playerTimeline) {
            playerTimeline.addEventListener('click', (e) => {
                if (previewVideo.src && previewVideo.duration) {
                    const rect = playerTimeline.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    previewVideo.currentTime = pos * previewVideo.duration;
                    console.log('[PLAYER] Seek to', previewVideo.currentTime);
                }
            });
        }

        // Update progress bar during playback
        if (previewVideo) {
            previewVideo.addEventListener('timeupdate', () => {
                if (previewVideo.duration) {
                    const progress = (previewVideo.currentTime / previewVideo.duration) * 100;
                    const progressBar = document.getElementById('player-progress');
                    const playerTime = document.getElementById('player-time');

                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }

                    if (playerTime) {
                        const currentMins = Math.floor(previewVideo.currentTime / 60);
                        const currentSecs = Math.floor(previewVideo.currentTime % 60);
                        const totalMins = Math.floor(previewVideo.duration / 60);
                        const totalSecs = Math.floor(previewVideo.duration % 60);

                        playerTime.textContent = `${currentMins}:${String(currentSecs).padStart(2, '0')} / ${totalMins}:${String(totalSecs).padStart(2, '0')}`;
                    }
                }
            });
        }

        // Rundown selector change
        const showSelector = document.getElementById('show-selector');
        if (showSelector) {
            showSelector.addEventListener('change', async (e) => {
                const rundownId = e.target.value;
                if (rundownId) {
                    await this.switchRundown(rundownId);
                }
            });
        }

        // Media add buttons
        document.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.currentTarget.closest('.media-section');
                const sectionType = section.querySelector('h3').textContent;
                this.handleMediaAdd(sectionType);
            });
        });

        // Script toolbar buttons
        const btnInsertVideo = document.getElementById('btn-insert-video');
        const btnInsertAudio = document.getElementById('btn-insert-audio');
        const btnInsertGraphic = document.getElementById('btn-insert-graphic');
        const btnAddText = document.getElementById('btn-add-text');
        const btnSaveStory = document.getElementById('btn-save-story');
        const btnSendToRundown = document.getElementById('btn-send-to-rundown');

        if (btnInsertVideo) btnInsertVideo.addEventListener('click', () => this.insertMediaCommand('video'));
        if (btnInsertAudio) btnInsertAudio.addEventListener('click', () => this.insertMediaCommand('audio'));
        if (btnInsertGraphic) btnInsertGraphic.addEventListener('click', () => this.insertMediaCommand('graphic'));
        if (btnAddText) btnAddText.addEventListener('click', () => this.showAddTextModal());
        if (btnSaveStory) btnSaveStory.addEventListener('click', () => this.saveStory());
        if (btnSendToRundown) btnSendToRundown.addEventListener('click', () => this.sendStoryToRundownModal());

        // New Rundown button
        const btnNewRundown = document.getElementById('btn-new-rundown');
        if (btnNewRundown) btnNewRundown.addEventListener('click', () => this.createNewRundown());

        // Delete Rundown button
        const btnDeleteRundown = document.getElementById('btn-delete-rundown');
        if (btnDeleteRundown) {
            btnDeleteRundown.addEventListener('click', () => this.deleteCurrentRundown());

            // Enable/disable delete button based on selection
            const showSelector = document.getElementById('show-selector');
            if (showSelector) {
                const updateDeleteButton = () => {
                    btnDeleteRundown.disabled = !showSelector.value;
                };
                showSelector.addEventListener('change', updateDeleteButton);
                updateDeleteButton(); // Initial state
            }
        }
    }

    handleToolbarAction(action) {
        // Update active state
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.action === action);
        });

        switch(action) {
            case 'new-story':
                this.createNewStory();
                break;
            case 'save':
                this.saveCurrentStory();
                break;
            case 'open':
                this.openStoryDialog();
                break;
            case 'media':
                this.openMediaBrowser();
                break;
            default:
                this.showNotification(`${action} - feature in development`, 'info');
        }
    }

    async handleCue() {
        // CUE: Carica il media selezionato nella preview (pronto ma in pausa)
        if (!this.selectedMedia && !this.selectedGraphic) {
            this.showNotification('Seleziona un media per CUE', 'warning');
            return;
        }

        const previewVideo = document.getElementById('preview-video');

        if (this.selectedMedia) {
            // Carica il media nella preview ma in pausa
            this.showMediaPreview(this.selectedMedia);

            if (this.selectedMedia.file_type === 'video' && previewVideo.src) {
                previewVideo.pause();
                previewVideo.currentTime = 0;
            }

            this.showNotification(`CUE - ${this.selectedMedia.original_filename} pronto`, 'warning');
        } else if (this.selectedGraphic) {
            this.showGraphicPreview(this.selectedGraphic);
            this.showNotification(`CUE - ${this.selectedGraphic} pronto`, 'warning');
        }
    }

    async handleTake() {
        // TAKE: Avvia riproduzione nella preview
        const previewVideo = document.getElementById('preview-video');
        const previewGraphic = document.getElementById('preview-graphic');

        if (previewVideo.style.display !== 'none' && previewVideo.src) {
            // Play video nella preview
            try {
                await previewVideo.play();
                this.showNotification('TAKE - Riproduzione video avviata in preview', 'success');
            } catch (error) {
                this.showNotification('Errore riproduzione video', 'error');
            }
        } else if (previewGraphic.style.display !== 'none') {
            this.showNotification('TAKE - Grafica visualizzata in preview', 'success');
        } else {
            this.showNotification('Nessun media in preview per TAKE', 'warning');
        }
    }

    handleStop() {
        // STOP: Ferma riproduzione nella preview
        const previewVideo = document.getElementById('preview-video');

        if (previewVideo.style.display !== 'none' && previewVideo.src) {
            previewVideo.pause();
            this.showNotification('STOP - Riproduzione fermata in preview', 'error');
        } else {
            // Nascondi tutto e torna al placeholder
            previewVideo.style.display = 'none';
            document.getElementById('preview-graphic').style.display = 'none';
            document.querySelector('.preview-placeholder').style.display = 'flex';
            document.getElementById('preview-info').style.display = 'none';
            document.getElementById('preview-duration').textContent = '--:--';
            this.showNotification('STOP - Preview cleared', 'error');
        }
    }

    async executeRundownItem(itemId) {
        try {
            const item = this.rundownItems.find(i => i.id === itemId);
            if (!item) {
                this.showNotification('Item non trovato', 'error');
                return;
            }

            const story = item.stories || item.story || {};
            this.showNotification(`▶ Esecuzione: ${story.slug || story.title || 'Story'}`, 'info');

            const result = await this.api.executeAutomation(itemId);
            this.showNotification(`✓ Automazione avviata: ${result.commands_scheduled} comandi`, 'success');
        } catch (error) {
            console.error('Execute error:', error);
            this.showNotification('Errore esecuzione', 'error');
        }
    }

    /**
     * STORY OPERATIONS
     */
    createNewStory() {
        const modal = document.getElementById('modal-container');
        modal.innerHTML = `
            <div class="modal-overlay" onclick="app.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); border-radius: 12px; padding: 32px; max-width: 600px; width: 90%;">
                    <h2 style="margin: 0 0 24px 0; color: var(--text-primary);">New Story</h2>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Slug *</label>
                                <input type="text" id="new-slug" class="form-input" placeholder="STORY-001">
                            </div>
                            <div class="form-group">
                                <label>Title *</label>
                                <input type="text" id="new-title" class="form-input" placeholder="Story Title">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Type *</label>
                                <select id="new-type" class="form-input">
                                    <option value="PKG">PKG</option>
                                    <option value="VO">VO</option>
                                    <option value="SOT">SOT</option>
                                    <option value="LIVE">LIVE</option>
                                    <option value="RDR">RDR</option>
                                    <option value="GFX">GFX</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Format *</label>
                                <select id="new-format" class="form-input">
                                    <option value="text">📝 Text Script</option>
                                    <option value="timeline">🎬 Visual Timeline</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Presenter</label>
                                <input type="text" id="new-presenter" class="form-input" placeholder="Mario Rossi">
                            </div>
                            <div class="form-group">
                                <label>Producer</label>
                                <input type="text" id="new-producer" class="form-input" placeholder="Admin">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Script</label>
                            <textarea id="new-script" class="form-textarea" rows="10" placeholder="Enter story script..."></textarea>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button onclick="app.createStorySubmit()" style="flex: 1; padding: 12px; background: var(--color-success); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">Create Story</button>
                        <button onclick="app.closeModal()" style="padding: 12px 24px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'block';
    }

    async createStorySubmit() {
        const slug = document.getElementById('new-slug').value.trim();
        const title = document.getElementById('new-title').value.trim();
        const type = document.getElementById('new-type').value;
        const format = document.getElementById('new-format').value;
        const presenter = document.getElementById('new-presenter').value.trim();
        const producer = document.getElementById('new-producer').value.trim();
        const script = document.getElementById('new-script').value;

        if (!slug || !title) {
            this.showNotification('Slug and Title are required', 'warning');
            return;
        }

        try {
            // Create metadata object with format
            const metadata = {
                format: format,
                timeline: format === 'timeline' ? { items: [], duration: 0 } : undefined
            };

            const response = await fetch(`${Config.api.baseUrl}/stories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    title,
                    type,
                    presenter,
                    producer,
                    script,
                    metadata: JSON.stringify(metadata)
                })
            });

            if (!response.ok) throw new Error('Create failed');

            const result = await response.json();
            this.closeModal();
            this.showNotification(`✓ Story created (${format === 'timeline' ? '🎬 Timeline' : '📝 Text'})`, 'success');
            await this.loadStories();

            // Load the new story
            this.currentStory = result;

            // Parse metadata string to object
            if (typeof result.metadata === 'string') {
                try {
                    this.currentStory.metadata = JSON.parse(result.metadata);
                } catch (e) {
                    console.warn('[CREATE] Failed to parse metadata:', e);
                    this.currentStory.metadata = {};
                }
            }

            this.displayStory(result);

            // If timeline format, switch to timeline mode
            if (format === 'timeline') {
                setTimeout(() => {
                    this.switchMode('timeline');
                }, 300);
            }
        } catch (error) {
            console.error('Create error:', error);
            this.showNotification('Error creating story', 'error');
        }
    }

    saveCurrentStory() {
        if (!this.currentStory) {
            this.showNotification('Nessuna storia selezionata', 'warning');
            return;
        }
        this.showNotification('Salvataggio storia...', 'info');
        // TODO: Implement save functionality
    }

    openStoryDialog() {
        this.showNotification('Apertura stories browser...', 'info');
        // TODO: Show dialog with list of stories
    }

    openMediaBrowser() {
        this.showNotification('Apertura media browser...', 'info');
        // TODO: Show media browser dialog
    }

    handleMediaAdd(sectionType) {
        const acceptTypes = sectionType === 'VIDEO CLIPS' ? '.mp4,.mov,.avi,.mkv' :
                           sectionType === 'AUDIO / SOT' ? '.wav,.mp3,.aiff,.flac,.aac' :
                           '.html,.png,.jpg,.svg';

        const modal = document.getElementById('modal-container');
        modal.innerHTML = `
            <div class="modal-overlay" onclick="app.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()" style="background: var(--bg-primary); border-radius: 12px; padding: 32px; max-width: 500px; width: 90%;">
                    <h2 style="margin: 0 0 24px 0; color: var(--text-primary);">Carica ${sectionType}</h2>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <button onclick="document.getElementById('upload-local').click()" class="upload-option-btn">
                            <i class="fas fa-upload"></i>
                            <div>
                                <strong>Upload Locale</strong>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">Carica file sul server</p>
                            </div>
                        </button>
                        <input type="file" id="upload-local" accept="${acceptTypes}" style="display: none;" onchange="app.handleLocalUpload(event)">

                        <button onclick="document.getElementById('upload-caspar').click()" class="upload-option-btn">
                            <i class="fas fa-server"></i>
                            <div>
                                <strong>Upload a CasparCG</strong>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">Carica direttamente su CasparCG via FTP</p>
                            </div>
                        </button>
                        <input type="file" id="upload-caspar" accept="${acceptTypes}" style="display: none;" onchange="app.handleCasparUpload(event)">
                    </div>

                    <button onclick="app.closeModal()" style="margin-top: 24px; width: 100%; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer;">Annulla</button>
                </div>
            </div>
        `;
        modal.style.display = 'block';
    }

    closeModal() {
        const modal = document.getElementById('modal-container');
        modal.innerHTML = '';
        modal.style.display = 'none';
    }

    async handleLocalUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.closeModal();
        this.showUploadProgress(file.name);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${Config.api.baseUrl}/media/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();
            this.hideUploadProgress();
            this.showNotification('File caricato con successo', 'success');
            await this.loadMediaAssets();
        } catch (error) {
            console.error('Upload error:', error);
            this.hideUploadProgress();
            this.showNotification('Errore durante upload', 'error');
        }
    }

    async handleCasparUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.closeModal();
        this.showUploadProgress(file.name);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${Config.api.baseUrl}/media/upload-to-caspar`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const result = await response.json();
            this.hideUploadProgress();
            this.showNotification('File caricato su CasparCG con successo', 'success');
            await this.loadMediaAssets();
        } catch (error) {
            console.error('Upload error:', error);
            this.hideUploadProgress();
            this.showNotification('Errore durante upload su CasparCG', 'error');
        }
    }

    showUploadProgress(filename) {
        const progressEl = document.getElementById('upload-progress');
        progressEl.style.display = 'block';
        progressEl.querySelector('.upload-filename').textContent = filename;
        progressEl.querySelector('.upload-percent').textContent = '0%';
        progressEl.querySelector('.progress-fill').style.width = '0%';
    }

    hideUploadProgress() {
        const progressEl = document.getElementById('upload-progress');
        setTimeout(() => {
            progressEl.style.display = 'none';
        }, 2000);
    }

    updateUploadProgress(percent) {
        const progressEl = document.getElementById('upload-progress');
        progressEl.querySelector('.upload-percent').textContent = `${percent}%`;
        progressEl.querySelector('.progress-fill').style.width = `${percent}%`;
    }

    /**
     * TIMELINE MODE SWITCHING
     */
    switchMode(mode) {
        if (mode === this.currentMode) return;

        const scriptSections = document.getElementById('script-sections');
        const timelineBuilder = document.getElementById('timeline-builder');
        const btnTextMode = document.getElementById('btn-text-mode');
        const btnTimelineMode = document.getElementById('btn-timeline-mode');

        if (mode === 'text') {
            // Switch to TEXT mode
            if (scriptSections) scriptSections.style.display = 'block';
            if (timelineBuilder) timelineBuilder.style.display = 'none';
            if (btnTextMode) btnTextMode.classList.add('active');
            if (btnTimelineMode) btnTimelineMode.classList.remove('active');

            this.currentMode = 'text';
            console.log('[APP] Switched to TEXT mode');

        } else if (mode === 'timeline') {
            // Switch to TIMELINE mode
            if (scriptSections) scriptSections.style.display = 'none';
            if (timelineBuilder) timelineBuilder.style.display = 'flex';
            if (btnTextMode) btnTextMode.classList.remove('active');
            if (btnTimelineMode) btnTimelineMode.classList.add('active');

            this.currentMode = 'timeline';

            // Refresh media library drag & drop after media loaded
            if (this.timelineBuilder) {
                setTimeout(() => {
                    this.timelineBuilder.setupMediaLibraryDragDrop();
                }, 100);
            }

            console.log('[APP] Switched to TIMELINE mode');
        }
    }

    /**
     * NOTIFICATIONS
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
            <span>${message}</span>
        `;

        container.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NewsFlowApp();
    app.init();
});