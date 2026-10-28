"""
WebSocket Signaling Server for WebRTC
Handles peer-to-peer connection signaling for live streaming
"""
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request

# This will be initialized in app.py
socketio = None

# Store active connections
active_streams = {}  # {stream_key: {broadcaster: sid, viewers: [sid]}}

def init_socketio(app):
    """Initialize SocketIO with the Flask app"""
    global socketio
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')
    
    @socketio.on('connect')
    def handle_connect():
        print(f"\n🔌 Client connected: {request.sid}\n")
        emit('connected', {'sid': request.sid})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        print(f"\n🔌 Client disconnected: {request.sid}\n")
        # Clean up any streams this client was part of
        for stream_key, data in list(active_streams.items()):
            if data.get('broadcaster') == request.sid:
                # Broadcaster disconnected
                emit('broadcaster_left', {'stream_key': stream_key}, room=stream_key)
                del active_streams[stream_key]
            elif request.sid in data.get('viewers', []):
                # Viewer disconnected
                data['viewers'].remove(request.sid)
    
    @socketio.on('start_broadcast')
    def handle_start_broadcast(data):
        """Broadcaster starts streaming"""
        stream_key = data.get('stream_key')
        if not stream_key:
            return
        
        join_room(stream_key)
        active_streams[stream_key] = {
            'broadcaster': request.sid,
            'viewers': []
        }
        
        print(f"\n📡 Broadcast started: {stream_key} by {request.sid}\n")
        emit('broadcast_started', {'stream_key': stream_key})
    
    @socketio.on('stop_broadcast')
    def handle_stop_broadcast(data):
        """Broadcaster stops streaming"""
        stream_key = data.get('stream_key')
        if not stream_key or stream_key not in active_streams:
            return
        
        # Notify all viewers
        emit('broadcaster_left', {'stream_key': stream_key}, room=stream_key)
        
        leave_room(stream_key)
        if stream_key in active_streams:
            del active_streams[stream_key]
        
        print(f"\n📡 Broadcast stopped: {stream_key}\n")
    
    @socketio.on('join_stream')
    def handle_join_stream(data):
        """Viewer joins a stream"""
        stream_key = data.get('stream_key')
        if not stream_key or stream_key not in active_streams:
            emit('error', {'message': 'Stream not found'})
            return
        
        join_room(stream_key)
        active_streams[stream_key]['viewers'].append(request.sid)
        
        # Notify broadcaster about new viewer
        broadcaster_sid = active_streams[stream_key]['broadcaster']
        emit('viewer_joined', {
            'viewer_id': request.sid,
            'viewer_count': len(active_streams[stream_key]['viewers'])
        }, room=broadcaster_sid)
        
        # Send broadcaster info to viewer
        emit('broadcaster_info', {
            'broadcaster_id': broadcaster_sid
        })
        
        print(f"\n👁️ Viewer {request.sid} joined stream: {stream_key}\n")
    
    @socketio.on('leave_stream')
    def handle_leave_stream(data):
        """Viewer leaves a stream"""
        stream_key = data.get('stream_key')
        if not stream_key or stream_key not in active_streams:
            return
        
        leave_room(stream_key)
        if request.sid in active_streams[stream_key]['viewers']:
            active_streams[stream_key]['viewers'].remove(request.sid)
        
        # Notify broadcaster
        broadcaster_sid = active_streams[stream_key]['broadcaster']
        emit('viewer_left', {
            'viewer_id': request.sid,
            'viewer_count': len(active_streams[stream_key]['viewers'])
        }, room=broadcaster_sid)
        
        print(f"\n👁️ Viewer {request.sid} left stream: {stream_key}\n")
    
    # WebRTC Signaling
    @socketio.on('offer')
    def handle_offer(data):
        """Forward WebRTC offer from broadcaster to viewer"""
        target_id = data.get('target')
        offer = data.get('offer')
        stream_key = data.get('stream_key')
        
        emit('offer', {
            'offer': offer,
            'broadcaster_id': request.sid,
            'stream_key': stream_key
        }, room=target_id)
    
    @socketio.on('answer')
    def handle_answer(data):
        """Forward WebRTC answer from viewer to broadcaster"""
        target_id = data.get('target')
        answer = data.get('answer')
        
        emit('answer', {
            'answer': answer,
            'viewer_id': request.sid
        }, room=target_id)
    
    @socketio.on('ice_candidate')
    def handle_ice_candidate(data):
        """Forward ICE candidate between peers"""
        target_id = data.get('target')
        candidate = data.get('candidate')
        
        emit('ice_candidate', {
            'candidate': candidate,
            'from': request.sid
        }, room=target_id)
    
    return socketio
