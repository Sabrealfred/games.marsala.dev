/**
 * AI Chess Engine — runs in a Web Worker.
 * Minimax with alpha-beta pruning, iterative deepening,
 * piece-square tables, and an opening book.
 */

// ── Piece values & tables ────────────────────────────
const PIECE_VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// Piece-square tables (white's perspective, flipped for black)
const PST = {
  P: [
    [0,0,0,0,0,0,0,0],
    [50,50,50,50,50,50,50,50],
    [10,10,20,30,30,20,10,10],
    [5,5,10,25,25,10,5,5],
    [0,0,0,20,20,0,0,0],
    [5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],
    [0,0,0,0,0,0,0,0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],
    [-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],
    [-30,5,10,15,15,10,5,-30],
    [-40,-20,0,5,5,0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,5,5,10,10,5,5,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,10,10,10,10,10,10,-10],
    [-10,5,0,0,0,0,5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [0,0,0,0,0,0,0,0],
    [5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [0,0,0,5,5,0,0,0],
  ],
  Q: [
    [-20,-10,-10,-5,-5,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],
    [-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],
    [-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],
    [-20,-10,-10,-5,-5,-10,-10,-20],
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],
    [20,30,10,0,0,10,30,20],
  ],
};

// ── Opening Book (ECO codes) ─────────────────────────
const OPENING_BOOK = {
  // Starting position responses
  '': [
    { from: [6,4], to: [4,4] },  // e4
    { from: [6,3], to: [4,3] },  // d4
    { from: [7,6], to: [5,5] },  // Nf3
    { from: [6,2], to: [4,2] },  // c4
  ],
  // After 1.e4
  'e2e4': [
    { from: [1,4], to: [3,4] },  // e5
    { from: [1,2], to: [3,2] },  // c5 (Sicilian)
    { from: [1,4], to: [2,4] },  // e6 (French)
    { from: [1,2], to: [2,2] },  // c6 (Caro-Kann)
  ],
  // After 1.d4
  'd2d4': [
    { from: [1,3], to: [3,3] },  // d5
    { from: [0,6], to: [2,5] },  // Nf6 (Indian)
    { from: [1,4], to: [2,4] },  // e6
  ],
  // After 1.e4 e5
  'e2e4e7e5': [
    { from: [7,6], to: [5,5] },  // Nf3
    { from: [7,5], to: [4,2] },  // Bc4 (Italian)
    { from: [6,5], to: [4,5] },  // f4 (King's Gambit)
  ],
  // After 1.e4 e5 2.Nf3
  'e2e4e7e5g1f3': [
    { from: [0,1], to: [2,2] },  // Nc6
    { from: [0,6], to: [2,5] },  // Nf6 (Petrov)
  ],
  // After 1.d4 d5
  'd2d4d7d5': [
    { from: [6,2], to: [4,2] },  // c4 (Queen's Gambit)
    { from: [7,6], to: [5,5] },  // Nf3
  ],
  // Sicilian: 1.e4 c5
  'e2e4c7c5': [
    { from: [7,6], to: [5,5] },  // Nf3 (Open Sicilian)
    { from: [7,1], to: [5,2] },  // Nc3 (Closed)
  ],
};

// ── Chess Engine (duplicated from engine.js for worker) ──

function colorOf(p) { return p === ' ' ? null : p === p.toUpperCase() ? 'white' : 'black'; }
function typeOf(p) { return p.toUpperCase(); }

function cloneBoard(b) { return b.map(r => [...r]); }

function findKing(board, color) {
  const k = color === 'white' ? 'K' : 'k';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] === k) return [r, c];
  return null;
}

function isPathClear(board, fr, fc, tr, tc) {
  const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
  let r = fr + dr, c = fc + dc;
  while (r !== tr || c !== tc) {
    if (board[r][c] !== ' ') return false;
    r += dr; c += dc;
  }
  return true;
}

function canPieceAttack(board, fr, fc, tr, tc) {
  const piece = board[fr][fc];
  const type = typeOf(piece);
  const color = colorOf(piece);
  const dr = tr - fr, dc = tc - fc;
  const adr = Math.abs(dr), adc = Math.abs(dc);
  switch (type) {
    case 'P': return dr === (color === 'white' ? -1 : 1) && adc === 1;
    case 'N': return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
    case 'B': return adr === adc && adr > 0 && isPathClear(board, fr, fc, tr, tc);
    case 'R': return (dr === 0 || dc === 0) && (adr + adc > 0) && isPathClear(board, fr, fc, tr, tc);
    case 'Q': return ((adr === adc && adr > 0) || ((dr === 0 || dc === 0) && (adr + adc > 0))) && isPathClear(board, fr, fc, tr, tc);
    case 'K': return adr <= 1 && adc <= 1 && (adr + adc > 0);
  }
  return false;
}

