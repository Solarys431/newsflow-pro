/**
 * Timeline Builder - SuperConductor Style
 * Visual timeline editor for broadcast automation
 */

class TimelineBuilder {
    constructor(app) {
        this.app = app; // Reference to iNEWSApp instance
        this.items = [];
        this.pixelsPerSecond = 15; // 15px = 1 secondo (scalabile con zoom)
        this.totalDuration = 60; // 60 secondi = 1 minuto timeline iniziale
        this.zoomLevel = 1.0; // 100%
        this.selectedItem = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragStartX = 0;
        this.dragOffset = 0;
        this.resizeHandle = null;

        console.log('[TIMELINE] TimelineBuilder initialized');
    }

    /**
     * Initialize timeline with all event listeners
     */
    init() {
        console.log('[TIMELINE] Setting up timeline...');
        this.setupTimecodeRuler();
        this.setupMediaLibraryDragDrop();
        this.setupPrecisionIndicators(); // Add drag precision feedback
        this.setupTrackDropZones();
        this.setupControlButtons();
        this.applyZoom(); // Apply initial zoom level
        this.updateStats();

        console.log('[TIMELINE] Timeline ready!');
    }

    /**
     * Calculate adaptive timeframe step based on total duration
     */
    calculateTimeframeStep(duration) {
        // Adaptive timeframe scaling
        if (duration <= 30) {
            return { step: 1, majorEvery: 5 };      // 0-30s: ogni 1s (major ogni 5s)
        } else if (duration <= 120) {
            return { step: 5, majorEvery: 2 };      // 30s-2min: ogni 5s (major ogni 10s)
        } else if (duration <= 600) {
            return { step: 10, majorEvery: 3 };     // 2-10min: ogni 10s (major ogni 30s)
        } else if (duration <= 1800) {
            return { step: 30, majorEvery: 4 };     // 10-30min: ogni 30s (major ogni 2min)
        } else {
            return { step: 60, majorEvery: 5 };     // 30min+: ogni 1min (major ogni 5min)
        }
    }

    /**
     * Setup timecode ruler with adaptive markers based on duration
     */
    setupTimecodeRuler() {
        const ruler = document.getElementById('timeline-ruler');
        if (!ruler) return;

        ruler.innerHTML = '';

        // Get adaptive timeframe
        const { step, majorEvery } = this.calculateTimeframeStep(this.totalDuration);
        const steps = Math.ceil(this.totalDuration / step);

        for (let i = 0; i <= steps; i++) {
            const seconds = i * step;
            const percent = (seconds / this.totalDuration) * 100;
            const isMajor = (i % majorEvery === 0); // Major marker based on duration

            const marker = document.createElement('div');
            marker.className = `timecode-marker ${isMajor ? 'major' : ''}`;
            marker.style.left = `${percent}%`;

            const label = document.createElement('span');
            label.className = 'timecode-label';
            label.textContent = this.formatTime(seconds);
            marker.appendChild(label);

            ruler.appendChild(marker);
        }

        console.log(`[TIMELINE] Timecode step: ${step}s, major every: ${majorEvery * step}s, duration: ${this.totalDuration}s`);
    }

    /**
     * Setup precision drag indicators (playhead + tooltip)
     */
    setupPrecisionIndicators() {
        // Create playhead indicators for each track
        const tracks = document.querySelectorAll('.track-content');

        tracks.forEach(track => {
            // Create playhead indicator
            const playhead = document.createElement('div');
            playhead.className = 'timeline-drag-playhead';

            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'timeline-drag-tooltip';
            tooltip.textContent = '00:00';

            playhead.appendChild(tooltip);
            track.appendChild(playhead);
        });

        console.log('[TIMELINE] Precision indicators created for all tracks');
    }

    /**
     * Update playhead position during drag
     */
    updateDragPlayhead(track, clientX) {
        // Find playhead for this specific track
        const playhead = track.querySelector('.timeline-drag-playhead');
        if (!playhead) return;

        const tooltip = playhead.querySelector('.timeline-drag-tooltip');
        const trackRect = track.getBoundingClientRect();
        const relativeX = clientX - trackRect.left;

        // Calculate time position considering zoom and track width
        const trackWidth = trackRect.width;
        const timeSeconds = Math.floor((relativeX / trackWidth) * this.totalDuration);
        const clampedTime = Math.max(0, Math.min(timeSeconds, this.totalDuration));

        // Update playhead position
        const leftPercent = (clampedTime / this.totalDuration) * 100;
        playhead.style.left = `${leftPercent}%`;

        // Update tooltip text
        if (tooltip) {
            tooltip.textContent = this.formatTime(clampedTime);
        }

        // Show indicator
        playhead.classList.add('active');
    }

