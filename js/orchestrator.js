/**
 * GameOrchestrator - Central coordinator for the chess game.
 *
 * Responsibilities:
 *  - Manage game state (board, turn, history, timers)
 *  - Validate & execute moves via ChessEngine
 *  - Emit events to UI layer
 *  - Handle special flows (promotion, undo, resign)
 *
 * The orchestrator never renders anything — it only emits events.
 */
import { ChessEngine } from './engine.js';

export class GameOrchestrator {

  constructor() {
    this.listeners = {};
    this.reset();
  }

  // ── Event System ───────────────────────────────────

  on(event, callback) {
    (this.listeners[event] ||= []).push(callback);
    return this; // chainable
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // ── Game Lifecycle ─────────────────────────────────

  reset() {
    this.board = ChessEngine.initialBoard();
    this.turn = 'white';
    this.history = [];        // {from, to, piece, captured, special, board}
    this.captured = { white: [], black: [] }; // pieces captured BY each color
    this.selectedSquare = null;
    this.legalMoves = [];
    this.gameOver = false;
    this.result = null;       // 'checkmate' | 'stalemate' | 'resign' | 'draw'
    this.winner = null;
    this.moveCount = 0;
    this.pendingPromotion = null; // {from, to} awaiting piece choice

    this.state = {
      enPassant: null,        // [row, col] of en-passant target square
      castling: {
        white: { king: true, queen: true },
        black: { king: true, queen: true },
      },
    };

    this.players = {
      white: { name: 'Player 1', timeMs: 10 * 60 * 1000 },
      black: { name: 'Player 2', timeMs: 10 * 60 * 1000 },
    };

    this.timerInterval = null;
    this.emit('reset', this.getSnapshot());
  }

  start() {
    this.reset();
    this.startTimer();
    this.emit('start', this.getSnapshot());
    this.emit('turn', { color: this.turn });
  }

  // ── Square Selection ───────────────────────────────

  selectSquare(row, col) {
    if (this.gameOver || this.pendingPromotion) return;

    const piece = this.board[row][col];

    // If we already have a selection, try to move there
    if (this.selectedSquare) {
      const move = this.legalMoves.find(m => m.row === row && m.col === col);
      if (move) {
        this.executeMove(this.selectedSquare.row, this.selectedSquare.col, row, col, move.special);
        return;
      }
    }

    // Select a new piece (must be current player's)
    if (piece !== ' ' && ChessEngine.colorOf(piece) === this.turn) {
      this.selectedSquare = { row, col };
      this.legalMoves = ChessEngine.getLegalMoves(this.board, row, col, this.state);
      this.emit('select', {
        square: { row, col },
        legalMoves: this.legalMoves,
      });
    } else {
      this.deselect();
    }
  }

  deselect() {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.emit('deselect');
  }

  // ── Move Execution ─────────────────────────────────

  executeMove(fr, fc, tr, tc, special) {
    const piece = this.board[fr][fc];
    const captured = this.board[tr][tc];
    const color = ChessEngine.colorOf(piece);

    // Handle promotion — pause for user choice
    if (special === 'promotion') {
      this.pendingPromotion = { fr, fc, tr, tc, piece, captured };
      this.emit('promotion-prompt', { color, from: [fr, fc], to: [tr, tc] });
      return;
    }

    this.applyMove(fr, fc, tr, tc, piece, captured, special);
  }

  /** Finalize promotion with chosen piece type (Q, R, B, N) */
  completePromotion(chosenType) {
    if (!this.pendingPromotion) return;
    const { fr, fc, tr, tc, piece, captured } = this.pendingPromotion;
    this.pendingPromotion = null;
    this.applyMove(fr, fc, tr, tc, piece, captured, 'promotion', chosenType);
  }

  applyMove(fr, fc, tr, tc, piece, captured, special, promotionPiece) {
    const color = ChessEngine.colorOf(piece);

    // Save to history (with board snapshot for undo)
    this.history.push({
      from: [fr, fc], to: [tr, tc],
      piece, captured, special,
      board: ChessEngine.cloneBoard(this.board),
      stateCopy: JSON.parse(JSON.stringify(this.state)),
      capturedCopy: { white: [...this.captured.white], black: [...this.captured.black] },
    });

    // Move the piece
    this.board[fr][fc] = ' ';

    if (special === 'promotion') {
      const pt = promotionPiece || 'Q';
      this.board[tr][tc] = color === 'white' ? pt : pt.toLowerCase();
    } else {
      this.board[tr][tc] = piece;
    }

    // Handle captures
    if (captured !== ' ') {
      this.captured[color].push(captured);
      this.emit('capture', { piece: captured, by: color });
    }

    // En passant capture
    if (special === 'en-passant') {
      const capturedRow = color === 'white' ? tr + 1 : tr - 1;
      const epPiece = this.board[capturedRow][tc];
      this.captured[color].push(epPiece);
      this.board[capturedRow][tc] = ' ';
      this.emit('capture', { piece: epPiece, by: color, enPassant: true });
    }

    // Castling rook movement
    if (special === 'castle-king') {
      this.board[fr][5] = this.board[fr][7];
      this.board[fr][7] = ' ';
    } else if (special === 'castle-queen') {
      this.board[fr][3] = this.board[fr][0];
      this.board[fr][0] = ' ';
    }

    // Update en-passant state
    if (special === 'double-push') {
      const epRow = color === 'white' ? fr - 1 : fr + 1;
      this.state.enPassant = [epRow, fc];
    } else {
      this.state.enPassant = null;
    }

    // Update castling rights
    this.updateCastlingRights(piece, fr, fc);

    this.moveCount++;
    this.deselect();

    // Switch turn
    this.turn = this.turn === 'white' ? 'black' : 'white';

    // Check game state
    const inCheck = ChessEngine.isInCheck(this.board, this.turn);
    const result = ChessEngine.getGameResult(this.board, this.turn, this.state);

    this.emit('move', {
      from: [fr, fc], to: [tr, tc], piece, captured, special,
      moveNumber: this.moveCount,
    });

    if (inCheck && !result) {
      this.emit('check', { color: this.turn });
    }

    if (result) {
      this.endGame(result, result === 'checkmate'
        ? (this.turn === 'white' ? 'black' : 'white')
        : null);
    } else {
      this.emit('turn', { color: this.turn });
    }
  }

  updateCastlingRights(piece, fr, fc) {
    const type = ChessEngine.typeOf(piece);
    const color = ChessEngine.colorOf(piece);

    if (type === 'K') {
      this.state.castling[color].king = false;
      this.state.castling[color].queen = false;
    }
    if (type === 'R') {
      if (fc === 0) this.state.castling[color].queen = false;
      if (fc === 7) this.state.castling[color].king = false;
    }
  }

  // ── Undo ───────────────────────────────────────────

  undo() {
    if (this.history.length === 0 || this.gameOver) return;
    const last = this.history.pop();
    this.board = last.board;
    this.state = last.stateCopy;
    this.captured = last.capturedCopy;
    this.turn = this.turn === 'white' ? 'black' : 'white';
    this.moveCount--;
    this.deselect();
    this.emit('undo', this.getSnapshot());
    this.emit('turn', { color: this.turn });
  }

  // ── Game End ───────────────────────────────────────

  endGame(result, winner) {
    this.gameOver = true;
    this.result = result;
    this.winner = winner;
    this.stopTimer();
    this.emit('gameover', { result, winner });
  }

  resign(color) {
    if (this.gameOver) return;
    const winner = color === 'white' ? 'black' : 'white';
    this.endGame('resign', winner);
  }

  offerDraw() {
    this.emit('draw-offer', { by: this.turn });
  }

  acceptDraw() {
    this.endGame('draw', null);
  }

  // ── Timer ──────────────────────────────────────────

  startTimer() {
    this.stopTimer();
    this.lastTick = Date.now();
    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastTick;
      this.lastTick = now;
      this.players[this.turn].timeMs -= elapsed;
      if (this.players[this.turn].timeMs <= 0) {
        this.players[this.turn].timeMs = 0;
        const winner = this.turn === 'white' ? 'black' : 'white';
        this.endGame('timeout', winner);
      }
      this.emit('timer', {
        white: this.players.white.timeMs,
        black: this.players.black.timeMs,
        active: this.turn,
      });
    }, 100);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ── Snapshot ───────────────────────────────────────

  getSnapshot() {
    return {
      board: ChessEngine.cloneBoard(this.board),
      turn: this.turn,
      moveCount: this.moveCount,
      captured: this.captured,
      gameOver: this.gameOver,
      result: this.result,
      winner: this.winner,
      inCheck: ChessEngine.isInCheck(this.board, this.turn),
      players: this.players,
    };
  }
}
