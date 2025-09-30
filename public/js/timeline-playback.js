/**
 * Timeline Playback Engine
 * Professional multi-track media orchestration for timeline preview
 */

class TimelinePlayback {
    constructor(timeline) {
        this.timeline = timeline;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.startTimestamp = null;
        this.pausedTime = 0;
        this.animationFrame = null;

        // Active media tracking
        this.activeVideo = null;
        this.activeGraphics = [];
        this.activeAudio = null;

        // Scrubbing state
        this.isScrubbing = false;
        this.wasPlayingBeforeScrub = false;

        // DOM references
        this.previewVideo = document.getElementById('preview-video');
        this.previewGraphic = document.getElementById('preview-graphic');
        this.previewPlaceholder = document.querySelector('.preview-placeholder');
        this.previewInfo = document.getElementById('preview-info');
        this.playerControls = document.getElementById('video-player-controls');

        // Create playhead element
        this.createPlayhead();

        // Setup scrubbing functionality
        this.setupScrubbing();

        console.log('[PLAYBACK] Timeline playback engine initialized');
    }

    /**
     * Create animated playhead element
     */
    createPlayhead() {
        const ruler = document.getElementById('timeline-ruler');
        if (!ruler) return;

        this.playhead = document.createElement('div');
        this.playhead.className = 'timeline-playhead';
        this.playhead.innerHTML = `
            <div class="playhead-line"></div>
            <div class="playhead-handle"></div>
        `;

        ruler.appendChild(this.playhead);
        console.log('[PLAYBACK] Playhead created');
    }

