/**
 * ChessUI v2 - Premium gaming UI with particles, sound, drag-and-drop,
 * animated piece movement, themes, and visual feedback.
 */
import { ParticleSystem } from './particles.js';
import { SoundEngine } from './sounds.js';
import { ThemeManager, THEMES } from './themes.js';

const PIECE_SYMBOLS = {
  'K': '\u2654', 'Q': '\u2655', 'R': '\u2656', 'B': '\u2657', 'N': '\u2658', 'P': '\u2659',
  'k': '\u265A', 'q': '\u265B', 'r': '\u265C', 'b': '\u265D', 'n': '\u265E', 'p': '\u265F',
};

const PIECE_NAMES = {
  'K':'King','Q':'Queen','R':'Rook','B':'Bishop','N':'Knight','P':'Pawn',
  'k':'King','q':'Queen','r':'Rook','b':'Bishop','n':'Knight','p':'Pawn',
};

const PIECE_VALUES = { 'P':1,'p':1,'N':3,'n':3,'B':3,'b':3,'R':5,'r':5,'Q':9,'q':9 };

export class ChessUI {
  constructor(orchestrator) {
    this.orch = orchestrator;
    this.boardEl = document.getElementById('board');
    this.logEl = document.getElementById('move-log');
    this.statusEl = document.getElementById('status');
    this.capturedWhiteEl = document.getElementById('captured-white');
    this.capturedBlackEl = document.getElementById('captured-black');
    this.timerWhiteEl = document.getElementById('timer-white');
    this.timerBlackEl = document.getElementById('timer-black');
    this.promoModal = document.getElementById('promotion-modal');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.evalBar = document.getElementById('eval-bar');
    this.evalFill = document.getElementById('eval-fill');

    this.selectedSquare = null;
    this.legalMoveSquares = new Set();
    this.squareElements = []; // 8x8 grid of DOM elements
    this.isDragging = false;
    this.dragPiece = null;
    this.dragFrom = null;
    this.moveAnimating = false;
    this.lastTickSecond = -1;

    // Premium systems
    this.particles = new ParticleSystem(document.getElementById('particle-canvas'));
    this.sound = new SoundEngine();
    this.themes = new ThemeManager('midnight');

    this.particles.spawnAmbient(25);

    this.buildStaticBoard();
    this.bindEvents();
    this.bindButtons();
    this.bindDragDrop();
    this.bindKeyboard();
  }

  // ── Static Board Construction ──────────────────────

  buildStaticBoard() {
    this.boardEl.innerHTML = '';
    this.squareElements = [];

    // Top labels
    const topLabels = document.createElement('div');
    topLabels.className = 'col-labels';
    topLabels.innerHTML = '<span></span>' + 'abcdefgh'.split('').map(l => `<span>${l}</span>`).join('') + '<span></span>';
    this.boardEl.appendChild(topLabels);

    for (let r = 0; r < 8; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';
      this.squareElements[r] = [];

      const rlabel = document.createElement('span');
      rlabel.className = 'row-label';
      rlabel.textContent = 8 - r;
      rowEl.appendChild(rlabel);

      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        const isLight = (r + c) % 2 === 0;
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.row = r;
        sq.dataset.col = c;
        sq.addEventListener('click', () => this.handleClick(r, c));
        rowEl.appendChild(sq);
        this.squareElements[r][c] = sq;
      }

      const rlabel2 = document.createElement('span');
      rlabel2.className = 'row-label';
      rlabel2.textContent = 8 - r;
      rowEl.appendChild(rlabel2);

      this.boardEl.appendChild(rowEl);
    }

