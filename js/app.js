/**
 * App.js — Main entry point. Orchestrates lobby, game modes,
 * AI, online multiplayer, replay, and PGN.
 */
import { GameOrchestrator } from './orchestrator.js';
import { ChessUI } from './ui.js';
import { OnlineManager } from './online.js';
import { ReplayManager } from './replay.js';
import { PGN } from './pgn.js';

// ── State ────────────────────────────────────────────
let gameMode = 'local'; // 'local' | 'ai' | 'online'
let aiDifficulty = 'medium';
let aiColor = 'black';  // AI plays as
let playerColor = 'white';
let aiWorker = null;
let aiThinking = false;

const orchestrator = new GameOrchestrator();
const online = new OnlineManager(orchestrator);
const replay = new ReplayManager();
let ui = null; // initialized after DOM

// ── Screen Management ────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function hideLobbyOptions() {
  document.querySelectorAll('.lobby-options').forEach(el => el.classList.add('hidden'));
}

// ── Lobby ────────────────────────────────────────────
function initLobby() {
  const nameInput = document.getElementById('player-name');
  nameInput.value = localStorage.getItem('chess-name') || '';

  // Mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const mode = card.dataset.mode;
      hideLobbyOptions();

      if (mode === 'local') startLocalGame();
      else if (mode === 'ai') document.getElementById('ai-options').classList.remove('hidden');
      else if (mode === 'online') startOnlineRoom();
      else if (mode === 'join') document.getElementById('join-options').classList.remove('hidden');
    });
  });

  // AI difficulty buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aiDifficulty = btn.dataset.diff;
    });
  });

  // AI color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const choice = btn.dataset.color;
      if (choice === 'random') {
        playerColor = Math.random() > 0.5 ? 'white' : 'black';
      } else {
        playerColor = choice;
      }
      aiColor = playerColor === 'white' ? 'black' : 'white';
    });
  });

  // Start AI game
  document.getElementById('btn-start-ai').addEventListener('click', () => startAIGame());

  // Join room
  document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length >= 4) joinOnlineRoom(code);
  });

  document.getElementById('room-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-join-room').click();
  });

  // Copy link
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const input = document.getElementById('share-link');
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('btn-copy-link');
      btn.textContent = '\u2713';
      setTimeout(() => btn.innerHTML = '&#128203;', 1500);
    });
  });

  // Check URL for room code
  const pathMatch = window.location.pathname.match(/\/play\/([A-Za-z0-9]+)/);
  if (pathMatch) {
    const code = pathMatch[1].toUpperCase();
    joinOnlineRoom(code);
  }
}

// ── Local Game ───────────────────────────────────────
function startLocalGame() {
  gameMode = 'local';
  saveName();
  const name = getName();
  document.getElementById('game-mode-badge').textContent = 'LOCAL';
  document.getElementById('player-white-name').textContent = name || 'White';
  document.getElementById('player-black-name').textContent = 'Black';
  document.getElementById('chat-panel').classList.add('hidden');
  document.getElementById('connection-badge').classList.add('hidden');
  showScreen('screen-game');
  orchestrator.start();
}

// ── AI Game ──────────────────────────────────────────
function startAIGame() {
  gameMode = 'ai';
  saveName();
  const name = getName();
  document.getElementById('game-mode-badge').textContent = `AI ${aiDifficulty.toUpperCase()}`;
  document.getElementById('player-white-name').textContent = playerColor === 'white' ? name : `AI (${aiDifficulty})`;
  document.getElementById('player-black-name').textContent = playerColor === 'black' ? name : `AI (${aiDifficulty})`;
  document.getElementById('chat-panel').classList.add('hidden');
  document.getElementById('connection-badge').classList.add('hidden');
  showScreen('screen-game');

  // Init AI worker
  if (aiWorker) aiWorker.terminate();
  aiWorker = new Worker('/js/ai-worker.js');
  aiWorker.onmessage = (e) => {
    if (e.data.type === 'move-found' && e.data.move) {
      aiThinking = false;
      const m = e.data.move;
      orchestrator.selectSquare(m.fr, m.fc);
      // Small delay for visual feedback
      setTimeout(() => orchestrator.selectSquare(m.row, m.col), 50);
    }
  };

  orchestrator.start();

  // If AI plays white, make first move
  if (aiColor === 'white') requestAIMove();
}

function requestAIMove() {
  if (!aiWorker || aiThinking || orchestrator.gameOver) return;
  if (orchestrator.turn !== aiColor) return;

  aiThinking = true;
  ui?.setStatus(`AI is thinking...`, 'thinking');

  aiWorker.postMessage({
    type: 'find-move',
    board: orchestrator.board,
    color: aiColor,
    state: orchestrator.state,
    difficulty: aiDifficulty,
    history: orchestrator.history.map(h => ({
      fr: h.from[0], fc: h.from[1], row: h.to[0], col: h.to[1],
    })),
  });
}

