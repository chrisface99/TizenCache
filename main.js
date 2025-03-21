// Global variables
let videoUrls = [];
let currentVideoIndex = -1;
let isPlaying = false;
let fileSystemAccessAvailable = false;

// DOM Elements
const jsonInput = document.getElementById('jsonInput');
const loadBtn = document.getElementById('loadBtn');
const cacheBtn = document.getElementById('cacheBtn');
const refreshBtn = document.getElementById('refreshBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const videoPlayer = document.getElementById('videoPlayer');
const playlistItems = document.getElementById('playlistItems');
const consoleArea = document.getElementById('consoleArea');
const loadFromFileBtn = document.getElementById('loadFromFileBtn');
const saveToFileBtn = document.getElementById('saveToFileBtn');
const exportLogBtn = document.getElementById('exportLogBtn');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const copyLogBtn = document.getElementById('copyLogBtn');

// Create a proper cache for video files
const VIDEO_CACHE_DIR = 'wgt-private/cache/videos';
let cacheDirHandle = null;

// Load last input from localStorage if available
if (localStorage.getItem('last-json-input')) {
    jsonInput.value = localStorage.getItem('last-json-input');
}

// Console logging function
function logToConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = 'console-line';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = `[${timestamp}]`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = `console-${type}`;
    messageSpan.textContent = message;
    
    logLine.appendChild(timeSpan);
    logLine.appendChild(document.createTextNode(' '));
    logLine.appendChild(messageSpan);
    
    consoleArea.appendChild(logLine);
    consoleArea.scrollTop = consoleArea.scrollHeight;
}

// Show message function
function showMessage(message, type) {
    const messageElement = document.getElementById('message');
    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
    messageElement.style.display = 'block';
    
    // Hide message after 5 seconds
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 5000);
}

// Enhanced Tizen initialization
function initTizenFeatures() {
    try {
        // Check if Tizen API is available
        if (typeof tizen !== 'undefined') {
            logToConsole('Tizen API detected, configuring for Tizen platform', 'success');
            
            // Initialize cache directory
            initCacheDirectory();
            
            // Load cache status on startup
            loadCacheStatus();
            
            // Set screen always on while playing
            try {
                tizen.power.request("SCREEN", "SCREEN_NORMAL");
                logToConsole('Screen set to always on while app is running', 'success');
            } catch (e) {
                logToConsole('Failed to set screen always on: ' + e.message, 'error');
            }
            
            // Override file system availability flag
            fileSystemAccessAvailable = true;
            
            return true;
        } else {
            logToConsole('Tizen API not detected, running in standard browser mode', 'info');
            return false;
        }
    } catch (error) {
        logToConsole('Error initializing Tizen features: ' + error.message, 'error');
        return false;
    }
}

// Initialize cache directory
function initCacheDirectory() {
    try {
        tizen.filesystem.resolve(
            'documents',  // Use a standard location like 'documents' as base
            function(documentsDir) {
                // First check if our cache directory already exists
                try {
                    cacheDirHandle = documentsDir.resolve(VIDEO_CACHE_DIR);
                    logToConsole(`Cache directory accessed: ${VIDEO_CACHE_DIR}`, 'success');
                } catch (resolveError) {
                    // Directory doesn't exist, create it
                    try {
                        cacheDirHandle = documentsDir.createDirectory(VIDEO_CACHE_DIR);
                        logToConsole(`Cache directory created: ${VIDEO_CACHE_DIR}`, 'success');
                    } catch (createError) {
                        logToConsole(`Failed to create cache directory: ${createError.message}`, 'error');
                    }
                }
            },
            function(error) {
                logToConsole(`Error accessing documents directory: ${error.message}`, 'error');
            },
            'rw'  // Access mode: read and write
        );
    } catch (error) {
        logToConsole(`Error initializing cache directory: ${error.message}`, 'error');
    }
}

// Check if a URL is cached
async function isUrlCached(url) {
    const cacheData = localStorage.getItem(`video-cached-${url}`);
    
    if (!cacheData) {
        return false;
    }
    
    try {
        // Parse the cache data
        const cacheInfo = JSON.parse(cacheData);
        
        // For Tizen environment, verify that the cached file still exists
        if (typeof tizen !== 'undefined') {
            try {
                tizen.filesystem.resolve(
                    cacheInfo.cachedPath,
                    function(file) {
                        return true;
                    },
                    function(error) {
                        // File doesn't exist anymore
                        localStorage.removeItem(`video-cached-${url}`);
                        return false;
                    },
                    'r'
                );
            } catch (error) {
                return false;
            }
        }
        
        // If we got here, the file exists or we're not in Tizen
        return true;
    } catch (error) {
        // Invalid cache data
        localStorage.removeItem(`video-cached-${url}`);
        return false;
    }
}

