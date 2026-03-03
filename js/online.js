/**
 * OnlineManager — Socket.io client for multiplayer chess.
 * Handles room creation, joining, real-time moves, chat, reconnection.
 */
export class OnlineManager {
  constructor(orchestrator) {
    this.orch = orchestrator;
    this.socket = null;
    this.roomCode = null;
    this.myColor = null;
    this.myName = null;
    this.myPlayerId = null;
    this.opponentName = null;
    this.connected = false;
    this.listeners = {};
  }

  on(event, cb) { (this.listeners[event] ||= []).push(cb); return this; }
  emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }

  connect() {
    if (this.socket) return;
    // Socket.io loaded via CDN in HTML
    this.socket = io({ transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => {
      this.connected = true;
      this.emit('connected');
      // Auto-rejoin if we have stored player info
      if (this.roomCode && this.myPlayerId) {
        this.joinRoom(this.roomCode, this.myName);
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnected');
    });

    this.socket.on('error', ({ message }) => this.emit('error', message));

    // Room events
    this.socket.on('room:joined', (data) => {
      this.roomCode = data.code;
      this.myColor = data.color;
      this.myName = data.name;
      this.myPlayerId = data.playerId;
      // Persist for reconnection
      sessionStorage.setItem('chess-playerId', data.playerId);
      sessionStorage.setItem('chess-playerName', data.name);
      this.emit('room:joined', data);
    });

    this.socket.on('room:settings-updated', (settings) => {
      this.emit('settings-updated', settings);
    });

    this.socket.on('player:joined', ({ color, name }) => {
      this.opponentName = name;
      this.emit('player:joined', { color, name });
    });

    this.socket.on('player:disconnected', ({ color, name }) => {
      this.emit('player:disconnected', { color, name });
    });

    this.socket.on('player:reconnected', ({ color, name }) => {
      this.emit('player:reconnected', { color, name });
    });

    this.socket.on('spectator:joined', ({ name }) => {
      this.emit('spectator:joined', { name });
    });

    // Game events
    this.socket.on('game:ready', ({ white, black }) => {
      this.emit('game:ready', { white, black });
    });

    this.socket.on('game:started', (data) => {
      this.emit('game:started', data);
    });

    this.socket.on('game:moved', ({ from, to, special, promotionPiece, color }) => {
      // Only process opponent's moves (we already handled our own)
      if (color !== this.myColor) {
        this.emit('opponent:moved', { from, to, special, promotionPiece });
      }
    });

    this.socket.on('game:over', ({ result, winner }) => {
      this.emit('game:over', { result, winner });
    });

    this.socket.on('game:timer', (timers) => {
      this.emit('timer', timers);
    });

    this.socket.on('game:draw-offered', ({ by }) => {
      this.emit('draw-offered', { by });
    });

    this.socket.on('game:rematch-offered', ({ by }) => {
      this.emit('rematch-offered', { by });
    });

    this.socket.on('game:rematch-starting', ({ white, black }) => {
      this.emit('rematch-starting', { white, black });
    });

    // Chat
    this.socket.on('chat:message', (msg) => {
      this.emit('chat:message', msg);
    });
  }

  async createRoom(name) {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const { code, link } = await res.json();
    this.roomCode = code;
    this.myName = name;
    return { code, link };
  }

  joinRoom(code, name) {
    if (!this.socket) this.connect();
    const playerId = sessionStorage.getItem('chess-playerId') || null;
    name = name || sessionStorage.getItem('chess-playerName') || 'Guest';
    this.socket.emit('room:join', { code, name, playerId });
  }

  sendMove(from, to, special, promotionPiece) {
    if (!this.socket || !this.roomCode) return;
    this.socket.emit('game:move', { from, to, special, promotionPiece });
  }

  startGame() {
    this.socket?.emit('game:start');
  }

  resign() {
    this.socket?.emit('game:resign');
  }

  offerDraw() {
    this.socket?.emit('game:draw-offer');
  }

  acceptDraw() {
    this.socket?.emit('game:draw-accept');
  }

  offerRematch() {
    this.socket?.emit('game:rematch');
  }

  acceptRematch() {
    this.socket?.emit('game:rematch-accept');
  }

  sendChat(text) {
    this.socket?.emit('chat:message', { text });
  }

  updateSettings(settings) {
    this.socket?.emit('room:settings', settings);
  }

  getShareLink() {
    return `${window.location.origin}/play/${this.roomCode}`;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }
}
