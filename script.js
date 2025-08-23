/**
 * AR Lipstick Try-On Application
 * Uses MediaPipe FaceMesh for real-time face detection and lip tracking
 * Applies realistic lipstick effects with customizable colors and opacity
 */

class ARLipstickApp {
    constructor() {
        // Initialize application state
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.faceMesh = null;
        this.camera = null;
        this.isInitialized = false;
        this.currentColor = '#FF6B6B';
        this.opacity = 0.7;
        this.blur = 1;
        this.isLipstickEnabled = true;
        this.detectionActive = false;
        
        // Lip landmark indices for MediaPipe FaceMesh
        // These indices correspond to the lip contour points
        this.lipLandmarks = {
            outerLip: [
                61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318,
                13, 82, 81, 80, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324
            ],
            innerLip: [
                78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 324,
                318, 317, 14, 87, 178, 88, 95, 78
            ],
            upperLip: [61, 84, 17, 314, 405, 320, 307, 375, 321, 308],
            lowerLip: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324]
        };
        
        this.initializeApp();
    }

    /**
     * Initialize the application and set up event listeners
     */
    async initializeApp() {
        try {
            this.setupDOMElements();
            this.setupEventListeners();
            this.updateStatus('Initializing camera...', 'processing');
            await this.initializeCamera();
            await this.initializeFaceMesh();
            this.updateStatus('Ready! Position your face in the camera', 'online');
            this.hideLoading();
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.updateStatus('Failed to initialize. Please check camera permissions.', 'offline');
            this.hideLoading();
        }
    }

    /**
     * Get references to DOM elements
     */
    setupDOMElements() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loading = document.getElementById('loading');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // Control elements
        this.colorPicker = document.getElementById('colorPicker');
        this.opacitySlider = document.getElementById('opacity');
        this.blurSlider = document.getElementById('blur');
        this.opacityValue = document.getElementById('opacityValue');
        this.blurValue = document.getElementById('blurValue');
        this.resetBtn = document.getElementById('resetBtn');
        this.toggleCameraBtn = document.getElementById('toggleCamera');
        this.applyCustomBtn = document.getElementById('applyCustom');
    }

    /**
     * Set up event listeners for user interactions
     */
    setupEventListeners() {
        // Preset color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectPresetColor(e.target.dataset.color);
                this.updateActiveColorButton(e.target);
            });
        });

        // Custom color picker
        this.applyCustomBtn.addEventListener('click', () => {
            this.selectPresetColor(this.colorPicker.value);
            this.clearActiveColorButtons();
        });

        // Settings sliders
        this.opacitySlider.addEventListener('input', (e) => {
            this.opacity = parseFloat(e.target.value);
            this.opacityValue.textContent = this.opacity.toFixed(1);
        });

        this.blurSlider.addEventListener('input', (e) => {
            this.blur = parseInt(e.target.value);
            this.blurValue.textContent = this.blur;
        });

        // Action buttons
        this.resetBtn.addEventListener('click', () => {
            this.resetToNatural();
        });

        this.toggleCameraBtn.addEventListener('click', () => {
            this.toggleCamera();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }

    /**
     * Initialize camera and video stream
     */
    async initializeCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });

            this.video.srcObject = stream;
            
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.resizeCanvas();
                    resolve();
                };
            });
        } catch (error) {
            console.error('Camera initialization failed:', error);
            throw new Error('Camera access denied or not available');
        }
    }

    /**
     * Initialize MediaPipe FaceMesh for face detection
     */
    async initializeFaceMesh() {
        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        // Configure FaceMesh settings for optimal performance
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // Set up result callback
        this.faceMesh.onResults((results) => {
            this.processFaceMeshResults(results);
        });

        // Initialize camera for MediaPipe
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (this.detectionActive) {
                    await this.faceMesh.send({ image: this.video });
                }
            },
            width: 1280,
            height: 720
        });

        await this.camera.start();
        this.detectionActive = true;
        this.isInitialized = true;
    }

    /**
     * Process face detection results and apply lipstick effect
     */
    processFaceMeshResults(results) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            if (this.isLipstickEnabled) {
                this.drawLipstick(landmarks);
            }
            
            // Optional: Draw face mesh for debugging (uncomment if needed)
            // this.drawFaceMesh(landmarks);
        }
    }

    /**
     * Draw lipstick effect on detected lips
     */
    drawLipstick(landmarks) {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Create a separate canvas for the lipstick effect
        const lipCanvas = document.createElement('canvas');
        lipCanvas.width = canvasWidth;
        lipCanvas.height = canvasHeight;
        const lipCtx = lipCanvas.getContext('2d');

        // Draw outer lip contour
        this.drawLipContour(lipCtx, landmarks, this.lipLandmarks.outerLip, canvasWidth, canvasHeight);

        // Apply color, opacity and blur effects
        lipCtx.globalCompositeOperation = 'source-in';
        lipCtx.fillStyle = this.currentColor;
        lipCtx.globalAlpha = this.opacity;
        lipCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Apply blur effect if enabled
        if (this.blur > 0) {
            lipCtx.filter = `blur(${this.blur}px)`;
        }

        // Draw the lipstick onto the main canvas with blending
        this.ctx.globalCompositeOperation = 'multiply';
        this.ctx.globalAlpha = this.opacity;
        this.ctx.drawImage(lipCanvas, 0, 0);
        
        // Reset composite operation
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Draw lip contour using landmark points
     */
    drawLipContour(ctx, landmarks, lipIndices, canvasWidth, canvasHeight) {
        if (lipIndices.length === 0) return;

        ctx.beginPath();
        
        // Move to first point
        const firstPoint = landmarks[lipIndices[0]];
        ctx.moveTo(firstPoint.x * canvasWidth, firstPoint.y * canvasHeight);

        // Draw lines to all other points
        for (let i = 1; i < lipIndices.length; i++) {
            const point = landmarks[lipIndices[i]];
            ctx.lineTo(point.x * canvasWidth, point.y * canvasHeight);
        }

        ctx.closePath();
        ctx.fill();
    }

    /**
     * Optional: Draw face mesh for debugging purposes
     */
    drawFaceMesh(landmarks) {
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.3;

        // Draw all landmark points
        landmarks.forEach(landmark => {
            this.ctx.beginPath();
            this.ctx.arc(
                landmark.x * this.canvas.width,
                landmark.y * this.canvas.height,
                2,
                0,
                2 * Math.PI
            );
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Select and apply a preset lipstick color
     */
    selectPresetColor(color) {
        this.currentColor = color;
        this.isLipstickEnabled = true;
        this.updateStatus('Lipstick applied', 'online');
    }

    /**
     * Update active color button visual state
     */
    updateActiveColorButton(activeBtn) {
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    /**
     * Clear all active color button states
     */
    clearActiveColorButtons() {
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    /**
     * Reset to natural lips (disable lipstick effect)
     */
    resetToNatural() {
        this.isLipstickEnabled = false;
        this.clearActiveColorButtons();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.updateStatus('Reset to natural lips', 'online');
    }

    /**
     * Toggle camera on/off
     */
    async toggleCamera() {
        if (this.detectionActive) {
            this.detectionActive = false;
            this.camera.stop();
            this.updateStatus('Camera stopped', 'offline');
            this.toggleCameraBtn.textContent = 'Start Camera';
        } else {
            this.detectionActive = true;
            await this.camera.start();
            this.updateStatus('Camera started', 'online');
            this.toggleCameraBtn.textContent = 'Stop Camera';
        }
    }

    /**
     * Resize canvas to match video dimensions
     */
    resizeCanvas() {
        if (!this.video || !this.canvas) return;

        const videoRect = this.video.getBoundingClientRect();
        this.canvas.width = this.video.videoWidth || videoRect.width;
        this.canvas.height = this.video.videoHeight || videoRect.height;
        
        // Update canvas display size to match video
        this.canvas.style.width = videoRect.width + 'px';
        this.canvas.style.height = videoRect.height + 'px';
    }

    /**
     * Update status indicator and message
     */
    updateStatus(message, status) {
        this.statusText.textContent = message;
        this.statusIndicator.className = `status-indicator ${status}`;
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.loading.classList.add('hidden');
    }

    /**
     * Show loading indicator
     */
    showLoading() {
        this.loading.classList.remove('hidden');
    }
}

/**
 * Utility functions for color manipulation and effects
 */
class ColorUtils {
    /**
     * Convert hex color to RGB
     */
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Convert RGB to hex
     */
    static rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    /**
     * Blend two colors
     */
    static blendColors(color1, color2, ratio) {
        const rgb1 = this.hexToRgb(color1);
        const rgb2 = this.hexToRgb(color2);
        
        if (!rgb1 || !rgb2) return color1;

        const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio);
        const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio);
        const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio);

        return this.rgbToHex(r, g, b);
    }
}

/**
 * Error handling and fallback functions
 */
class ErrorHandler {
    /**
     * Handle camera access errors
     */
    static handleCameraError(error) {
        console.error('Camera error:', error);
        
        let message = 'Camera access failed. ';
        
        switch (error.name) {
            case 'NotAllowedError':
                message += 'Please allow camera permission and refresh the page.';
                break;
            case 'NotFoundError':
                message += 'No camera found on this device.';
                break;
            case 'NotSupportedError':
                message += 'Camera not supported on this browser.';
                break;
            default:
                message += 'Please check your camera and try again.';
        }
        
        return message;
    }

    /**
     * Handle MediaPipe initialization errors
     */
    static handleMediaPipeError(error) {
        console.error('MediaPipe error:', error);
        return 'Face detection failed to initialize. Please refresh the page.';
    }
}

/**
 * Performance monitoring
 */
class PerformanceMonitor {
    constructor() {
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
    }

    /**
     * Update FPS counter
     */
    update() {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            // Log FPS for debugging (comment out in production)
            // console.log(`FPS: ${this.fps}`);
        }
    }

    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check for required browser features
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support camera access. Please use a modern browser like Chrome, Firefox, or Edge.');
        return;
    }

    // Check for MediaPipe support
    if (typeof FaceMesh === 'undefined') {
        alert('Face detection library failed to load. Please check your internet connection and refresh the page.');
        return;
    }

    // Initialize the AR Lipstick application
    try {
        const app = new ARLipstickApp();
        
        // Initialize performance monitor
        const perfMonitor = new PerformanceMonitor();
        
        // Update performance stats
        setInterval(() => {
            perfMonitor.update();
        }, 100);
        
        console.log('AR Lipstick Try-On initialized successfully!');
        
    } catch (error) {
        console.error('Failed to initialize AR Lipstick app:', error);
        alert('Application failed to start. Please refresh the page and try again.');
    }
});

// Handle page visibility changes to pause/resume detection
document.addEventListener('visibilitychange', () => {
    if (window.app && window.app.isInitialized) {
        if (document.hidden) {
            window.app.detectionActive = false;
        } else {
            window.app.detectionActive = true;
        }
    }
});

// Export classes for potential external use
window.ARLipstickApp = ARLipstickApp;
window.ColorUtils = ColorUtils;
window.ErrorHandler = ErrorHandler;
window.PerformanceMonitor = PerformanceMonitor;
