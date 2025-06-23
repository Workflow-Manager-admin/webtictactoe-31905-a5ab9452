import React, { useState, useEffect } from 'react';
import './App.css';

// Color palette (light theme, minimal) from requirements:
const COLORS = {
  primary: '#1976d2',
  accent: '#ff9800',
  secondary: '#ffffff',
};

// Backend base URL -- expects backend on port 3001 per default FastAPI config
const BACKEND_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

function getInitialBoard() {
  return Array(3).fill(null).map(() => Array(3).fill(null));
}

// PUBLIC_INTERFACE
function App() {
  // Game state
  const [board, setBoard] = useState(getInitialBoard());
  const [gameId, setGameId] = useState(null);
  const [player, setPlayer] = useState(null); // 'X' or 'O'
  const [status, setStatus] = useState('idle'); // 'idle' | 'waiting_for_move' | 'finished'
  const [turn, setTurn] = useState(null);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState('');
  const [scoreboard, setScoreboard] = useState({ X: 0, O: 0, D: 0 });

  // Helper for notification style and duration
  function showNotify(msg, timeout = 2500) {
    setMessage(msg);
    if (msg) {
      setTimeout(() => setMessage(''), timeout);
    }
  }

  // API helpers
  async function startGame() {
    const resp = await fetch(`${BACKEND_BASE_URL}/new_game`, { method: "POST" });
    const data = await resp.json();
    setGameId(data.game_id);
    setPlayer('X');
    setStatus('waiting_for_move');
    setBoard(getInitialBoard());
    setWinner(null);
    setTurn('X');
    updateScore(data.winner, true); // ensure reset
    showNotify('Game started! You are X.');
  }

  async function joinGame(id) {
    const resp = await fetch(`${BACKEND_BASE_URL}/join_game/${id}`, { method: "POST" });
    if (resp.status === 404) {
      showNotify('Game not found!');
      return;
    }
    const data = await resp.json();
    setGameId(id);
    setPlayer('O');
    setStatus(data.status || 'waiting_for_move');
    setBoard(data.board || getInitialBoard());
    setWinner(data.winner);
    setTurn(data.turn);
    updateScore(data.winner, true); // ensure reset
    showNotify('Joined as O.');
  }

  async function fetchState(id) {
    const resp = await fetch(`${BACKEND_BASE_URL}/game_state/${id}`);
    if (resp.ok) {
      const d = await resp.json();
      setBoard(d.board);
      setStatus(d.status);
      setTurn(d.turn);
      setWinner(d.winner);
      if (d.winner) {
        updateScore(d.winner);
        showNotify(d.winner === "Draw" ? "It's a draw!" : `Player ${d.winner} wins!`);
      }
    }
  }

  // Scoreboard logic (in-memory, not persisted)
  function updateScore(winner, reset) {
    setScoreboard((old) => {
      if (reset) return { X: 0, O: 0, D: 0 };
      if (!winner) return old;
      const newBoard = { ...old };
      if (winner === "X") newBoard.X += 1;
      else if (winner === "O") newBoard.O += 1;
      else if (winner === "Draw") newBoard.D += 1;
      return newBoard;
    });
  }

  // Handle move
  async function handleCellClick(row, col) {
    if (!gameId || winner) return;
    if (board[row][col]) return;
    if (player !== turn) {
      showNotify(`Wait your turn (${turn})`);
      return;
    }
    const resp = await fetch(`${BACKEND_BASE_URL}/move/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row, col, player }),
    });
    if (resp.ok) {
      const d = await resp.json();
      setBoard(d.board);
      setTurn(d.turn);
      setWinner(d.winner);
      setStatus(d.status);
      if (d.winner) {
        updateScore(d.winner);
        showNotify(d.winner === "Draw" ? "It's a draw!" : `Player ${d.winner} wins!`);
      }
    } else {
      showNotify('Invalid move!');
    }
  }

  // Poll for state if multiplayer (to keep up to date), on interval
  useEffect(() => {
    if (!gameId || winner) return;
    const interval = setInterval(() => {
      fetchState(gameId);
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [gameId, winner]);

  // Reset game (same session, new game)
  async function handleReset() {
    setGameId(null);
    setPlayer(null);
    setStatus('idle');
    setBoard(getInitialBoard());
    setTurn(null);
    setWinner(null);
    setMessage('');
    updateScore(null, true);
  }

  // UI components
  function renderBoard() {
    return (
      <div className="ttt-board" style={{
        display: 'grid',
        gridTemplateRows: 'repeat(3, 1fr)',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        margin: '0 auto',
        maxWidth: 350,
        width: '95vw'
      }}>
        {board.map((row, i) =>
          row.map((cell, j) => {
            const key = i * 3 + j;
            return (
              <button key={key}
                className="ttt-cell"
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  fontSize: '2.1rem',
                  background: COLORS.secondary,
                  border: `2px solid ${COLORS.primary}`,
                  borderRadius: 8,
                  color: cell === "X" ? COLORS.primary : (cell === "O" ? COLORS.accent : "#888"),
                  fontWeight: 700,
                  cursor: cell || winner ? 'not-allowed' : 'pointer',
                  transition: 'background .15s',
                }}
                disabled={!!cell || !!winner || !gameId}
                aria-label={`Cell ${i+1},${j+1} ${cell ? cell : ''}`}
                onClick={() => handleCellClick(i, j)}
              >
                {cell}
              </button>
            );
          })
        )}
      </div>
    );
  }

  function renderScoreboard() {
    return (
      <div className="ttt-scoreboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 18,
        }}>
        <span style={{
          color: COLORS.primary,
          fontWeight: 'bold',
        }}>X&nbsp;
          <span style={{ minWidth: 28, display: 'inline-block', textAlign: 'center' }}>{scoreboard.X}</span>
        </span>
        <span>|</span>
        <span style={{
          color: COLORS.accent,
          fontWeight: 'bold',
        }}>O&nbsp;
          <span style={{ minWidth: 28, display: 'inline-block', textAlign: 'center' }}>{scoreboard.O}</span>
        </span>
        <span>|</span>
        <span style={{ color: "#888" }}>Draw&nbsp;
          <span style={{ minWidth: 28, display: 'inline-block', textAlign: 'center' }}>{scoreboard.D}</span>
        </span>
      </div>
    );
  }

  function renderControls() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {status === 'idle' && (
          <>
            <button className="btn btn-large" style={{ background: COLORS.primary }}
              onClick={startGame}>Start New Game</button>
            <JoinGameForm onJoin={joinGame} />
          </>
        )}
        {gameId && (
          <>
            <button className="btn"
              style={{
                background: winner ? COLORS.accent : COLORS.primary,
                color: "#fff"
              }}
              onClick={handleReset}
            >{winner ? "New Game" : "Reset"}</button>
            <div style={{ fontSize: "0.95rem", color: "#444", marginTop: 2 }}>
              Game ID: <span style={{ fontWeight: 600 }}>{gameId}</span> &nbsp;
              <span style={{ color: "#bbb" }}>
                ({player ? `You are "${player}"` : 'Spectator'})
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderStatus() {
    if (winner) {
      return <div className="ttt-status" style={{
        marginTop: 16,
        fontWeight: 'bold',
        fontSize: '1.2rem',
        color: COLORS.accent,
      }}>{winner === "Draw" ? "It's a draw!" : `Player ${winner} wins!`}</div>;
    }
    if (gameId && status === 'waiting_for_move') {
      return <div className="ttt-status"
        style={{
          margin: "12px 0 2px",
          color: player === turn ? COLORS.primary : "#8e8e8e",
          fontWeight: player === turn ? 'bold' : undefined,
        }}>
        {player === turn ? "Your turn" : `Waiting for "${turn}"`}
      </div>;
    }
    if (status === "idle") {
      return <div className="ttt-status" style={{ margin: "12px 0 2px", color: "#888" }}>
        Start or join a game below.
      </div>;
    }
    return null;
  }

  return (
    <div className="app" style={{ minHeight: '100vh', background: COLORS.secondary }}>
      {/* Navigation */}
      <nav className="navbar" style={{ background: COLORS.primary }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div className="logo" style={{ color: "#fff" }}>
              <span className="logo-symbol" style={{ color: COLORS.accent, fontWeight: 900, fontSize: 22 }}>✱</span>
              Tic Tac Toe
            </div>
            <span style={{
              background: COLORS.accent,
              color: "#fff",
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 10,
              fontSize: '0.95rem'
            }}>
              Minimal UI Demo
            </span>
          </div>
        </div>
      </nav>
      {/* Main content */}
      <main>
        <div className="container" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 'calc(100vh - 80px)',
          justifyContent: 'center',
        }}>
          <div className="hero" style={{
            paddingTop: 100,
            paddingBottom: 24,
            alignItems: 'center',
            width: '100%',
            maxWidth: 420,
            minHeight: '340px'
          }}>
            <div className="title" style={{
              textAlign: 'center',
              fontSize: '2.5rem',
              fontWeight: 700,
              marginBottom: 8,
              color: COLORS.primary
            }}>Tic Tac Toe</div>
            {renderScoreboard()}
            {renderBoard()}
            {renderStatus()}
            {renderControls()}
          </div>
        </div>
        {/* Notifications */}
        {message && (<div
          id="ttt-notification"
          style={{
            position: 'fixed',
            left: '50%',
            top: '24px',
            transform: 'translateX(-50%)',
            background: COLORS.accent,
            color: '#fff',
            padding: '12px 30px',
            borderRadius: '999px',
            fontWeight: 600,
            fontSize: '1.07rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            zIndex: 9999,
            letterSpacing: '0.4px',
            opacity: 0.96,
            transition: 'opacity .3s'
          }}
        >{message}</div>)}
      </main>
      <footer style={{
        textAlign: 'center',
        padding: '12px 0',
        background: "#f5faff",
        fontSize: '0.98rem',
        color: COLORS.primary,
        letterSpacing: '0.4px',
        borderTop: `1px solid ${COLORS.primary}22`
      }}>
        Kavia Tic Tac Toe &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

// Join by entering gameId
function JoinGameForm({ onJoin }) {
  const [input, setInput] = useState('');
  return (
    <form
      style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}
      onSubmit={e => {
        e.preventDefault();
        if (input.length > 0) onJoin(input.trim());
      }}
      autoComplete="off"
    >
      <input
        style={{
          padding: "9px",
          border: `1.5px solid ${COLORS.primary}`,
          borderRadius: 5,
          outline: 'none',
          fontSize: "1rem",
          minWidth: 120,
          background: COLORS.secondary,
        }}
        placeholder="Game ID"
        aria-label="Game ID"
        type="text"
        value={input}
        onChange={e => setInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
        maxLength={32}
      />
      <button className="btn" style={{
        background: COLORS.accent,
        color: "#fff",
        fontWeight: 500
      }} type="submit">Join Game</button>
    </form>
  );
}

export default App;