// Hook into orchestrator turn changes for AI
orchestrator.on('turn', ({ color }) => {
  if (gameMode === 'ai' && color === aiColor) {
    setTimeout(() => requestAIMove(), 100);
  }
});

// ── Online Game ──────────────────────────────────────
async function startOnlineRoom() {
  saveName();
  const name = getName();
  hideLobbyOptions();
  document.getElementById('online-waiting').classList.remove('hidden');

  online.connect();
  const { code, link } = await online.createRoom(name);
  document.getElementById('share-code').textContent = code;
  document.getElementById('share-link').value = `${window.location.origin}/play/${code}`;

  online.joinRoom(code, name);
}

function joinOnlineRoom(code) {
  saveName();
  const name = getName();
  gameMode = 'online';
  online.connect();
  online.joinRoom(code, name);
}

// Online event handlers
online.on('room:joined', (data) => {
  document.getElementById('game-mode-badge').textContent = 'ONLINE';
  document.getElementById('connection-badge').classList.remove('hidden');
  if (data.color === 'spectator') {
    document.getElementById('game-mode-badge').textContent = 'SPECTATOR';
  }
});

online.on('game:ready', ({ white, black }) => {
  document.getElementById('player-white-name').textContent = white;
  document.getElementById('player-black-name').textContent = black;
  document.getElementById('chat-panel').classList.remove('hidden');
  showScreen('screen-game');
  // Host auto-starts
  online.startGame();
});

online.on('game:started', (data) => {
  gameMode = 'online';
  showScreen('screen-game');
  document.getElementById('player-white-name').textContent = data.white;
  document.getElementById('player-black-name').textContent = data.black;
  document.getElementById('chat-panel').classList.remove('hidden');
  orchestrator.start();

  // Flip board if playing black
  if (online.myColor === 'black') {
    document.getElementById('board').classList.add('flipped');
  }
});

online.on('opponent:moved', ({ from, to, special, promotionPiece }) => {
  orchestrator.selectSquare(from[0], from[1]);
  setTimeout(() => {
    if (special === 'promotion' && promotionPiece) {
      orchestrator.pendingPromotion = { fr: from[0], fc: from[1], tr: to[0], tc: to[1], piece: orchestrator.board[from[0]][from[1]], captured: orchestrator.board[to[0]][to[1]] };
      orchestrator.completePromotion(promotionPiece);
    } else {
      orchestrator.selectSquare(to[0], to[1]);
    }
  }, 50);
});

online.on('game:over', ({ result, winner }) => {
  if (!orchestrator.gameOver) {
    orchestrator.endGame(result, winner);
  }
});

online.on('draw-offered', ({ by }) => {
  showOffer(`${by} offers a draw. Accept?`, () => online.acceptDraw());
});

online.on('rematch-offered', ({ by }) => {
  showOffer(`${by} wants a rematch. Accept?`, () => online.acceptRematch());
});

online.on('rematch-starting', ({ white, black }) => {
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('player-white-name').textContent = white;
  document.getElementById('player-black-name').textContent = black;
  orchestrator.start();
});

online.on('player:disconnected', ({ name }) => {
  ui?.setStatus(`${name} disconnected...`, 'warning');
});

online.on('player:reconnected', ({ name }) => {
  ui?.setStatus(`${name} reconnected!`, 'info');
});