    /**
     * Hide playhead indicator
     */
    hideDragPlayhead() {
        // Hide all playheads
        const playheads = document.querySelectorAll('.timeline-drag-playhead');
        playheads.forEach(playhead => {
            playhead.classList.remove('active');
        });
    }

    /**
     * Enable drag & drop from media library
     */
    setupMediaLibraryDragDrop() {
        const mediaItems = document.querySelectorAll('.media-item');

        mediaItems.forEach(item => {
            item.draggable = true;
            item.classList.add('draggable');

            item.addEventListener('dragstart', (e) => {
                const assetId = item.dataset.assetId;
                const nameEl = item.querySelector('.media-name');

                if (!nameEl) {
                    console.warn('[TIMELINE] No media-name element found');
                    return;
                }

                const name = nameEl.textContent.trim();

                // Check if it's a video/audio asset
                const asset = this.app.mediaAssets.find(a => a.id === assetId);

                // Check if it's a graphics template
                const template = this.app.templates ? this.app.templates.find(t => t.name === name) : null;

                let dragData;

                if (asset) {
                    // Video/Audio asset
                    dragData = {
                        assetId: asset.id,
                        filename: asset.filename,
                        originalFilename: asset.original_filename || asset.filename,
                        type: asset.file_type,
                        duration: asset.duration || 10
                    };
                } else if (template) {
                    // Graphics template
                    dragData = {
                        assetId: template.id || `template-${Date.now()}`,
                        filename: template.filename || `${template.name}.html`,
                        originalFilename: template.display_name || template.name,
                        type: 'graphics',
                        duration: 5
                    };
                } else {
                    // Fallback for graphics without template data
                    dragData = {
                        assetId: `graphic-${Date.now()}`,
                        filename: `${name}.html`,
                        originalFilename: name,
                        type: 'graphics',
                        duration: 5
                    };
                }

                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', JSON.stringify(dragData));

                item.classList.add('dragging');
                console.log('[TIMELINE] Dragging:', dragData.originalFilename, '(type:', dragData.type + ')');
            });

            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
        });
    }