function isSquareAttacked(board, row, col, byColor) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p !== ' ' && colorOf(p) === byColor && canPieceAttack(board, r, c, row, col)) return true;
    }
  return false;
}

function isInCheck(board, color) {
  const kp = findKing(board, color);
  if (!kp) return false;
  return isSquareAttacked(board, kp[0], kp[1], color === 'white' ? 'black' : 'white');
}

function getRawMoves(board, row, col, state) {
  const piece = board[row][col];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const moves = [];
  const add = (r, c, sp) => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    const t = board[r][c];
    if (t !== ' ' && colorOf(t) === color) return false;
    moves.push({ row: r, col: c, special: sp });
    return t === ' ';
  };
  switch (type) {
    case 'P': {
      const dir = color === 'white' ? -1 : 1;
      const start = color === 'white' ? 6 : 1;
      const promo = color === 'white' ? 0 : 7;
      const nr = row + dir;
      if (nr >= 0 && nr <= 7 && board[nr][col] === ' ') {
        moves.push({ row: nr, col, special: nr === promo ? 'promotion' : undefined });
        if (row === start && board[row + 2*dir][col] === ' ')
          moves.push({ row: row + 2*dir, col, special: 'double-push' });
      }
      for (const dc of [-1, 1]) {
        const nc = col + dc;
        if (nc < 0 || nc > 7) continue;
        if (nr >= 0 && nr <= 7) {
          if (board[nr][nc] !== ' ' && colorOf(board[nr][nc]) !== color)
            moves.push({ row: nr, col: nc, special: nr === promo ? 'promotion' : undefined });
          if (state?.enPassant && state.enPassant[0] === nr && state.enPassant[1] === nc)
            moves.push({ row: nr, col: nc, special: 'en-passant' });
        }
      }
      break;
    }
    case 'N':
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(row+dr, col+dc);
      break;
    case 'B':
      for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) for (let i=1;i<8;i++) if (!add(row+dr*i,col+dc*i)) break;
      break;
    case 'R':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) for (let i=1;i<8;i++) if (!add(row+dr*i,col+dc*i)) break;
      break;
    case 'Q':
      for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) for (let i=1;i<8;i++) if (!add(row+dr*i,col+dc*i)) break;
      break;
    case 'K': {
      for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(row+dr, col+dc);
      if (state) {
        const opp = color === 'white' ? 'black' : 'white';
        const r = color === 'white' ? 7 : 0;
        if (row === r && col === 4 && !isInCheck(board, color)) {
          if (state.castling[color].king && board[r][5]===' ' && board[r][6]===' ' && board[r][7]===(color==='white'?'R':'r') && !isSquareAttacked(board,r,5,opp) && !isSquareAttacked(board,r,6,opp))
            moves.push({ row: r, col: 6, special: 'castle-king' });
          if (state.castling[color].queen && board[r][3]===' ' && board[r][2]===' ' && board[r][1]===' ' && board[r][0]===(color==='white'?'R':'r') && !isSquareAttacked(board,r,3,opp) && !isSquareAttacked(board,r,2,opp))
            moves.push({ row: r, col: 2, special: 'castle-queen' });
        }
      }
      break;
    }
  }
  return moves;
}

function simulateMove(board, fr, fc, tr, tc, special) {
  const sim = cloneBoard(board);
  const piece = sim[fr][fc];
  const color = colorOf(piece);
  sim[tr][tc] = piece;
  sim[fr][fc] = ' ';
  if (special === 'en-passant') sim[color === 'white' ? tr+1 : tr-1][tc] = ' ';
  else if (special === 'castle-king') { sim[fr][5] = sim[fr][7]; sim[fr][7] = ' '; }
  else if (special === 'castle-queen') { sim[fr][3] = sim[fr][0]; sim[fr][0] = ' '; }
  else if (special === 'promotion') sim[tr][tc] = color === 'white' ? 'Q' : 'q';
  return sim;
}

function getLegalMoves(board, row, col, state) {
  const piece = board[row][col];
  if (piece === ' ') return [];
  const color = colorOf(piece);
  return getRawMoves(board, row, col, state).filter(m => {
    const sim = simulateMove(board, row, col, m.row, m.col, m.special);
    return !isInCheck(sim, color);
  });
}

function getAllMoves(board, color, state) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] !== ' ' && colorOf(board[r][c]) === color)
        getLegalMoves(board, r, c, state).forEach(m => moves.push({ fr: r, fc: c, ...m }));
  return moves;
}

// ── Evaluation ───────────────────────────────────────

function evaluate(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === ' ') continue;
      const type = typeOf(p);
      const val = PIECE_VAL[type] || 0;
      const pst = PST[type] ? PST[type][colorOf(p) === 'white' ? r : 7 - r][c] : 0;
      if (colorOf(p) === 'white') score += val + pst;
      else score -= val + pst;
    }
  }
  return score;
}

// ── Move ordering (captures first, then centrality) ──

