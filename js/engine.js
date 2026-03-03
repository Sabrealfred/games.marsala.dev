/**
 * ChessEngine - Pure chess logic. No side effects, no UI.
 * Answers: "Is this move legal?", "Is it check/checkmate?"
 */
export class ChessEngine {

  static PIECES = {
    K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn'
  };

  /** Create initial board. Uppercase = white, lowercase = black */
  static initialBoard() {
    return [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      [' ',' ',' ',' ',' ',' ',' ',' '],
      [' ',' ',' ',' ',' ',' ',' ',' '],
      [' ',' ',' ',' ',' ',' ',' ',' '],
      [' ',' ',' ',' ',' ',' ',' ',' '],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R'],
    ];
  }

  static colorOf(piece) {
    if (piece === ' ') return null;
    return piece === piece.toUpperCase() ? 'white' : 'black';
  }

  static typeOf(piece) {
    return piece.toUpperCase();
  }

  /** Deep clone a board */
  static cloneBoard(board) {
    return board.map(row => [...row]);
  }

  /** Find king position for a color */
  static findKing(board, color) {
    const king = color === 'white' ? 'K' : 'k';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (board[r][c] === king) return [r, c];
    return null;
  }

  /** Is a square attacked by the opponent? */
  static isSquareAttacked(board, row, col, byColor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece === ' ' || this.colorOf(piece) !== byColor) continue;
        if (this.canPieceAttack(board, r, c, row, col)) return true;
      }
    }
    return false;
  }

  /** Can a piece on (fr,fc) attack square (tr,tc)? Raw attack, ignoring check. */
  static canPieceAttack(board, fr, fc, tr, tc) {
    const piece = board[fr][fc];
    const type = this.typeOf(piece);
    const color = this.colorOf(piece);
    const dr = tr - fr, dc = tc - fc;
    const adr = Math.abs(dr), adc = Math.abs(dc);

    switch (type) {
      case 'P': {
        const dir = color === 'white' ? -1 : 1;
        return dr === dir && adc === 1;
      }
      case 'N':
        return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
      case 'B':
        return adr === adc && adr > 0 && this.isPathClear(board, fr, fc, tr, tc);
      case 'R':
        return (dr === 0 || dc === 0) && (adr + adc > 0) && this.isPathClear(board, fr, fc, tr, tc);
      case 'Q':
        return ((adr === adc && adr > 0) || ((dr === 0 || dc === 0) && (adr + adc > 0)))
          && this.isPathClear(board, fr, fc, tr, tc);
      case 'K':
        return adr <= 1 && adc <= 1 && (adr + adc > 0);
    }
    return false;
  }

  /** Check if path between two squares is clear (for sliding pieces) */
  static isPathClear(board, fr, fc, tr, tc) {
    const dr = Math.sign(tr - fr);
    const dc = Math.sign(tc - fc);
    let r = fr + dr, c = fc + dc;
    while (r !== tr || c !== tc) {
      if (board[r][c] !== ' ') return false;
      r += dr; c += dc;
    }
    return true;
  }

  /** Is the given color in check? */
  static isInCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return false;
    const opponent = color === 'white' ? 'black' : 'white';
    return this.isSquareAttacked(board, kingPos[0], kingPos[1], opponent);
  }

  /**
   * Get all legal moves for a piece at (row, col).
   * Returns array of {row, col, special?} where special can be
   * 'castle-king', 'castle-queen', 'en-passant', 'promotion'
   */
  static getLegalMoves(board, row, col, gameState) {
    const piece = board[row][col];
    if (piece === ' ') return [];
    const color = this.colorOf(piece);
    const candidates = this.getRawMoves(board, row, col, gameState);

    // Filter out moves that leave own king in check
    return candidates.filter(move => {
      const sim = this.simulateMove(board, row, col, move.row, move.col, move.special);
      return !this.isInCheck(sim, color);
    });
  }

  /** Get raw (pseudo-legal) moves — doesn't filter for self-check */
  static getRawMoves(board, row, col, gameState) {
    const piece = board[row][col];
    const color = this.colorOf(piece);
    const type = this.typeOf(piece);
    const moves = [];

    const addIfValid = (r, c, special) => {
      if (r < 0 || r > 7 || c < 0 || c > 7) return false;
      const target = board[r][c];
      if (target !== ' ' && this.colorOf(target) === color) return false;
      moves.push({ row: r, col: c, special });
      return target === ' '; // return true if square was empty (for sliding)
    };

    switch (type) {
      case 'P': {
        const dir = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        const promoRow = color === 'white' ? 0 : 7;
        const nextRow = row + dir;

        // Forward
        if (board[nextRow]?.[col] === ' ') {
          const sp = nextRow === promoRow ? 'promotion' : undefined;
          moves.push({ row: nextRow, col, special: sp });
          // Double push from start
          if (row === startRow && board[row + 2 * dir][col] === ' ') {
            moves.push({ row: row + 2 * dir, col, special: 'double-push' });
          }
        }
        // Captures
        for (const dc of [-1, 1]) {
          const nc = col + dc;
          if (nc < 0 || nc > 7) continue;
          const target = board[nextRow][nc];
          if (target !== ' ' && this.colorOf(target) !== color) {
            const sp = nextRow === promoRow ? 'promotion' : undefined;
            moves.push({ row: nextRow, col: nc, special: sp });
          }
          // En passant
          if (gameState?.enPassant && gameState.enPassant[0] === nextRow && gameState.enPassant[1] === nc) {
            moves.push({ row: nextRow, col: nc, special: 'en-passant' });
          }
        }
        break;
      }
      case 'N':
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
          addIfValid(row + dr, col + dc);
        break;
      case 'B':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]])
          for (let i = 1; i < 8; i++)
            if (!addIfValid(row + dr*i, col + dc*i)) break;
        break;
      case 'R':
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]])
          for (let i = 1; i < 8; i++)
            if (!addIfValid(row + dr*i, col + dc*i)) break;
        break;
      case 'Q':
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
          for (let i = 1; i < 8; i++)
            if (!addIfValid(row + dr*i, col + dc*i)) break;
        break;
      case 'K': {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
          addIfValid(row + dr, col + dc);
        // Castling
        if (gameState) {
          const opponent = color === 'white' ? 'black' : 'white';
          const r = color === 'white' ? 7 : 0;
          if (row === r && col === 4 && !this.isInCheck(board, color)) {
            // King-side
            if (gameState.castling[color].king
              && board[r][5] === ' ' && board[r][6] === ' '
              && board[r][7] === (color === 'white' ? 'R' : 'r')
              && !this.isSquareAttacked(board, r, 5, opponent)
              && !this.isSquareAttacked(board, r, 6, opponent)) {
              moves.push({ row: r, col: 6, special: 'castle-king' });
            }
            // Queen-side
            if (gameState.castling[color].queen
              && board[r][3] === ' ' && board[r][2] === ' ' && board[r][1] === ' '
              && board[r][0] === (color === 'white' ? 'R' : 'r')
              && !this.isSquareAttacked(board, r, 3, opponent)
              && !this.isSquareAttacked(board, r, 2, opponent)) {
              moves.push({ row: r, col: 2, special: 'castle-queen' });
            }
          }
        }
        break;
      }
    }
    return moves;
  }

  /** Simulate a move on a cloned board */
  static simulateMove(board, fr, fc, tr, tc, special) {
    const sim = this.cloneBoard(board);
    const piece = sim[fr][fc];
    const color = this.colorOf(piece);
    sim[tr][tc] = piece;
    sim[fr][fc] = ' ';

    if (special === 'en-passant') {
      const capturedRow = color === 'white' ? tr + 1 : tr - 1;
      sim[capturedRow][tc] = ' ';
    } else if (special === 'castle-king') {
      const r = fr;
      sim[r][5] = sim[r][7]; sim[r][7] = ' ';
    } else if (special === 'castle-queen') {
      const r = fr;
      sim[r][3] = sim[r][0]; sim[r][0] = ' ';
    } else if (special === 'promotion') {
      sim[tr][tc] = color === 'white' ? 'Q' : 'q'; // default to queen
    }
    return sim;
  }

  /** Check if color has any legal move */
  static hasLegalMoves(board, color, gameState) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (board[r][c] !== ' ' && this.colorOf(board[r][c]) === color)
          if (this.getLegalMoves(board, r, c, gameState).length > 0) return true;
    return false;
  }

  /** Determine game result: 'checkmate', 'stalemate', or null (ongoing) */
  static getGameResult(board, currentTurn, gameState) {
    const hasMove = this.hasLegalMoves(board, currentTurn, gameState);
    if (!hasMove) {
      return this.isInCheck(board, currentTurn) ? 'checkmate' : 'stalemate';
    }
    return null;
  }
}
