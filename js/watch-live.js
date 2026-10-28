/**
 * Watch Live - WebRTC Viewer with Multi-Camera Support
 */

(function() {
    'use strict';

    let socket = null;
    let peerConnections = {}; // {stream_key: RTCPeerConnection}
    let activeStreams = [];
    let currentStreamKey = null;

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        await loadCities();
        await loadActiveStreams();
        setupEventListeners();
        connectToSignalingServer();
    }

    async function loadCities() {
        try {
            const result = await API.get('/livestream/cities');
            const cities = result.cities || [];
            
            const select = document.getElementById('cityFilter');
            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                option.textContent = city;
                select.appendChild(option);
            });
        } catch (err) {
            console.error('Failed to load cities:', err);
        }
    }

    async function loadActiveStreams(city = '') {
        try {
            const url = city ? `/livestream/active?city=${encodeURIComponent(city)}` : '/livestream/active';
            const result = await API.get(url, { auth: false });
            activeStreams = result.streams || [];
            renderStreams();
        } catch (err) {
            Toast.error('Failed to load live streams');
            console.error(err);
        }
    }

    function renderStreams() {
        const container = document.getElementById('streamsContainer');
        
        if (activeStreams.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align: center; padding: var(--space-8);">
                    <p style="font-size: 3rem; margin-bottom: var(--space-4);">📺</p>
                    <h3>No Live Streams</h3>
                    <p style="color: var(--text-secondary);">There are no active broadcasts right now. Check back later!</p>
                </div>
            `;
            return;
        }

        // Group streams by match
        const streamsByMatch = {};
        activeStreams.forEach(stream => {
            const matchId = stream.match.id;
            if (!streamsByMatch[matchId]) {
                streamsByMatch[matchId] = {
                    match: stream.match,
                    streams: []
                };
            }
            streamsByMatch[matchId].streams.push(stream);
        });

        container.innerHTML = Object.values(streamsByMatch).map(group => `
            <div class="card card-glow" style="margin-bottom: var(--space-8); padding: var(--space-4); background: var(--glass-bg); backdrop-filter: blur(12px); border: 1px solid var(--glass-border);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-3);">
                    <div>
                        <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
                            <span class="sport-badge ${group.match.sport}" style="padding: var(--space-1) var(--space-3); font-size: 0.85rem;">
                                ${getSportById(group.match.sport).icon} ${getSportById(group.match.sport).name}
                            </span>
                            <h2 style="margin: 0; font-size: 1.5rem;">${group.match.title}</h2>
                        </div>
                        <p style="color: var(--text-secondary); margin: 0; display: flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            ${group.match.location_name}, ${group.match.city}
                        </p>
                    </div>
                </div>
                
                <!-- Video Container -->
                <div id="videoContainer_${group.match.id}" style="position: relative; background: #0a0a0a; border-radius: 16px; overflow: hidden; margin-bottom: var(--space-4); box-shadow: 0 8px 32px rgba(0,0,0,0.4); aspect-ratio: 16/9;">
                    <video id="video_${group.match.id}" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover; display: block;"></video>
                    
                    <!-- Top Overlays -->
                    <div style="position: absolute; top: 16px; left: 16px; display: flex; gap: var(--space-2);">
                        <div style="background: rgba(239, 68, 68, 0.9); color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; backdrop-filter: blur(4px); box-shadow: 0 2px 10px rgba(239, 68, 68, 0.3);">
                            <div style="width: 8px; height: 8px; background: white; border-radius: 50%; box-shadow: 0 0 10px white; animation: pulse 2s infinite;"></div>
                            LIVE
                        </div>
                    </div>
                </div>

                <!-- Footer (Cameras & Viewers) -->
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg);">
                    ${group.streams.length > 1 ? `
                        <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; flex: 1;">
                            ${group.streams.map((stream, idx) => `
                                <button 
                                    class="btn ${idx === 0 ? 'btn-primary' : 'btn-secondary'} camera-switch-btn"
                                    style="padding: var(--space-2) var(--space-4); border-radius: 20px; font-size: 0.9rem; transition: all 0.3s;"
                                    data-stream-key="${stream.stream_key}"
                                    data-match-id="${group.match.id}"
                                    onclick="window.switchCamera('${stream.stream_key}', ${group.match.id})">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: text-bottom;">
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                        <circle cx="12" cy="13" r="4"/>
                                    </svg>
                                    ${stream.camera_label}
                                </button>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-weight: 500;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                            </svg>
                            ${group.streams[0].camera_label}
                        </div>
                    `}
                    
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); background: var(--bg-card); padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        ${group.streams.reduce((acc, curr) => acc + curr.viewer_count, 0)} viewers
                    </div>
                </div>
            </div>
        `).join('');

        // Auto-connect to first stream of each match
        Object.values(streamsByMatch).forEach(group => {
            if (group.streams.length > 0) {
                connectToStream(group.streams[0].stream_key, group.match.id);
            }
        });
    }

    function setupEventListeners() {
        document.getElementById('cityFilter').addEventListener('change', (e) => {
            loadActiveStreams(e.target.value);
        });
    }

    function connectToSignalingServer() {
        socket = io(window.BACKEND_URL || 'http://localhost:5000');

        socket.on('connect', () => {
            console.log('Connected to signaling server');
        });

        socket.on('broadcaster_info', async (data) => {
            console.log('Broadcaster info received:', data);
        });

        socket.on('offer', async (data) => {
            const pc = peerConnections[data.stream_key];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit('answer', {
                    target: data.broadcaster_id,
                    answer: answer
                });
            }
        });

        socket.on('ice_candidate', async (data) => {
            const pc = Object.values(peerConnections).find(p => p.remoteId === data.from);
            if (pc && data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        socket.on('broadcaster_left', (data) => {
            Toast.warning('Broadcaster has ended the stream');
            if (peerConnections[data.stream_key]) {
                peerConnections[data.stream_key].close();
                delete peerConnections[data.stream_key];
            }
            setTimeout(() => loadActiveStreams(), 2000);
        });
    }

    async function connectToStream(streamKey, matchId) {
        if (peerConnections[streamKey]) {
            return; // Already connected
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnections[streamKey] = pc;
        pc.streamKey = streamKey;

        pc.ontrack = (event) => {
            const video = document.getElementById(`video_${matchId}`);
            if (video) {
                video.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    target: pc.remoteId,
                    candidate: event.candidate
                });
            }
        };

        socket.emit('join_stream', { stream_key: streamKey });
    }

    window.switchCamera = async function(streamKey, matchId) {
        // Disconnect from current stream for this match
        const currentKey = currentStreamKey;
        if (currentKey && peerConnections[currentKey]) {
            socket.emit('leave_stream', { stream_key: currentKey });
            peerConnections[currentKey].close();
            delete peerConnections[currentKey];
        }

        // Update button states
        document.querySelectorAll(`[data-match-id="${matchId}"]`).forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.closest('button').classList.add('active');

        // Connect to new stream
        currentStreamKey = streamKey;
        await connectToStream(streamKey, matchId);
        
        Toast.success('Camera switched');
    };

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        Object.values(peerConnections).forEach(pc => pc.close());
        if (socket) socket.disconnect();
    });

})();
