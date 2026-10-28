/**
 * Live Broadcast - WebRTC Broadcasting
 */

(function() {
    'use strict';

    let socket = null;
    let localStream = null;
    let peerConnections = {}; // {viewer_id: RTCPeerConnection}
    let currentStreamId = null;
    let currentStreamKey = null;

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        if (!AuthAPI.isLoggedIn()) {
            window.location.href = 'login.html';
            return;
        }

        await loadUserMatches();
        setupEventListeners();
    }

    async function loadUserMatches() {
        try {
            const params = new URLSearchParams(window.location.search);
            const targetMatchId = params.get('matchId');

            const user = UserSession.getCurrentUser();
            let userMatches = [];

            if (targetMatchId) {
                // Fetch specific match
                const matchRes = await MatchesAPI.getById(targetMatchId);
                if (matchRes.match) {
                    userMatches.push(matchRes.match);
                }
            } else {
                // Fetch upcoming/live matches
                const result = await MatchesAPI.list({ status: 'all' });
                const matches = result.matches || [];
                
                // Filter matches where user is captain or participant, and status allows broadcasting
                userMatches = matches.filter(m => {
                    const isCaptain = m.captainId === user.id || (m.captain && m.captain.id === user.id);
                    const isPlayer = m.players && m.players.some(p => p.id === user.id);
                    // 'open' and 'full' = upcoming matches, 'live' = in progress
                    return (isCaptain || isPlayer) && ['open', 'full', 'live', 'upcoming'].includes(m.status);
                });
            }

            const select = document.getElementById('matchSelect');
            if (userMatches.length === 0) {
                select.innerHTML = '<option value="">No matches available to broadcast</option>';
                document.getElementById('btnStartBroadcast').disabled = true;
            } else {
                select.innerHTML = userMatches.map(m => 
                    `<option value="${m.id}">${m.title} - ${formatDate(new Date(m.dateTime))}</option>`
                ).join('');
                
                if (targetMatchId) {
                    select.value = targetMatchId;
                    select.disabled = true; // Lock the selection to the requested match
                } else if (userMatches.length > 1) {
                    select.innerHTML = '<option value="">Select a match</option>' + select.innerHTML;
                }
            }
        } catch (err) {
            Toast.error('Failed to load matches');
            console.error(err);
            
            const select = document.getElementById('matchSelect');
            if (select) {
                select.innerHTML = '<option value="">Error loading matches</option>';
                document.getElementById('btnStartBroadcast').disabled = true;
            }
        }
    }

    function setupEventListeners() {
        document.getElementById('btnStartBroadcast').addEventListener('click', startBroadcast);
        document.getElementById('btnStopBroadcast').addEventListener('click', stopBroadcast);
    }

    async function startBroadcast() {
        const matchId = document.getElementById('matchSelect').value;
        const cameraLabel = document.getElementById('cameraLabel').value.trim();

        if (!matchId) {
            Toast.error('Please select a match');
            return;
        }

        try {
            // Get camera access
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true
            });

            document.getElementById('localVideo').srcObject = localStream;

            // Start stream on backend
            const result = await API.post('/livestream/start', {
                match_id: parseInt(matchId),
                camera_label: cameraLabel || 'Camera 1'
            });

            currentStreamId = result.stream.id;
            currentStreamKey = result.stream.stream_key;

            // Connect to signaling server
            connectToSignalingServer();

            // Update UI
            document.getElementById('setupSection').style.display = 'none';
            document.getElementById('broadcastSection').style.display = 'block';

            Toast.success('🔴 Broadcasting started!');
        } catch (err) {
            Toast.error(err.message || 'Failed to start broadcast');
            console.error(err);
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
        }
    }

    function connectToSignalingServer() {
        socket = io(window.BACKEND_URL || 'http://localhost:5000');

        socket.on('connect', () => {
            console.log('Connected to signaling server');
            socket.emit('start_broadcast', { stream_key: currentStreamKey });
        });

        socket.on('viewer_joined', async (data) => {
            console.log('Viewer joined:', data.viewer_id);
            document.getElementById('viewerCount').textContent = data.viewer_count;
            await createPeerConnection(data.viewer_id);
        });

        socket.on('viewer_left', (data) => {
            console.log('Viewer left:', data.viewer_id);
            document.getElementById('viewerCount').textContent = data.viewer_count;
            if (peerConnections[data.viewer_id]) {
                peerConnections[data.viewer_id].close();
                delete peerConnections[data.viewer_id];
            }
        });

        socket.on('answer', async (data) => {
            const pc = peerConnections[data.viewer_id];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        socket.on('ice_candidate', async (data) => {
            const pc = peerConnections[data.from];
            if (pc && data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });
    }

    async function createPeerConnection(viewerId) {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnections[viewerId] = pc;

        // Add local stream tracks
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice_candidate', {
                    target: viewerId,
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('offer', {
            target: viewerId,
            offer: offer,
            stream_key: currentStreamKey
        });
    }

    async function stopBroadcast() {
        try {
            // 1. Stop stream on backend FIRST (before any cleanup that might throw)
            if (currentStreamId) {
                try {
                    await API.post(`/livestream/stop/${currentStreamId}`);
                } catch (apiErr) {
                    console.warn('Backend stop error (continuing cleanup):', apiErr);
                }
                currentStreamId = null;
                currentStreamKey = null;
            }

            // 2. Notify signaling server and close peer connections
            if (socket) {
                socket.emit('stop_broadcast', { stream_key: currentStreamKey });
                socket.disconnect();
                socket = null;
            }
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};

            // 3. Stop local media tracks LAST
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            // Reset UI
            document.getElementById('setupSection').style.display = 'block';
            document.getElementById('broadcastSection').style.display = 'none';
            document.getElementById('localVideo').srcObject = null;

            Toast.success('Broadcast stopped');
        } catch (err) {
            Toast.error('Failed to stop broadcast: ' + (err.message || err));
            console.error(err);
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (localStream) {
            stopBroadcast();
        }
    });

})();
