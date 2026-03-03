/**
 * ReplayManager — Step through recorded games move by move.
 * Supports: forward, back, jump to move, auto-play with speed control.
 */
import { ChessEngine } from './engine.js';

export class ReplayManager {
  constructor() {
    this.moves = [];      // Array of { from, to, piece, captured, special, board }
    this.boards = [];     // Board state after each move (index 0 = initial)
    this.currentMove = 0; // 0 = initial position, 1 = after first move, etc.
    this.autoPlayTimer = null;
    this.autoPlaySpeed = 1500; // ms between moves
    this.listeners = {};
    this.active = false;
  }

  on(event, cb) { (this.listeners[event] ||= []).push(cb); return this; }
  emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }

  /** Load a game from orchestrator history */
  load(history) {
    this.stop();
    this.moves = history;
    this.boards = [ChessEngine.initialBoard()];

    // Reconstruct all board states
    let board = ChessEngine.initialBoard();
    for (const move of history) {
      board = ChessEngine.simulateMove(board, move.from[0], move.from[1], move.to[0], move.to[1], move.special);
      this.boards.push(ChessEngine.cloneBoard(board));
    }

    this.currentMove = 0;
    this.active = true;
    this.emit('loaded', { totalMoves: this.moves.length });
    this.emit('position', this.getState());
  }

  getState() {
    return {
      board: this.boards[this.currentMove],
      moveIndex: this.currentMove,
      totalMoves: this.moves.length,
      currentMoveData: this.currentMove > 0 ? this.moves[this.currentMove - 1] : null,
      isStart: this.currentMove === 0,
      isEnd: this.currentMove === this.moves.length,
    };
  }

  /** Go to next move */
  forward() {
    if (this.currentMove >= this.moves.length) return;
    this.currentMove++;
    this.emit('position', this.getState());
    this.emit('move-forward', this.moves[this.currentMove - 1]);
  }

  /** Go to previous move */
  back() {
    if (this.currentMove <= 0) return;
    this.currentMove--;
    this.emit('position', this.getState());
  }

  /** Jump to specific move */
  jumpTo(index) {
    if (index < 0 || index > this.moves.length) return;
    this.currentMove = index;
    this.emit('position', this.getState());
  }

  /** Go to start */
  toStart() { this.jumpTo(0); }

  /** Go to end */
  toEnd() { this.jumpTo(this.moves.length); }

  /** Start auto-play */
  play() {
    this.stopAutoPlay();
    if (this.currentMove >= this.moves.length) this.jumpTo(0);
    this.autoPlayTimer = setInterval(() => {
      if (this.currentMove >= this.moves.length) {
        this.stopAutoPlay();
        return;
      }
      this.forward();
    }, this.autoPlaySpeed);
    this.emit('autoplay', true);
  }

  /** Stop auto-play */
  stopAutoPlay() {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    this.emit('autoplay', false);
  }

  /** Toggle auto-play */
  toggleAutoPlay() {
    if (this.autoPlayTimer) this.stopAutoPlay();
    else this.play();
  }

  /** Set auto-play speed (ms) */
  setSpeed(ms) {
    this.autoPlaySpeed = Math.max(200, Math.min(5000, ms));
    if (this.autoPlayTimer) {
      this.stopAutoPlay();
      this.play();
    }
  }

  /** Exit replay mode */
  stop() {
    this.stopAutoPlay();
    this.active = false;
    this.moves = [];
    this.boards = [];
    this.currentMove = 0;
    this.emit('stopped');
  }
}