    // Bottom labels
    const botLabels = document.createElement('div');
    botLabels.className = 'col-labels';
    botLabels.innerHTML = '<span></span>' + 'abcdefgh'.split('').map(l => `<span>${l}</span>`).join('') + '<span></span>';
    this.boardEl.appendChild(botLabels);
  }

  handleClick(r, c) {
    if (this.isDragging) return;
    this.orch.selectSquare(r, c);
  }

  // ── Orchestrator Events ────────────────────────────

  bindEvents() {
    this.orch.on('start', () => { this.renderFull(); this.updateEval(); });
    this.orch.on('reset', () => this.renderFull());

    this.orch.on('move', (data) => {
      this.animateMove(data.from, data.to, data.piece, () => {
        this.updateBoard();
        this.addMoveLog(data);
        this.renderCaptured();
        this.updateEval();
      });
      // Sound
      if (data.special === 'castle-king' || data.special === 'castle-queen') {
        this.sound.castle();
      } else if (data.captured !== ' ') {
        this.sound.capture();
      } else {
        this.sound.move();
      }
    });

    this.orch.on('select', ({ square, legalMoves }) => {
      this.selectedSquare = square;
      this.legalMoveSquares = new Set(legalMoves.map(m => `${m.row},${m.col}`));
      this.updateHighlights();
      this.sound.select();
    });

    this.orch.on('deselect', () => {
      this.selectedSquare = null;
      this.legalMoveSquares.clear();
      this.updateHighlights();
    });

    this.orch.on('turn', ({ color }) => {
      this.setStatus(`${color === 'white' ? 'White' : 'Black'}'s turn`);
      this.updateTurnIndicator(color);
    });

    this.orch.on('check', ({ color }) => {
      this.setStatus(`CHECK! ${color === 'white' ? 'White' : 'Black'} is in check`, 'warning');
      this.sound.check();
      this.flashBoard();
      // Spark particles on the king
      const kingPos = this.findKingPosition(color);
      if (kingPos) {
        const rect = this.getSquareRect(kingPos[0], kingPos[1]);
        this.particles.sparks(rect.x, rect.y);
      }
    });

    this.orch.on('capture', ({ piece, by }) => {
      this.renderCaptured();
    });

    this.orch.on('gameover', ({ result, winner }) => {
      this.showGameOver(result, winner);
      const isWin = result === 'checkmate' || result === 'resign' || result === 'timeout';
      this.sound.gameOver(isWin);
      if (isWin) this.particles.celebrate(4000);
    });

    this.orch.on('timer', ({ white, black, active }) => {
      this.timerWhiteEl.textContent = this.formatTime(white);
      this.timerBlackEl.textContent = this.formatTime(black);
      this.timerWhiteEl.classList.toggle('active', active === 'white');
      this.timerBlackEl.classList.toggle('active', active === 'black');
      const wLow = white < 30000, bLow = black < 30000;
      this.timerWhiteEl.classList.toggle('low', wLow);
      this.timerBlackEl.classList.toggle('low', bLow);
      // Tick sound in last 10 seconds
      const activeTime = active === 'white' ? white : black;
      const sec = Math.ceil(activeTime / 1000);
      if (sec <= 10 && sec !== this.lastTickSecond && sec > 0) {
        this.lastTickSecond = sec;
        this.sound.tick();
      }
    });

    this.orch.on('undo', () => {
      this.renderFull();
      this.logEl.lastChild?.remove();
      this.updateEval();
    });

    this.orch.on('promotion-prompt', ({ color }) => {
      this.showPromotionModal(color);
    });
  }

  // ── Buttons ────────────────────────────────────────

  bindButtons() {
    document.getElementById('btn-new').addEventListener('click', () => this.orch.start());
    document.getElementById('btn-undo').addEventListener('click', () => this.orch.undo());
    document.getElementById('btn-resign').addEventListener('click', () => {
      if (this.orch.gameOver) return;
      if (confirm(`${this.orch.turn === 'white' ? 'White' : 'Black'}, resign?`)) {
        this.orch.resign(this.orch.turn);
      }
    });
    document.getElementById('btn-draw').addEventListener('click', () => {
      if (this.orch.gameOver) return;
      if (confirm('Both players agree to a draw?')) this.orch.acceptDraw();
    });
    document.getElementById('btn-sound').addEventListener('click', () => {
      const on = this.sound.toggle();
      document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇';
    });
    document.getElementById('btn-theme').addEventListener('click', () => {
      const name = this.themes.next();
      document.getElementById('btn-theme').title = name;
      this.updateBoard();
    });
    document.getElementById('btn-flip')?.addEventListener('click', () => {
      this.boardEl.classList.toggle('flipped');
    });
  }

  // ── Keyboard Shortcuts ─────────────────────────────

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { this.orch.undo(); e.preventDefault(); }
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) { this.orch.start(); e.preventDefault(); }
      if (e.key === 't') this.themes.next();
      if (e.key === 'Escape') this.orch.deselect?.() || this.handleClick(-1, -1);
    });
  }

  // ── Drag & Drop ────────────────────────────────────

  bindDragDrop() {
    let ghostEl = null;
    const boardRect = () => this.boardEl.getBoundingClientRect();

    const getSquareFromEvent = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const target = document.elementFromPoint(clientX, clientY);
      if (!target) return null;
      const sq = target.closest('.square');
      if (!sq) return null;
      return { row: +sq.dataset.row, col: +sq.dataset.col };
    };

    const startDrag = (e) => {
      const sq = getSquareFromEvent(e);
      if (!sq) return;
      const piece = this.orch.board[sq.row][sq.col];
      if (piece === ' ') return;
      const color = piece === piece.toUpperCase() ? 'white' : 'black';
      if (color !== this.orch.turn || this.orch.gameOver) return;

      this.isDragging = true;
      this.dragFrom = sq;
      this.orch.selectSquare(sq.row, sq.col);

      // Create ghost
      ghostEl = document.createElement('div');
      ghostEl.className = 'drag-ghost';
      ghostEl.textContent = PIECE_SYMBOLS[piece];
      document.body.appendChild(ghostEl);
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      ghostEl.style.left = clientX - 30 + 'px';
      ghostEl.style.top = clientY - 30 + 'px';

      // Hide original piece
      const origPiece = this.squareElements[sq.row][sq.col].querySelector('.piece');
      if (origPiece) origPiece.style.opacity = '0.2';

      e.preventDefault();
    };

    const moveDrag = (e) => {
      if (!this.isDragging || !ghostEl) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      ghostEl.style.left = clientX - 30 + 'px';
      ghostEl.style.top = clientY - 30 + 'px';

      // Highlight hovered square
      const sq = getSquareFromEvent(e);
      this.squareElements.flat().forEach(s => s.classList.remove('drag-hover'));
      if (sq && this.legalMoveSquares.has(`${sq.row},${sq.col}`)) {
        this.squareElements[sq.row][sq.col].classList.add('drag-hover');
      }
      e.preventDefault();
    };

    const endDrag = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;

      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const target = document.elementFromPoint(clientX, clientY);
      const sq = target?.closest('.square');

      if (sq && this.dragFrom) {
        const r = +sq.dataset.row, c = +sq.dataset.col;
        if (this.legalMoveSquares.has(`${r},${c}`)) {
          this.orch.selectSquare(r, c);
        }
      }

      // Cleanup
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      this.squareElements.flat().forEach(s => s.classList.remove('drag-hover'));
      // Restore opacity
      if (this.dragFrom) {
        const origPiece = this.squareElements[this.dragFrom.row]?.[this.dragFrom.col]?.querySelector('.piece');
        if (origPiece) origPiece.style.opacity = '';
      }
      this.dragFrom = null;
    };

    this.boardEl.addEventListener('mousedown', startDrag);
    this.boardEl.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
  }

  // ── Board Rendering (Efficient Update) ─────────────

  updateBoard() {
    const board = this.orch.board;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = this.squareElements[r][c];
        const piece = board[r][c];

        // Update piece
        let pieceEl = sq.querySelector('.piece');
        if (piece !== ' ') {
          if (!pieceEl) {
            pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            sq.appendChild(pieceEl);
          }
          pieceEl.textContent = PIECE_SYMBOLS[piece];
          pieceEl.className = `piece ${piece === piece.toUpperCase() ? 'white-piece' : 'black-piece'}`;
          pieceEl.style.opacity = '';
        } else {
          if (pieceEl) pieceEl.remove();
        }
      }
    }
    this.updateHighlights();
  }

  updateHighlights() {
    const board = this.orch.board;
    const lastMove = this.orch.history.length > 0
      ? this.orch.history[this.orch.history.length - 1]
      : null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = this.squareElements[r][c];
        sq.classList.remove('selected', 'legal-move', 'capture-target', 'last-move', 'king-check');

        if (this.selectedSquare && this.selectedSquare.row === r && this.selectedSquare.col === c) {
          sq.classList.add('selected');
        }
        if (this.legalMoveSquares.has(`${r},${c}`)) {
          sq.classList.add(board[r][c] !== ' ' ? 'capture-target' : 'legal-move');
        }
        if (lastMove) {
          if ((lastMove.from[0] === r && lastMove.from[1] === c) ||
              (lastMove.to[0] === r && lastMove.to[1] === c)) {
            sq.classList.add('last-move');
          }
        }
      }
    }

    // Highlight king in check
    if (this.orch.board) {
      const { ChessEngine } = this.orch.constructor.prototype.constructor.length ? {} : {};
      // Simple approach: check status
      const turnColor = this.orch.turn;
      const inCheck = this.statusEl?.textContent?.includes('CHECK');
      if (inCheck) {
        const kingPos = this.findKingPosition(turnColor);
        if (kingPos) {
          this.squareElements[kingPos[0]][kingPos[1]].classList.add('king-check');
        }
      }
    }
  }

  findKingPosition(color) {
    const king = color === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (this.orch.board[r][c] === king) return [r, c];
    return null;
  }

  // ── Move Animation ─────────────────────────────────

  animateMove(from, to, piece, onComplete) {
    const fromSq = this.squareElements[from[0]][from[1]];
    const toSq = this.squareElements[to[0]][to[1]];
    const fromRect = fromSq.getBoundingClientRect();
    const toRect = toSq.getBoundingClientRect();

    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;

    const pieceEl = fromSq.querySelector('.piece');
    if (!pieceEl) { onComplete(); return; }

    // Capture explosion
    const capturedPiece = this.orch.board[to[0]]?.[to[1]];

    pieceEl.style.transition = 'transform 0.2s cubic-bezier(0.23, 1, 0.32, 1)';
    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
    pieceEl.style.zIndex = '10';

    setTimeout(() => {
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      pieceEl.style.zIndex = '';

      // Particle effects for capture
      if (capturedPiece && capturedPiece !== ' ') {
        const rect = this.getSquareRect(to[0], to[1]);
        this.particles.explode(rect.x, rect.y, 'gold');
      } else {
        // Subtle ring for regular move
        const rect = this.getSquareRect(to[0], to[1]);
        this.particles.ring(rect.x, rect.y);
      }

      onComplete();
    }, 200);
  }

  getSquareRect(row, col) {
    const sq = this.squareElements[row][col];
    const rect = sq.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  // ── Full Render ────────────────────────────────────

  renderFull() {
    this.updateBoard();
    this.renderCaptured();
    this.logEl.innerHTML = '';
    this.setStatus("White's turn");
    this.updateTurnIndicator('white');
    this.timerWhiteEl.textContent = '10:00';
    this.timerBlackEl.textContent = '10:00';
    this.timerWhiteEl.classList.remove('low');
    this.timerBlackEl.classList.remove('low');
    this.lastTickSecond = -1;
  }

  // ── Captured Pieces ────────────────────────────────

  renderCaptured() {
    const render = (pieces, el) => {
      const sorted = [...pieces].sort((a, b) => (PIECE_VALUES[b] || 0) - (PIECE_VALUES[a] || 0));
      el.innerHTML = sorted.map(p =>
        `<span class="captured-piece" title="${PIECE_NAMES[p]}">${PIECE_SYMBOLS[p]}</span>`
      ).join('');

      // Material advantage
      const total = pieces.reduce((s, p) => s + (PIECE_VALUES[p] || 0), 0);
      const adv = el.parentElement.querySelector('.material-count');
      if (adv) adv.textContent = total > 0 ? `+${total}` : '';
    };
    render(this.orch.captured.white, this.capturedWhiteEl);
    render(this.orch.captured.black, this.capturedBlackEl);
  }

  // ── Eval Bar (simple material count) ───────────────

  updateEval() {
    if (!this.evalFill) return;
    const board = this.orch.board;
    let whiteVal = 0, blackVal = 0;
    const vals = { P:1,N:3,B:3,R:5,Q:9,K:0 };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p === ' ') continue;
        const v = vals[p.toUpperCase()] || 0;
        if (p === p.toUpperCase()) whiteVal += v; else blackVal += v;
      }
    }
    const diff = whiteVal - blackVal;
    const pct = Math.min(90, Math.max(10, 50 + diff * 3));
    this.evalFill.style.height = pct + '%';
  }

  // ── Promotion Modal ────────────────────────────────

  showPromotionModal(color) {
    this.promoModal.classList.add('visible');
    const pieces = color === 'white' ? ['Q','R','B','N'] : ['q','r','b','n'];
    const container = this.promoModal.querySelector('.promo-pieces');
    container.innerHTML = '';
    pieces.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = `<span>${PIECE_SYMBOLS[p]}</span><small>${PIECE_NAMES[p]}</small>`;
      btn.addEventListener('click', () => {
        this.promoModal.classList.remove('visible');
        this.orch.completePromotion(p.toUpperCase());
        this.sound.move();
      });
      container.appendChild(btn);
    });
  }

  // ── Move Log ───────────────────────────────────────

  addMoveLog(data) {
    const cols = 'abcdefgh';
    const from = cols[data.from[1]] + (8 - data.from[0]);
    const to = cols[data.to[1]] + (8 - data.to[0]);
    const symbol = PIECE_SYMBOLS[data.piece] || '';
    const cap = data.captured !== ' ' ? 'x' : '\u2192';
    const special = data.special === 'castle-king' ? ' O-O'
      : data.special === 'castle-queen' ? ' O-O-O'
      : data.special === 'en-passant' ? ' e.p.'
      : data.special === 'promotion' ? ' =Q'
      : '';

    const entry = document.createElement('div');
    entry.className = `log-entry ${data.captured !== ' ' ? 'log-capture' : ''}`;
    const num = Math.ceil(data.moveNumber / 2);
    const isWhite = data.piece === data.piece.toUpperCase();
    entry.innerHTML = `
      <span class="move-num">${isWhite ? num + '.' : ''}</span>
      <span class="move-text">${symbol} ${from} ${cap} ${to}${special}</span>
    `;
    this.logEl.appendChild(entry);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // ── Status & Indicators ────────────────────────────

  setStatus(text, type = 'info') {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${type}`;
  }

  updateTurnIndicator(color) {
    this.turnIndicator.className = `turn-indicator ${color}`;
    const icon = color === 'white' ? '\u2654' : '\u265A';
    this.turnIndicator.innerHTML = `<span class="turn-icon">${icon}</span> ${color === 'white' ? 'White' : 'Black'} to move`;
  }

  showGameOver(result, winner) {
    const messages = {
      checkmate: `Checkmate! ${winner === 'white' ? 'White' : 'Black'} wins!`,
      stalemate: 'Stalemate \u2014 Draw!',
      resign: `${winner === 'white' ? 'White' : 'Black'} wins by resignation!`,
      draw: 'Draw by agreement!',
      timeout: `Time\u2019s up! ${winner === 'white' ? 'White' : 'Black'} wins!`,
    };
    this.setStatus(messages[result] || 'Game Over', 'gameover');
    this.boardEl.classList.add('game-over');
    setTimeout(() => this.boardEl.classList.remove('game-over'), 2000);
  }

  flashBoard() {
    this.boardEl.classList.add('check-flash');
    setTimeout(() => this.boardEl.classList.remove('check-flash'), 800);
  }

  formatTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