function orderMoves(board, moves) {
  return moves.sort((a, b) => {
    const capA = board[a.row][a.col] !== ' ' ? PIECE_VAL[typeOf(board[a.row][a.col])] || 0 : 0;
    const capB = board[b.row][b.col] !== ' ' ? PIECE_VAL[typeOf(board[b.row][b.col])] || 0 : 0;
    if (capA !== capB) return capB - capA;
    // Center control bonus
    const cenA = (3.5 - Math.abs(a.row - 3.5)) + (3.5 - Math.abs(a.col - 3.5));
    const cenB = (3.5 - Math.abs(b.row - 3.5)) + (3.5 - Math.abs(b.col - 3.5));
    return cenB - cenA;
  });
}

// ── Minimax with Alpha-Beta ──────────────────────────

function minimax(board, depth, alpha, beta, maximizing, state, nodesSearched) {
  nodesSearched.count++;

  const color = maximizing ? 'white' : 'black';
  const moves = getAllMoves(board, color, state);

  if (moves.length === 0) {
    return isInCheck(board, color) ? (maximizing ? -99999 + (10 - depth) : 99999 - (10 - depth)) : 0;
  }

  if (depth === 0) return evaluate(board);

  orderMoves(board, moves);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const sim = simulateMove(board, move.fr, move.fc, move.row, move.col, move.special);
      const newState = updateState(state, board, move);
      const ev = minimax(sim, depth - 1, alpha, beta, false, newState, nodesSearched);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const sim = simulateMove(board, move.fr, move.fc, move.row, move.col, move.special);
      const newState = updateState(state, board, move);
      const ev = minimax(sim, depth - 1, alpha, beta, true, newState, nodesSearched);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function updateState(state, board, move) {
  const newState = JSON.parse(JSON.stringify(state));
  const piece = board[move.fr][move.fc];
  const color = colorOf(piece);
  const type = typeOf(piece);
  if (type === 'K') { newState.castling[color].king = false; newState.castling[color].queen = false; }
  if (type === 'R') {
    if (move.fc === 0) newState.castling[color].queen = false;
    if (move.fc === 7) newState.castling[color].king = false;
  }
  if (move.special === 'double-push') {
    newState.enPassant = [color === 'white' ? move.fr - 1 : move.fr + 1, move.fc];
  } else {
    newState.enPassant = null;
  }
  return newState;
}

// ── Opening Book Lookup ──────────────────────────────

function getBookMove(history) {
  const key = history.map(m => {
    const cols = 'abcdefgh';
    return cols[m.fc] + (8 - m.fr) + cols[m.col] + (8 - m.row);
  }).join('');

  const candidates = OPENING_BOOK[key];
  if (candidates && candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

// ── Main Search ──────────────────────────────────────

function findBestMove(board, color, state, depth, history) {
  // Try opening book first
  const bookMove = getBookMove(history || []);
  if (bookMove) {
    const piece = board[bookMove.from[0]][bookMove.from[1]];
    if (piece !== ' ' && colorOf(piece) === color) {
      const legal = getLegalMoves(board, bookMove.from[0], bookMove.from[1], state);
      const match = legal.find(m => m.row === bookMove.to[0] && m.col === bookMove.to[1]);
      if (match) {
        return { fr: bookMove.from[0], fc: bookMove.from[1], ...match, source: 'book' };
      }
    }
  }

  const maximizing = color === 'white';
  const moves = getAllMoves(board, color, state);
  if (moves.length === 0) return null;

  orderMoves(board, moves);

  let bestMove = moves[0];
  let bestEval = maximizing ? -Infinity : Infinity;
  const nodesSearched = { count: 0 };

  for (const move of moves) {
    const sim = simulateMove(board, move.fr, move.fc, move.row, move.col, move.special);
    const newState = updateState(state, board, move);
    const ev = minimax(sim, depth - 1, -Infinity, Infinity, !maximizing, newState, nodesSearched);

    if (maximizing ? ev > bestEval : ev < bestEval) {
      bestEval = ev;
      bestMove = move;
    }
  }

  return { ...bestMove, eval: bestEval, nodes: nodesSearched.count, source: 'search' };
}

// ── Worker Message Handler ───────────────────────────

self.onmessage = function(e) {
  const { type, board, color, state, difficulty, history } = e.data;

  if (type === 'find-move') {
    const depthMap = { easy: 2, medium: 3, hard: 4, expert: 5 };
    const depth = depthMap[difficulty] || 3;

    const start = performance.now();
    const move = findBestMove(board, color, state, depth, history);
    const elapsed = performance.now() - start;

    // Add slight delay on easy for "thinking" feel
    const minDelay = difficulty === 'easy' ? 500 : difficulty === 'medium' ? 300 : 100;
    const delay = Math.max(0, minDelay - elapsed);

    setTimeout(() => {
      self.postMessage({ type: 'move-found', move, elapsed: elapsed + delay, depth });
    }, delay);
  }
};