    /**
     * Setup scrubbing (interactive playhead dragging)
     */
    setupScrubbing() {
        const ruler = document.getElementById('timeline-ruler');
        const playheadHandle = this.playhead?.querySelector('.playhead-handle');

        if (!ruler || !playheadHandle) return;

        // Mouse down on playhead handle - start scrubbing
        playheadHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startScrubbing();
        });

        // Click on ruler - seek to position
        ruler.addEventListener('click', (e) => {
            // Don't trigger if clicking on playhead itself
            if (e.target.closest('.timeline-playhead')) return;

            const rulerRect = ruler.getBoundingClientRect();
            const clickX = e.clientX - rulerRect.left;
            const percent = (clickX / rulerRect.width) * 100;
            const seekTime = (percent / 100) * this.timeline.totalDuration;

            this.seekTo(Math.max(0, Math.min(seekTime, this.timeline.totalDuration)));
            console.log('[PLAYBACK] Click seek to', this.formatTime(seekTime));
        });

        // Global mouse move - handle scrubbing drag
        document.addEventListener('mousemove', (e) => {
            if (!this.isScrubbing) return;

            const ruler = document.getElementById('timeline-ruler');
            const rulerRect = ruler.getBoundingClientRect();
            const mouseX = e.clientX - rulerRect.left;
            const percent = (mouseX / rulerRect.width) * 100;
            const newTime = (percent / 100) * this.timeline.totalDuration;

            // Clamp to valid range
            this.currentTime = Math.max(0, Math.min(newTime, this.timeline.totalDuration));
            this.pausedTime = this.currentTime;

            // Update visuals
            this.updatePlayheadPosition();
            this.orchestrateMedia();
        });

        // Global mouse up - end scrubbing
        document.addEventListener('mouseup', () => {
            if (this.isScrubbing) {
                this.stopScrubbing();
            }
        });

        console.log('[PLAYBACK] Scrubbing enabled');
    }

    /**
     * Start scrubbing mode
     */
    startScrubbing() {
        this.isScrubbing = true;
        this.wasPlayingBeforeScrub = this.isPlaying && !this.isPaused;

        // Pause playback during scrub
        if (this.isPlaying) {
            this.pause();
        }

        // Add visual feedback
        if (this.playhead) {
            this.playhead.style.cursor = 'grabbing';
        }

        console.log('[PLAYBACK] Scrubbing started');
    }

    /**
     * Stop scrubbing mode
     */
    stopScrubbing() {
        this.isScrubbing = false;

        // Remove visual feedback
        if (this.playhead) {
            this.playhead.style.cursor = 'grab';
        }

        // Resume playback if it was playing before scrub
        if (this.wasPlayingBeforeScrub) {
            this.play();
        }

        console.log('[PLAYBACK] Scrubbing stopped at', this.formatTime(this.currentTime));
    }

    /**
     * Start playback
     */
    play() {
        if (this.isPlaying && !this.isPaused) {
            console.log('[PLAYBACK] Already playing');
            return;
        }

        if (this.isPaused) {
            // Resume from pause
            this.isPaused = false;
            this.startTimestamp = performance.now() - (this.pausedTime * 1000);
            console.log('[PLAYBACK] Resumed from', this.formatTime(this.pausedTime));
        } else {
            // Start from beginning or current position
            this.currentTime = 0;
            this.startTimestamp = performance.now();
            console.log('[PLAYBACK] Started playback');
        }

        this.isPlaying = true;
        this.updateTransportButtons();
        this.animate();
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.isPaused = true;
        this.pausedTime = this.currentTime;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Pause active video
        if (this.previewVideo && !this.previewVideo.paused) {
            this.previewVideo.pause();
        }

        this.updateTransportButtons();
        console.log('[PLAYBACK] Paused at', this.formatTime(this.currentTime));
    }

    /**
     * Stop playback and reset
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.pausedTime = 0;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Clear all active media
        this.clearAllMedia();

        // Reset playhead position
        if (this.playhead) {
            this.playhead.style.left = '0%';
        }

        this.updateTransportButtons();
        console.log('[PLAYBACK] Stopped and reset');
    }

    /**
     * Main animation loop
     */
    animate() {
        if (!this.isPlaying) return;

        const now = performance.now();
        this.currentTime = (now - this.startTimestamp) / 1000; // Convert to seconds

        // Check if playback finished
        if (this.currentTime >= this.timeline.totalDuration) {
            this.stop();
            return;
        }

        // Update playhead position
        this.updatePlayheadPosition();

        // Orchestrate media (activate/deactivate based on currentTime)
        this.orchestrateMedia();

        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    /**
     * Update playhead visual position
     */
    updatePlayheadPosition() {
        if (!this.playhead || this.timeline.totalDuration === 0) return;

        const percent = (this.currentTime / this.timeline.totalDuration) * 100;
        this.playhead.style.left = `${percent}%`;

        // Update timeline footer time display
        const timeDisplay = document.getElementById('timeline-playhead-time');
        if (timeDisplay) {
            timeDisplay.textContent = this.formatTime(this.currentTime);
        }
    }

    /**
     * Orchestrate multi-track media playback
     */
    orchestrateMedia() {
        const items = this.timeline.items;

        // Get items that should be active at currentTime
        const activeItems = items.filter(item => {
            const itemStart = item.start;
            const itemEnd = item.start + item.duration;
            return this.currentTime >= itemStart && this.currentTime < itemEnd;
        });

        // Separate by track
        const videoItems = activeItems.filter(i => i.track === 'video');
        const graphicsItems = activeItems.filter(i => i.track === 'graphics');
        const audioItems = activeItems.filter(i => i.track === 'audio');

        // Handle VIDEO track (only one video at a time)
        this.handleVideoPlayback(videoItems);

        // Handle GRAPHICS track (can overlay multiple)
        this.handleGraphicsPlayback(graphicsItems);

        // Handle AUDIO track
        this.handleAudioPlayback(audioItems);
    }

    /**
     * Handle video playback
     */
    handleVideoPlayback(videoItems) {
        const currentVideo = videoItems[0]; // Only play first video if multiple overlap

        if (currentVideo && currentVideo.id !== this.activeVideo?.id) {
            // New video needs to start
            console.log('[PLAYBACK] Starting video:', currentVideo.filename);

            this.activeVideo = currentVideo;

            // Load video in preview
            const videoUrl = `${Config.api.baseUrl}/media/stream/${currentVideo.filename}`;
            this.previewVideo.src = videoUrl;
            this.previewVideo.style.display = 'block';
            this.previewPlaceholder.style.display = 'none';
            this.previewGraphic.style.display = 'none';
            this.playerControls.style.display = 'flex';

            // Calculate playback position within the video
            const videoPlaybackTime = this.currentTime - currentVideo.start;

            this.previewVideo.onloadeddata = () => {
                this.previewVideo.currentTime = videoPlaybackTime;
                this.previewVideo.play().catch(err => {
                    console.error('[PLAYBACK] Video play error:', err);
                });
            };

        } else if (!currentVideo && this.activeVideo) {
            // Video ended, clear it
            console.log('[PLAYBACK] Video ended');
            this.previewVideo.pause();
            this.previewVideo.src = '';
            this.activeVideo = null;
            this.previewVideo.style.display = 'none';
            this.previewPlaceholder.style.display = 'flex';

        } else if (currentVideo && currentVideo.id === this.activeVideo?.id) {
            // Same video playing, ensure it's in sync
            const expectedTime = this.currentTime - currentVideo.start;
            const actualTime = this.previewVideo.currentTime;

            // Sync if drift is more than 0.2 seconds
            if (Math.abs(expectedTime - actualTime) > 0.2) {
                console.log('[PLAYBACK] Syncing video:', { expected: expectedTime, actual: actualTime });
                this.previewVideo.currentTime = expectedTime;
            }

            // Ensure playing
            if (this.previewVideo.paused && this.isPlaying) {
                this.previewVideo.play().catch(err => {
                    console.error('[PLAYBACK] Video play error:', err);
                });
            }
        }
    }

    /**
     * Handle graphics overlay
     */
    handleGraphicsPlayback(graphicsItems) {
        const currentGraphic = graphicsItems[0]; // Show first graphic if multiple

        if (currentGraphic && !this.activeGraphics.find(g => g.id === currentGraphic.id)) {
            // New graphic needs to show
            console.log('[PLAYBACK] Showing graphic:', currentGraphic.filename);

            this.activeGraphics.push(currentGraphic);

            // Load graphic in overlay (iframe on top of video)
            const templateUrl = `http://${Config.server.host}:${Config.server.templatePort}/template/${currentGraphic.filename}?autoshow=1`;

            // Position graphic as overlay
            this.previewGraphic.src = templateUrl;
            this.previewGraphic.style.display = 'block';
            this.previewGraphic.style.position = 'absolute';
            this.previewGraphic.style.top = '0';
            this.previewGraphic.style.left = '0';
            this.previewGraphic.style.width = '1920px';
            this.previewGraphic.style.height = '1080px';
            this.previewGraphic.style.pointerEvents = 'none';
            this.previewGraphic.style.zIndex = '10';
            this.previewGraphic.style.transformOrigin = 'top left';

            // Scale graphic to fit preview window (1920x1080 content)
            const scaleGraphic = () => {
                const container = this.previewGraphic.parentElement;
                const scaleX = container.clientWidth / 1920;
                const scaleY = container.clientHeight / 1080;
                const scale = Math.min(scaleX, scaleY);

                // Center the scaled content
                const translateX = (container.clientWidth - 1920 * scale) / 2;
                const translateY = (container.clientHeight - 1080 * scale) / 2;

                this.previewGraphic.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                console.log('[PLAYBACK] Scaled graphic:', { scale, translateX, translateY });
            };

            // Scale on load
            this.previewGraphic.onload = () => {
                console.log('[PLAYBACK] Graphic loaded, applying scale');
                scaleGraphic();
            };

            // Scale immediately if already loaded
            if (this.previewGraphic.contentWindow) {
                setTimeout(scaleGraphic, 100);
            }

        } else if (!currentGraphic && this.activeGraphics.length > 0) {
            // Graphics ended
            console.log('[PLAYBACK] Graphic ended');
            this.previewGraphic.src = '';
            this.previewGraphic.style.display = 'none';
            this.activeGraphics = [];
        }
    }

    /**
     * Handle audio playback
     */
    handleAudioPlayback(audioItems) {
        // Audio implementation (similar to video)
        // For now, audio plays through the same video element if no video is active
        const currentAudio = audioItems[0];

        if (currentAudio && !this.activeVideo) {
            // Play audio only if no video is playing
            // (video has its own audio track)
            // TODO: Implement separate audio element for audio-only tracks
            console.log('[PLAYBACK] Audio track detected:', currentAudio.filename);
        }
    }

    /**
     * Clear all active media
     */
    clearAllMedia() {
        // Clear video
        if (this.previewVideo) {
            this.previewVideo.pause();
            this.previewVideo.src = '';
            this.previewVideo.style.display = 'none';
        }

        // Clear graphics
        if (this.previewGraphic) {
            this.previewGraphic.src = '';
            this.previewGraphic.style.display = 'none';
        }

        // Show placeholder
        if (this.previewPlaceholder) {
            this.previewPlaceholder.style.display = 'flex';
        }

        // Hide player controls
        if (this.playerControls) {
            this.playerControls.style.display = 'none';
        }

        this.activeVideo = null;
        this.activeGraphics = [];
        this.activeAudio = null;
    }

    /**
     * Update transport button states
     */
    updateTransportButtons() {
        const playBtn = document.getElementById('timeline-play-btn');
        const pauseBtn = document.getElementById('timeline-pause-btn');
        const stopBtn = document.getElementById('timeline-stop-btn');

        if (!playBtn || !pauseBtn || !stopBtn) return;

        if (this.isPlaying && !this.isPaused) {
            playBtn.classList.remove('active');
            pauseBtn.classList.add('active');
            stopBtn.classList.remove('active');
        } else if (this.isPaused) {
            playBtn.classList.add('active');
            pauseBtn.classList.remove('active');
            stopBtn.classList.remove('active');
        } else {
            playBtn.classList.remove('active');
            pauseBtn.classList.remove('active');
            stopBtn.classList.remove('active');
        }
    }

    /**
     * Format time as MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Seek to specific time
     */
    seekTo(seconds) {
        this.currentTime = Math.max(0, Math.min(seconds, this.timeline.totalDuration));
        this.pausedTime = this.currentTime;

        if (this.isPlaying) {
            this.startTimestamp = performance.now() - (this.currentTime * 1000);
        }

        this.updatePlayheadPosition();
        this.orchestrateMedia();

        console.log('[PLAYBACK] Seeked to', this.formatTime(this.currentTime));
    }
}