    /**
     * Setup drop zones for timeline tracks
     */
    setupTrackDropZones() {
        const tracks = document.querySelectorAll('.track-content');

        tracks.forEach(track => {
            track.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                track.classList.add('drag-over');

                // Update precision playhead indicator
                this.updateDragPlayhead(track, e.clientX);
            });

            track.addEventListener('dragleave', (e) => {
                track.classList.remove('drag-over');

                // Hide precision indicator when leaving track
                this.hideDragPlayhead();
            });

            track.addEventListener('drop', (e) => {
                e.preventDefault();
                track.classList.remove('drag-over');

                // Hide precision indicator on drop
                this.hideDragPlayhead();

                try {
                    const rawData = e.dataTransfer.getData('text/plain');

                    if (!rawData || rawData.trim() === '') {
                        console.warn('[TIMELINE] Empty drop data');
                        return;
                    }

                    let data;
                    try {
                        data = JSON.parse(rawData);
                    } catch (parseError) {
                        console.error('[TIMELINE] Invalid JSON in drop data:', rawData);
                        return;
                    }

                    if (!data || !data.type || !data.filename) {
                        console.warn('[TIMELINE] Invalid drop data structure:', data);
                        return;
                    }

                    const trackName = track.dataset.trackName;

                    // Validate track type
                    if (!this.validateTrackType(data.type, trackName)) {
                        console.warn('[TIMELINE] Invalid drop:', data.type, 'on', trackName);
                        return;
                    }

                    // Calculate drop position
                    const trackRect = track.getBoundingClientRect();
                    const dropX = e.clientX - trackRect.left;
                    const startTime = Math.floor(dropX / this.pixelsPerSecond / this.zoomLevel);

                    // Add item to timeline
                    const itemData = {
                        id: `item-${Date.now()}`,
                        assetId: data.assetId,
                        type: data.type,
                        filename: data.filename,
                        originalFilename: data.originalFilename,
                        start: Math.max(0, startTime),
                        duration: data.duration || 5,
                        track: trackName
                    };

                    // For text items, include text content
                    if (data.type === 'text' && data.text) {
                        itemData.text = data.text;
                    }

                    this.addTimelineItem(itemData);

                    console.log('[TIMELINE] Item dropped successfully:', data.originalFilename);

                } catch (error) {
                    console.error('[TIMELINE] Drop error:', error);
                }
            });
        });
    }

    /**
     * Validate if item type can be dropped on track
     */
    validateTrackType(itemType, trackName) {
        const validMappings = {
            'video': 'video',
            'graphics': 'graphics',
            'audio': 'audio',
            'text': 'text'
        };

        return validMappings[itemType] === trackName;
    }

    /**
     * Add timeline item to track
     */
    addTimelineItem(itemData) {
        const track = document.querySelector(`#track-${itemData.track}`);
        if (!track) {
            console.error('[TIMELINE] Track not found:', itemData.track);
            return;
        }

        // Check if extends beyond timeline
        if (itemData.start + itemData.duration > this.totalDuration) {
            this.totalDuration = itemData.start + itemData.duration + 10;
            this.setupTimecodeRuler();
        }

        // Create DOM element
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.dataset.id = itemData.id;
        item.dataset.type = itemData.type;
        item.dataset.filename = itemData.filename;
        item.dataset.start = itemData.start;
        item.dataset.duration = itemData.duration;
        item.dataset.track = itemData.track;

        // Calculate position and width
        const left = (itemData.start / this.totalDuration) * 100;
        const width = (itemData.duration / this.totalDuration) * 100;

        item.style.left = `${left}%`;
        item.style.width = `${width}%`;

        // Build HTML content
        const iconMap = {
            'video': 'fa-video',
            'graphics': 'fa-layer-group',
            'audio': 'fa-volume-up',
            'text': 'fa-align-left'
        };

        item.innerHTML = `
            <div class="timeline-item-content">
                <div class="item-header">
                    <i class="fas ${iconMap[itemData.type]} item-type-icon"></i>
                    <span class="item-name">${itemData.originalFilename}</span>
                </div>
                <div class="item-footer">
                    <span class="item-duration">${this.formatTime(itemData.duration)}</span>
                    <span class="item-start-time">${this.formatTime(itemData.start)}</span>
                </div>
            </div>
            <div class="resize-handle resize-handle-left"></div>
            <div class="resize-handle resize-handle-right"></div>
            <button class="btn-delete-timeline-item">
                <i class="fas fa-times"></i>
            </button>
        `;

        track.appendChild(item);
        this.items.push(itemData);

        // Setup item interactions
        this.setupItemInteractions(item);

        // Check overlaps
        this.checkOverlaps();

        // Update stats
        this.updateStats();

        console.log('[TIMELINE] Item added:', itemData);
    }

    /**
     * Setup interactions for timeline item (select, drag, resize, delete)
     */
    setupItemInteractions(item) {
        // Double-click to edit text items
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const itemType = item.dataset.type;

            if (itemType === 'text') {
                // Find the text item data in the timeline
                const itemId = item.dataset.id;
                const itemData = this.items.find(i => i.id === itemId);

                if (itemData && itemData.text) {
                    // Find corresponding text item in app
                    const app = window.app;
                    if (app) {
                        // Create a temporary text item object for editing
                        const textItem = {
                            id: itemId,
                            text: itemData.text,
                            duration: itemData.duration
                        };
                        app.showAddTextModal(textItem);
                    }
                }
            }
        });

        // Select item
        item.addEventListener('mousedown', (e) => {
            // Ignore if clicking delete or resize handles
            if (e.target.closest('.btn-delete-timeline-item') ||
                e.target.classList.contains('resize-handle')) {
                return;
            }

            this.selectItem(item);

            // Start dragging
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragOffset = e.clientX - item.getBoundingClientRect().left;
            item.classList.add('dragging');

            e.preventDefault();
        });

        // Delete button
        const deleteBtn = item.querySelector('.btn-delete-timeline-item');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteItem(item.dataset.id);
            });
        }

        // Resize handles
        const leftHandle = item.querySelector('.resize-handle-left');
        const rightHandle = item.querySelector('.resize-handle-right');

        [leftHandle, rightHandle].forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.isResizing = true;
                this.resizeHandle = handle;
                this.dragStartX = e.clientX;
                this.selectItem(item);
                item.classList.add('resizing');
            });
        });
    }

    /**
     * Global mouse move handler (for dragging and resizing)
     */
    handleMouseMove(e) {
        if (this.isDragging && this.selectedItem) {
            const track = this.selectedItem.parentElement;
            const trackRect = track.getBoundingClientRect();

            let newLeft = e.clientX - trackRect.left - this.dragOffset;
            newLeft = Math.max(0, Math.min(newLeft, trackRect.width - this.selectedItem.offsetWidth));

            const leftPercent = (newLeft / trackRect.width) * 100;
            this.selectedItem.style.left = `${leftPercent}%`;

            // Show precision playhead at item START position
            this.updateDragPlayhead(track, trackRect.left + newLeft);

        } else if (this.isResizing && this.selectedItem && this.resizeHandle) {
            const track = this.selectedItem.parentElement;
            const trackRect = track.getBoundingClientRect();
            const deltaX = e.clientX - this.dragStartX;

            const currentLeft = parseFloat(this.selectedItem.style.left);
            const currentWidth = parseFloat(this.selectedItem.style.width);

            if (this.resizeHandle.classList.contains('resize-handle-left')) {
                // Resize from left
                const deltaPercent = (deltaX / trackRect.width) * 100;
                const newLeft = Math.max(0, Math.min(currentLeft + deltaPercent, currentLeft + currentWidth - 1));
                const newWidth = currentWidth - (newLeft - currentLeft);

                if (newWidth >= 1) {
                    this.selectedItem.style.left = `${newLeft}%`;
                    this.selectedItem.style.width = `${newWidth}%`;
                    this.dragStartX = e.clientX;
                }
            } else {
                // Resize from right
                const deltaPercent = (deltaX / trackRect.width) * 100;
                const newWidth = Math.max(1, Math.min(currentWidth + deltaPercent, 100 - currentLeft));

                this.selectedItem.style.width = `${newWidth}%`;
                this.dragStartX = e.clientX;
            }
        }
    }

    /**
     * Global mouse up handler
     */
    handleMouseUp(e) {
        if (this.isDragging && this.selectedItem) {
            this.isDragging = false;
            this.selectedItem.classList.remove('dragging');

            // Hide precision playhead
            this.hideDragPlayhead();

            // Update item data
            const newStart = Math.floor((parseFloat(this.selectedItem.style.left) / 100) * this.totalDuration);
            this.selectedItem.dataset.start = newStart;

            this.updateItemData(this.selectedItem.dataset.id, { start: newStart });

            // Update UI
            const startTimeEl = this.selectedItem.querySelector('.item-start-time');
            if (startTimeEl) startTimeEl.textContent = this.formatTime(newStart);

            this.checkOverlaps();

        } else if (this.isResizing && this.selectedItem) {
            this.isResizing = false;
            this.resizeHandle = null;
            this.selectedItem.classList.remove('resizing');

            // Update item data
            const newStart = Math.floor((parseFloat(this.selectedItem.style.left) / 100) * this.totalDuration);
            const newDuration = Math.floor((parseFloat(this.selectedItem.style.width) / 100) * this.totalDuration);

            this.selectedItem.dataset.start = newStart;
            this.selectedItem.dataset.duration = newDuration;

            this.updateItemData(this.selectedItem.dataset.id, {
                start: newStart,
                duration: newDuration
            });

            // Update UI
            const durationEl = this.selectedItem.querySelector('.item-duration');
            const startTimeEl = this.selectedItem.querySelector('.item-start-time');
            if (durationEl) durationEl.textContent = this.formatTime(newDuration);
            if (startTimeEl) startTimeEl.textContent = this.formatTime(newStart);

            this.checkOverlaps();
        }
    }

    /**
     * Select timeline item
     */
    selectItem(item) {
        document.querySelectorAll('.timeline-item').forEach(el => {
            el.classList.remove('selected');
        });
        item.classList.add('selected');
        this.selectedItem = item;
    }

    /**
     * Delete timeline item
     */
    deleteItem(itemId) {
        const item = document.querySelector(`.timeline-item[data-id="${itemId}"]`);
        if (item) {
            item.remove();
            this.items = this.items.filter(i => i.id !== itemId);
            this.checkOverlaps();
            this.updateStats();
            console.log('[TIMELINE] Item deleted:', itemId);
        }
    }

    /**
     * Update item data in items array
     */
    updateItemData(itemId, updates) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            Object.assign(item, updates);
        }
    }

    /**
     * Check for overlapping items on same track
     */
    checkOverlaps() {
        // Remove existing overlap indicators
        document.querySelectorAll('.timeline-item').forEach(item => {
            item.classList.remove('overlapping');
            const indicator = item.querySelector('.overlap-indicator');
            if (indicator) indicator.remove();
        });

        // Group items by track
        const trackGroups = {};
        this.items.forEach(item => {
            if (!trackGroups[item.track]) trackGroups[item.track] = [];
            trackGroups[item.track].push(item);
        });

        // Check overlaps per track
        Object.values(trackGroups).forEach(trackItems => {
            trackItems.sort((a, b) => a.start - b.start);

            for (let i = 0; i < trackItems.length - 1; i++) {
                const current = trackItems[i];
                const next = trackItems[i + 1];

                const currentEnd = current.start + current.duration;

                if (currentEnd > next.start) {
                    // Overlap detected!
                    const overlapAmount = currentEnd - next.start;

                    const currentEl = document.querySelector(`.timeline-item[data-id="${current.id}"]`);
                    const nextEl = document.querySelector(`.timeline-item[data-id="${next.id}"]`);

                    if (currentEl) {
                        currentEl.classList.add('overlapping');
                        const indicator = document.createElement('div');
                        indicator.className = 'overlap-indicator';
                        indicator.textContent = `⚠ -${this.formatTime(overlapAmount)}`;
                        currentEl.appendChild(indicator);
                    }

                    if (nextEl) {
                        nextEl.classList.add('overlapping');
                    }
                }
            }
        });
    }

    /**
     * Generate script from timeline
     */
    generateScript() {
        if (this.items.length === 0) {
            alert('⚠️ Timeline is empty! Add some media first.');
            return '';
        }

        // Separate items by track
        const videoItems = this.items.filter(i => i.type === 'video').sort((a, b) => a.start - b.start);
        const graphicsItems = this.items.filter(i => i.type === 'graphics').sort((a, b) => a.start - b.start);
        const audioItems = this.items.filter(i => i.type === 'audio').sort((a, b) => a.start - b.start);
        const textItems = this.items.filter(i => i.type === 'text').sort((a, b) => a.start - b.start);

        let script = '';
        let currentVideoIndex = 0;
        let timelineTime = 0;

        // Process each video sequentially
        videoItems.forEach((video, vidIndex) => {
            // Add WAIT between videos if needed
            if (vidIndex > 0 && video.start > timelineTime) {
                const waitDuration = video.start - timelineTime;
                script += `((WAIT ${Math.floor(waitDuration)}))\n`;
                timelineTime = video.start;
            }

            // Add video command
            script += `((TAKE VTR - "${video.filename}" - ${this.formatTime(video.duration)}))\n`;

            const videoStartTime = video.start;
            const videoEndTime = video.start + video.duration;

            // Find graphics that appear during this video
            const overlayGraphics = graphicsItems.filter(g =>
                g.start >= videoStartTime && g.start < videoEndTime
            );

            // Add graphics with proper WAIT timing
            overlayGraphics.forEach(graphic => {
                const waitTime = Math.floor(graphic.start - videoStartTime);

                // Add WAIT command (format: ((WAIT X)) where X is seconds from video start)
                if (waitTime > 0) {
                    script += `((WAIT ${waitTime}))\n`;
                }

                // Add GFX ON command
                script += `((GFX ON - "${graphic.filename}" - ${this.formatTime(graphic.duration)}))\n`;

                // Add GFX OFF command
                script += `((GFX OFF))\n`;
            });

            // Find audio that appears during this video
            const overlayAudio = audioItems.filter(a =>
                a.start >= videoStartTime && a.start < videoEndTime
            );

            overlayAudio.forEach(audio => {
                const waitTime = Math.floor(audio.start - videoStartTime);
                if (waitTime > 0) {
                    script += `((WAIT ${waitTime}))\n`;
                }
                script += `((AUDIO - "${audio.filename}" - ${this.formatTime(audio.duration)}))\n`;
            });

            timelineTime = videoEndTime;
        });

        // Add standalone graphics (not during video)
        const standaloneGraphics = graphicsItems.filter(g => {
            return !videoItems.some(v => g.start >= v.start && g.start < v.start + v.duration);
        });

        standaloneGraphics.forEach(graphic => {
            if (graphic.start > timelineTime) {
                const waitDuration = graphic.start - timelineTime;
                script += `((WAIT ${Math.floor(waitDuration)}))\n`;
                timelineTime = graphic.start;
            }

            script += `((GFX ON - "${graphic.filename}" - ${this.formatTime(graphic.duration)}))\n`;
            script += `((GFX OFF))\n`;
            timelineTime = graphic.start + graphic.duration;
        });

        // Add text items
        textItems.forEach(item => {
            if (item.start > timelineTime) {
                const waitDuration = item.start - timelineTime;
                script += `((WAIT ${Math.floor(waitDuration)}))\n`;
                timelineTime = item.start;
            }
            script += item.text || '[Voiceover text here]';
            script += '\n';
        });

        console.log('[TIMELINE] Generated script:', script);
        return script;
    }

    /**
     * Parse time string to seconds (helper for generateScript)
     */
    parseTimeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        return parseInt(timeStr) || 0;
    }

    /**
     * Clear entire timeline
     */
    clearTimeline(silent = false) {
        if (this.items.length === 0) return;

        if (!silent && !confirm('⚠️ Clear entire timeline?\n\nThis will remove all items. This action cannot be undone.')) {
            return;
        }

        document.querySelectorAll('.timeline-item').forEach(item => item.remove());
        this.items = [];
        this.selectedItem = null;
        this.updateStats();

        console.log('[TIMELINE] Timeline cleared');
    }

    /**
     * Zoom in/out
     */
    zoom(direction) {
        if (direction === 'in') {
            this.zoomLevel = Math.min(4.0, this.zoomLevel + 0.25); // Max 400%
        } else {
            this.zoomLevel = Math.max(0.25, this.zoomLevel - 0.25); // Min 25%
        }

        this.applyZoom();
        console.log('[TIMELINE] Zoom level:', this.zoomLevel);
    }

    /**
     * Apply zoom transformation to timeline
     */
    applyZoom() {
        // Update zoom level display
        const zoomDisplay = document.getElementById('zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }

        // Apply horizontal scaling to ruler and tracks
        const ruler = document.getElementById('timeline-ruler');
        const tracks = document.querySelectorAll('.track-content');

        const baseWidth = 800; // Base min-width in pixels
        const scaledWidth = Math.floor(baseWidth * this.zoomLevel);

        if (ruler) {
            ruler.style.minWidth = `${scaledWidth}px`;
            ruler.style.transform = `scaleX(${this.zoomLevel})`;
            ruler.style.transformOrigin = 'left center';

            // Compensate label distortion by counter-scaling
            const labels = ruler.querySelectorAll('.timecode-label');
            labels.forEach(label => {
                label.style.transform = `scaleX(${1 / this.zoomLevel})`;
                label.style.transformOrigin = 'left center';
            });
        }

        tracks.forEach(track => {
            track.style.minWidth = `${scaledWidth}px`;
            track.style.transform = `scaleX(${this.zoomLevel})`;
            track.style.transformOrigin = 'left center';
        });

        console.log('[TIMELINE] Applied zoom:', this.zoomLevel, 'scaled width:', scaledWidth);
    }

    /**
     * Update timeline statistics
     */
    updateStats() {
        const itemCount = this.items.length;
        const totalDuration = this.items.reduce((sum, item) => {
            return Math.max(sum, item.start + item.duration);
        }, 0);

        document.getElementById('timeline-item-count').textContent = itemCount;
        document.getElementById('timeline-total-duration').textContent = this.formatTime(totalDuration);
    }

    /**
     * Setup control buttons
     */
    setupControlButtons() {
        // Clear timeline
        const btnClear = document.getElementById('btn-clear-timeline');
        if (btnClear) {
            btnClear.addEventListener('click', () => this.clearTimeline());
        }

        // Generate script
        const btnGenerate = document.getElementById('btn-generate-script');
        if (btnGenerate) {
            btnGenerate.addEventListener('click', () => {
                const script = this.generateScript();
                if (script) {
                    // Copy to clipboard
                    navigator.clipboard.writeText(script).then(() => {
                        alert('✅ Script generated and copied to clipboard!');
                    });
                }
            });
        }

        // Zoom controls
        document.getElementById('zoom-in')?.addEventListener('click', () => this.zoom('in'));
        document.getElementById('zoom-out')?.addEventListener('click', () => this.zoom('out'));
    }

    /**
     * Format seconds to MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Destroy timeline (cleanup)
     */
    destroy() {
        this.items = [];
        this.selectedItem = null;
        console.log('[TIMELINE] Timeline destroyed');
    }
}

// Export for use in iNEWSApp
window.TimelineBuilder = TimelineBuilder;