// Handle Load Playlist button
loadBtn.addEventListener('click', () => {
    try {
        // Get JSON from textarea
        const jsonText = jsonInput.value.trim();
        
        if (!jsonText) {
            showMessage('Please enter JSON data or URL list', 'error');
            return;
        }
        
        // Try to parse JSON
        try {
            videoUrls = JSON.parse(jsonText);
            
            // Handle case where JSON is not an array
            if (!Array.isArray(videoUrls)) {
                showMessage('Invalid JSON format. Expected array of URLs', 'error');
                return;
            }
            
            logToConsole(`Loaded ${videoUrls.length} video URLs`, 'success');
        } catch (e) {
            // Check if it's a list of URLs, one per line
            videoUrls = jsonText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
                
            if (videoUrls.length === 0) {
                showMessage('Invalid input format. Please enter valid JSON or URL list', 'error');
                return;
            }
            
            logToConsole(`Loaded ${videoUrls.length} video URLs from text format`, 'success');
        }
        
        // Save to localStorage
        localStorage.setItem('last-json-input', jsonInput.value);
        
        // Enable buttons
        cacheBtn.disabled = false;
        refreshBtn.disabled = false;
        
        // Display playlist
        displayPlaylist();
        
        // Check cached status
        refreshCacheStatus();
        
        // Check if playback is available
        checkPlaybackAvailability();
        
        showMessage(`Loaded ${videoUrls.length} videos into playlist`, 'success');
    } catch (error) {
        logToConsole(`Error loading playlist: ${error.message}`, 'error');
        showMessage('Error loading playlist: ' + error.message, 'error');
    }
});

// Display playlist function
function displayPlaylist() {
    // Clear existing items
    playlistItems.innerHTML = '';
    
    if (videoUrls.length === 0) {
        playlistItems.innerHTML = '<div class="playlist-item">No videos in playlist</div>';
        return;
    }
    
    // Create new playlist items
    videoUrls.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        
        const urlSpan = document.createElement('div');
        urlSpan.className = 'video-url';
        urlSpan.textContent = url;
        
        const statusSpan = document.createElement('span');
        statusSpan.id = `status-${index}`;
        statusSpan.className = 'cache-status status-not-cached';
        statusSpan.textContent = 'Not Cached';
        
        item.appendChild(urlSpan);
        item.appendChild(statusSpan);
        
        // Add click event to play the video
        item.addEventListener('click', () => {
            if (isPlaying) {
                currentVideoIndex = index;
                playVideo(currentVideoIndex);
            }
        });
        
        playlistItems.appendChild(item);
    });
}

// Refresh cache status
async function refreshCacheStatus() {
    if (videoUrls.length === 0) {
        return;
    }
    
    logToConsole('Refreshing cache status...', 'info');
    
    for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        const statusElement = document.getElementById(`status-${i}`);
        
        if (!statusElement) continue;
        
        try {
            const cached = await isUrlCached(url);
            
            if (cached) {
                statusElement.textContent = 'Cached';
                statusElement.className = 'cache-status status-cached';
            } else {
                statusElement.textContent = 'Not Cached';
                statusElement.className = 'cache-status status-not-cached';
            }
        } catch (error) {
            statusElement.textContent = 'Error';
            statusElement.className = 'cache-status status-not-cached';
        }
    }
    
    logToConsole('Cache status refreshed', 'success');
}