// Chat
online.on('chat:message', (msg) => {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<strong>${escapeHtml(msg.name)}:</strong> ${escapeHtml(msg.text)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
});

// Hook orchestrator moves to send online
const origSelectSquare = orchestrator.selectSquare.bind(orchestrator);
orchestrator.selectSquare = function(row, col) {
  const wasSelected = this.selectedSquare;
  origSelectSquare(row, col);
  // If move was made and we're online, send it
  if (gameMode === 'online' && wasSelected && this.history.length > 0) {
    const lastMove = this.history[this.history.length - 1];
    if (lastMove && online.myColor) {
      const movedColor = lastMove.piece === lastMove.piece.toUpperCase() ? 'white' : 'black';
      if (movedColor === online.myColor) {
        online.sendMove(lastMove.from, lastMove.to, lastMove.special);
      }
    }
  }
};

// ── Offer Modal ──────────────────────────────────────
function showOffer(text, onAccept) {
  const modal = document.getElementById('offer-modal');
  document.getElementById('offer-text').textContent = text;
  modal.classList.remove('hidden');
  document.getElementById('offer-accept').onclick = () => { modal.classList.add('hidden'); onAccept(); };
  document.getElementById('offer-decline').onclick = () => modal.classList.add('hidden');
}

// ── Game Over Overlay ────────────────────────────────
orchestrator.on('gameover', ({ result, winner }) => {
  const overlay = document.getElementById('gameover-overlay');
  const titles = {
    checkmate: 'Checkmate!',
    stalemate: 'Stalemate',
    resign: 'Resignation',
    draw: 'Draw',
    timeout: 'Time\u2019s Up!',
  };
  document.getElementById('gameover-title').textContent = titles[result] || 'Game Over';
  document.getElementById('gameover-subtitle').textContent = winner
    ? `${winner === 'white' ? 'White' : 'Black'} wins!`
    : 'It\u2019s a draw!';
  document.getElementById('gameover-icon').innerHTML = winner === 'black' ? '&#9819;' : '&#9813;';
  overlay.classList.remove('hidden');
});

document.getElementById('btn-rematch')?.addEventListener('click', () => {
  document.getElementById('gameover-overlay').classList.add('hidden');
  if (gameMode === 'online') {
    online.offerRematch();
    ui?.setStatus('Rematch offered...');
  } else {
    orchestrator.start();
    if (gameMode === 'ai' && aiColor === 'white') requestAIMove();
  }
});

document.getElementById('btn-review')?.addEventListener('click', () => {
  document.getElementById('gameover-overlay').classList.add('hidden');
  startReplay();
});

document.getElementById('btn-go-lobby')?.addEventListener('click', () => {
  document.getElementById('gameover-overlay').classList.add('hidden');
  online.disconnect();
  showScreen('screen-lobby');
  hideLobbyOptions();
});

// ── Replay Mode ──────────────────────────────────────
function startReplay() {
  if (orchestrator.history.length === 0) return;
  replay.load(orchestrator.history);
  document.getElementById('replay-controls').classList.remove('hidden');
  const slider = document.getElementById('replay-slider');
  slider.max = orchestrator.history.length;
  slider.value = 0;
  updateReplayCounter();
}

replay.on('position', ({ board, moveIndex, totalMoves }) => {
  if (ui) {
    // Temporarily replace board for rendering
    const origBoard = orchestrator.board;
    orchestrator.board = board;
    ui.updateBoard();
    orchestrator.board = origBoard;
  }
  document.getElementById('replay-slider').value = moveIndex;
  updateReplayCounter();
});

replay.on('move-forward', (move) => {
  if (ui) ui.sound.move();
});

function updateReplayCounter() {
  const state = replay.getState();
  document.getElementById('replay-counter').textContent = `${state.moveIndex}/${state.totalMoves}`;
}

document.getElementById('replay-start')?.addEventListener('click', () => replay.toStart());
document.getElementById('replay-back')?.addEventListener('click', () => replay.back());
document.getElementById('replay-play')?.addEventListener('click', () => replay.toggleAutoPlay());
document.getElementById('replay-forward')?.addEventListener('click', () => replay.forward());
document.getElementById('replay-end')?.addEventListener('click', () => replay.toEnd());
document.getElementById('replay-slider')?.addEventListener('input', (e) => replay.jumpTo(+e.target.value));
document.getElementById('replay-speed')?.addEventListener('input', (e) => replay.setSpeed(+e.target.value));
document.getElementById('replay-exit')?.addEventListener('click', () => {
  replay.stop();
  document.getElementById('replay-controls').classList.add('hidden');
  ui?.updateBoard();
});

// ── PGN Export ───────────────────────────────────────
document.getElementById('btn-pgn')?.addEventListener('click', () => {
  if (orchestrator.history.length === 0) return;
  const wName = document.getElementById('player-white-name').textContent;
  const bName = document.getElementById('player-black-name').textContent;
  const resultMap = { checkmate: orchestrator.winner === 'white' ? '1-0' : '0-1', stalemate: '1/2-1/2', draw: '1/2-1/2' };
  PGN.download(orchestrator.history, {
    white: wName, black: bName,
    result: resultMap[orchestrator.result] || '*',
  });
});

// ── Chat ─────────────────────────────────────────────
document.getElementById('btn-chat-send')?.addEventListener('click', () => {
  const input = document.getElementById('chat-input');
  if (input.value.trim()) {
    online.sendChat(input.value.trim());
    input.value = '';
  }
});

document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-chat-send').click();
});

// ── Back to lobby ────────────────────────────────────
document.getElementById('btn-lobby')?.addEventListener('click', () => {
  if (!orchestrator.gameOver && orchestrator.moveCount > 0) {
    if (!confirm('Leave the game? Progress will be lost.')) return;
  }
  orchestrator.stopTimer();
  online.disconnect();
  if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
  showScreen('screen-lobby');
  hideLobbyOptions();
});

// ── Online resign/draw hooks ─────────────────────────
const origResignHandler = orchestrator.resign.bind(orchestrator);
orchestrator.resign = function(color) {
  if (gameMode === 'online') online.resign();
  else origResignHandler(color);
};

// ── Helpers ──────────────────────────────────────────
function getName() {
  return document.getElementById('player-name').value.trim() || 'Player';
}

function saveName() {
  const name = getName();
  localStorage.setItem('chess-name', name);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ui = new ChessUI(orchestrator);
  document.addEventListener('click', () => ui.sound.init(), { once: true });
  initLobby();
  showScreen('screen-lobby');
});
