/**
 * PGN (Portable Game Notation) — export/import chess games.
 */
import { ChessEngine } from './engine.js';

const COLS = 'abcdefgh';
const PIECE_LETTER = { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: '' };

export class PGN {

  /** Convert move history to PGN string */
  static export(history, metadata = {}) {
    const tags = {
      Event: metadata.event || 'Chess Arena Game',
      Site: metadata.site || 'games.marsala.dev',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: metadata.white || 'Player 1',
      Black: metadata.black || 'Player 2',
      Result: metadata.result || '*',
      ...metadata,
    };

    let pgn = '';
    for (const [key, val] of Object.entries(tags)) {
      pgn += `[${key} "${val}"]\n`;
    }
    pgn += '\n';

    const moves = [];
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;

      let notation = '';
      if (h.special === 'castle-king') {
        notation = 'O-O';
      } else if (h.special === 'castle-queen') {
        notation = 'O-O-O';
      } else {
        const type = ChessEngine.typeOf(h.piece);
        notation = PIECE_LETTER[type] || '';

        // Disambiguation for non-pawns
        if (type !== 'P' && type !== 'K') {
          notation += COLS[h.from[1]];
        }

        // Capture
        if (h.captured !== ' ') {
          if (type === 'P') notation += COLS[h.from[1]];
          notation += 'x';
        }

        notation += COLS[h.to[1]] + (8 - h.to[0]);

        if (h.special === 'promotion') notation += '=Q';
        if (h.special === 'en-passant') notation += ' e.p.';
      }

      // Check/checkmate markers
      if (h.check) notation += h.checkmate ? '#' : '+';

      if (isWhite) {
        moves.push(`${moveNum}. ${notation}`);
      } else {
        moves[moves.length - 1] += ` ${notation}`;
      }
    }

    pgn += moves.join(' ');
    if (metadata.result) pgn += ' ' + metadata.result;

    return pgn;
  }

  /** Parse PGN string to move list (simplified) */
  static parse(pgnStr) {
    const tags = {};
    const tagRegex = /\[(\w+)\s+"([^"]+)"\]/g;
    let match;
    while ((match = tagRegex.exec(pgnStr)) !== null) {
      tags[match[1]] = match[2];
    }

    // Extract move text (after tags)
    let moveText = pgnStr.replace(/\[.*?\]/g, '').trim();
    // Remove comments
    moveText = moveText.replace(/\{[^}]*\}/g, '');
    // Remove variations
    moveText = moveText.replace(/\([^)]*\)/g, '');
    // Remove move numbers
    moveText = moveText.replace(/\d+\.\s*/g, '');
    // Remove result
    moveText = moveText.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '');

    const moveTokens = moveText.split(/\s+/).filter(t => t.length > 0);

    return { tags, moves: moveTokens };
  }

  /** Generate download of PGN file */
  static download(history, metadata = {}) {
    const pgn = this.export(history, metadata);
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-arena-${Date.now()}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