// Improved caching function that actually stores video data
async function cacheVideo(url, index) {
    const statusElement = document.getElementById(`status-${index}`);
    if (statusElement) {
        statusElement.textContent = 'Caching...';
        statusElement.className = 'cache-status status-caching';
    }

    logToConsole(`Attempting to cache video ${index + 1}: ${url}`, 'info');

    try {
        // Create a unique filename for the cached video
        const fileName = `video_${index}_${Date.now()}.mp4`;

        // Fetch the video data
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the video data as ArrayBuffer
        const videoData = await response.arrayBuffer();

        // Create destination file in cache directory
        if (!cacheDirHandle) {
            throw new Error('Cache directory not initialized');
        }

        const newFile = cacheDirHandle.createFile(fileName);

        // Write to destination file
        const destStream = newFile.openStream('w');
        destStream.write(new Uint8Array(videoData));
        destStream.close();

        // Store the mapping of original URL to cached file
        const cacheData = {
            originalUrl: url,
            cachedPath: `${VIDEO_CACHE_DIR}/${fileName}`,
            timestamp: Date.now()
        };

        localStorage.setItem(`video-cached-${url}`, JSON.stringify(cacheData));

        logToConsole(`Successfully cached file ${url} to ${fileName}`, 'success');

        if (statusElement) {
            statusElement.textContent = 'Cached';
            statusElement.className = 'cache-status status-cached';
        }
    } catch (error) {
        logToConsole(`Error caching video ${url}: ${error.message}`, 'error');
        if (statusElement) {
            statusElement.textContent = 'Cache Failed';
            statusElement.className = 'cache-status status-not-cached';
        }
    }
}

// Improved cache button handler
cacheBtn.addEventListener('click', async () => {
    if (videoUrls.length === 0) {
        showMessage('No videos to cache', 'error');
        return;
    }

    showMessage('Starting to cache videos...', 'success');

    // Make sure cache directory is initialized
    if (!cacheDirHandle) {
        initCacheDirectory();
    }

    // Cache each video
    for (let i = 0; i < videoUrls.length; i++) {
        await cacheVideo(videoUrls[i], i);
    }

    // Save cache status to file
    await saveCacheStatus();

    // Update playback availability
    checkPlaybackAvailability();

    logToConsole('Caching process complete', 'success');
    showMessage('Caching process complete', 'success');
});

// Refresh cache status button handler
refreshBtn.addEventListener('click', () => {
    refreshCacheStatus();
});

// Check if playback is available
function checkPlaybackAvailability() {
    if (videoUrls.length === 0) {
        startBtn.disabled = true;
        return;
    }
    
    let anyCached = false;
    
    for (let i = 0; i < videoUrls.length; i++) {
        const cacheData = localStorage.getItem(`video-cached-${videoUrls[i]}`);
        if (cacheData) {
            anyCached = true;
            break;
        }
    }
    
    startBtn.disabled = !anyCached;
    
    if (!anyCached) {
        logToConsole('No cached videos available for playback', 'info');
    } else {
        logToConsole('Cached videos available for playback', 'success');
    }
}

// Start playback button handler
startBtn.addEventListener('click', () => {
    if (videoUrls.length === 0) {
        showMessage('No videos to play', 'error');
        return;
    }
    
    // Find first cached video
    for (let i = 0; i < videoUrls.length; i++) {
        const cacheData = localStorage.getItem(`video-cached-${videoUrls[i]}`);
        if (cacheData) {
            // Start playing from this index
            currentVideoIndex = i;
            break;
        }
    }
    
    if (currentVideoIndex === -1) {
        showMessage('No cached videos to play', 'error');
        return;
    }
    
    // Start playback
    isPlaying = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    logToConsole('Starting video playback', 'success');
    showMessage('Starting video playback', 'success');
    
    // Play the video
    playVideo(currentVideoIndex);
});

// Stop playback button handler
stopBtn.addEventListener('click', () => {
    isPlaying = false;
    videoPlayer.pause();
    videoPlayer.src = '';
    
    stopBtn.disabled = true;
    startBtn.disabled = false;
    
    // Remove highlighting
    const playlistItems = document.querySelectorAll('.playlist-item');
    playlistItems.forEach(item => {
        item.classList.remove('now-playing');
    });
    
    logToConsole('Playback stopped', 'info');
    showMessage('Playback stopped', 'success');
});

// Video ended event handler
videoPlayer.addEventListener('ended', () => {
    if (!isPlaying) return;
    
    logToConsole('Video ended, playing next video', 'info');
    
    // Play next video
    currentVideoIndex++;
    playVideo(currentVideoIndex);
});

// Improved function to play video with proper handling of cached videos
async function playVideo(index) {
    if (!isPlaying || index >= videoUrls.length) {
        if (index >= videoUrls.length) {
            logToConsole('End of playlist reached', 'info');
            showMessage('End of playlist reached', 'success');
            
            // Reset playing state
            isPlaying = false;
            stopBtn.disabled = true;
            startBtn.disabled = false;
        }
        return;
    }

    const url = videoUrls[index];
    const cached = await isUrlCached(url);

    if (cached) {
        // Play the cached video
        try {
            const cacheData = JSON.parse(localStorage.getItem(`video-cached-${url}`));
            const cachedPath = cacheData.cachedPath;

            // Resolve the cached file
            tizen.filesystem.resolve(
                cachedPath,
                function(file) {
                    // Play the file
                    videoPlayer.src = `file://${cachedPath}`;
                    videoPlayer.play();
                    
                    // Update UI
                    currentVideoIndex = index;

                    // Highlight current video
                    const playlistItems = document.querySelectorAll('.playlist-item');
                    playlistItems.forEach((item, i) => {
                        if (i === index) {
                            item.classList.add('now-playing');
                        } else {
                            item.classList.remove('now-playing');
                        }
                    });
                    
                    logToConsole(`Now playing cached video ${index + 1}: ${url}`, 'success');
                },
                function(error) {
                    logToConsole(`Error playing cached video: ${error.message}`, 'error');
                    // Try next video
                    playVideo(index + 1);
                },
                'r'
            );
        } catch (error) {
            logToConsole(`Error playing cached video: ${error.message}`, 'error');
            // Try next video
            playVideo(index + 1);
        }
    } else {
        // Stream the video if not cached
        videoPlayer.src = url;
        videoPlayer.play();
        
        // Update UI
        currentVideoIndex = index;

        // Highlight current video
        const playlistItems = document.querySelectorAll('.playlist-item');
        playlistItems.forEach((item, i) => {
            if (i === index) {
                item.classList.add('now-playing');
            } else {
                item.classList.remove('now-playing');
            }
        });
        
        logToConsole(`Now playing streamed video ${index + 1}: ${url}`, 'info');
    }
}

// Improved function to clear cache
clearBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear the entire video cache?')) {
        try {
            // Clear localStorage cache markers
            for (const key in localStorage) {
                if (key.startsWith('video-cached-')) {
                    localStorage.removeItem(key);
                }
            }
            
            logToConsole('LocalStorage cache markers cleared', 'success');
            
            // Delete all files in the cache directory if on Tizen
            if (typeof tizen !== 'undefined' && cacheDirHandle) {
                const files = cacheDirHandle.listFiles();
                
                for (let i = 0; i < files.length; i++) {
                    try {
                        files[i].deleteFile();
                        logToConsole(`Deleted cached file: ${files[i].name}`, 'info');
                    } catch (e) {
                        logToConsole(`Failed to delete cached file ${files[i].name}: ${e.message}`, 'error');
                    }
                }
                
                // Delete cache file if it exists
                tizen.filesystem.resolve(
                    'documents',
                    function (documentsDir) {
                        try {
                            let cacheFile = documentsDir.resolve('cachedVideoUrls.json');
                            cacheFile.deleteFile();
                            logToConsole('Cache status file deleted', 'success');
                        } catch (e) {
                            logToConsole('Cache status file not found, nothing to delete', 'info');
                        }
                    },
                    function (error) {
                        logToConsole('Error accessing documents directory: ' + error.message, 'error');
                    },
                    'rw'
                );
            }
            
            // Update UI
            refreshCacheStatus();
            checkPlaybackAvailability();
            
            showMessage('Cache cleared successfully', 'success');
        } catch (error) {
            logToConsole(`Error clearing cache: ${error.message}`, 'error');
            showMessage('Error clearing cache: ' + error.message, 'error');
        }
    }
});

// Improved function to save cache status
async function saveCacheStatus() {
    try {
        logToConsole('Saving cache status to file...', 'info');
        
        // Only attempt to save to file if on Tizen
        if (typeof tizen === 'undefined') {
            logToConsole('Not on Tizen platform, cache status only saved to localStorage', 'info');
            return;
        }
        
        // Create an object with detailed cache status data
        const cacheData = {};
        
        for (const key in localStorage) {
            if (key.startsWith('video-cached-')) {
                const url = key.substring('video-cached-'.length);
                try {
                    cacheData[url] = JSON.parse(localStorage.getItem(key));
                } catch (e) {
                    // Handle legacy format
                    cacheData[url] = {
                        originalUrl: url,
                        legacy: true,
                        timestamp: Date.now()
                    };
                }
            }
        }
        
        // Convert to JSON
        const cacheJson = JSON.stringify(cacheData, null, 2);
        
        // Get the documents directory
        tizen.filesystem.resolve(
            'documents',
            function(documentsDir) {
                try {
                    // Check if file exists and delete it if it does
                    try {
                        let existingFile = documentsDir.resolve('cachedVideoUrls.json');
                        existingFile.deleteFile();
                    } catch (e) {
                        // File doesn't exist, which is fine
                    }
                    
                    // Create new file
                    let cacheFile = documentsDir.createFile('cachedVideoUrls.json');
                    
                    // Write content to file
                    let fileStream = cacheFile.openStream('w');
                    fileStream.write(cacheJson);
                    fileStream.close();
                    
                    logToConsole('Successfully saved cache status to documents/cachedVideoUrls.json', 'success');
                } catch (error) {
                    logToConsole('Error writing cache status file: ' + error.message, 'error');
                }
            },
            function(error) {
                logToConsole('Error accessing documents directory: ' + error.message, 'error');
            },
            'rw'
        );
    } catch (err) {
        logToConsole('Tizen file system error when saving cache status: ' + err.message, 'error');
    }
}

// Improved function to load cache status
async function loadCacheStatus() {
    try {
        logToConsole('Loading cache status from file...', 'info');
        
        // Get the documents directory
        tizen.filesystem.resolve(
            'documents',
            function(documentsDir) {
                try {
                    // Check if the file exists
                    let cacheFile;
                    try {
                        cacheFile = documentsDir.resolve('cachedVideoUrls.json');
                    } catch (e) {
                        logToConsole('Cache status file not found, starting with empty cache', 'info');
                        return;
                    }
                    
                    // Open file for reading
                    let fileStream = cacheFile.openStream('r');
                    let fileContent = '';
                    
                    // Read file content
                    fileContent = fileStream.read(cacheFile.fileSize);
                    fileStream.close();
                    
                    // Parse JSON
                    const cacheData = JSON.parse(fileContent);
                    
                    // Update localStorage with cache status
                    for (const url in cacheData) {
                        // Also verify that the cached file still exists
                        try {
                            const cacheInfo = cacheData[url];
                            
                            if (cacheInfo.cachedPath) {
                                tizen.filesystem.resolve(
                                    cacheInfo.cachedPath,
                                    function(file) {
                                        // File exists, update localStorage
                                        localStorage.setItem(`video-cached-${url}`, JSON.stringify(cacheInfo));
                                        logToConsole(`Verified cached file: ${cacheInfo.cachedPath}`, 'info');
                                    },
                                    function(error) {
                                        // File doesn't exist, don't add to localStorage
                                        logToConsole(`Cached file not found: ${cacheInfo.cachedPath}`, 'error');
                                    },
                                    'r'
                                );
                            } else if (cacheInfo.legacy) {
                                // Handle legacy format
                                localStorage.setItem(`video-cached-${url}`, 'true');
                            }
                        } catch (e) {
                            logToConsole(`Error verifying cache for ${url}: ${e.message}`, 'error');
                        }
                    }
                    
                    logToConsole('Successfully loaded cache status from file', 'success');
                    
                    // Refresh cache status display
                    if (videoUrls.length > 0) {
                        refreshCacheStatus();
                    }
                } catch (error) {
                    logToConsole('Error reading cache status file: ' + error.message, 'error');
                }
            },
            function(error) {
                logToConsole('Error accessing documents directory: ' + error.message, 'error');
            },
            'r'
        );
    } catch (err) {
        logToConsole('Tizen file system error when loading cache status: ' + err.message, 'error');
    }
}

// Add event listener for app startup
window.addEventListener('load', function() {
    // Initialize Tizen features
    const tizenAvailable = initTizenFeatures();
    
    if (tizenAvailable) {
        // Setup app lifecycle handlers
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                // App is being hidden
                logToConsole('App entering background', 'info');
                
                // Save cache status
                saveCacheStatus();
                
                // If playing, pause the video
                if (isPlaying && !videoPlayer.paused) {
                    videoPlayer.pause();
                    logToConsole('Playback paused due to app entering background', 'info');
                }
            } else {
                // App is visible again
                logToConsole('App returning to foreground', 'info');
                
                // If we were playing before, resume
                if (isPlaying && videoPlayer.paused) {
                    videoPlayer.play();
                    logToConsole('Playback resumed', 'info');
                }
            }
        });
    }
});