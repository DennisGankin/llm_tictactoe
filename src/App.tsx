import React, { useState, useEffect, useRef } from 'react';
import './App.css'
import ollama from 'ollama'

// Types for the board and players
type Player = 'X' | 'O';
type Square = Player | null;
type Board = Square[];

// Utility to check for a winner and return winning line
function calculateWinner(board: Board): { winner: Player; line: number[] } | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, line };
    }
  }
  return null;
}

// Simple bot: win if possible, block if needed, else pick first empty
function botMove(board: Board, bot: Player, user: Player): number {
  // Try to win
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      const copy = [...board];
      copy[i] = bot;
      if (calculateWinner(copy)?.winner === bot) return i;
    }
  }
  // Try to block user
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      const copy = [...board];
      copy[i] = user;
      if (calculateWinner(copy)?.winner === user) return i;
    }
  }
  // Otherwise, pick first empty
  return board.findIndex((sq) => !sq);
}

function Square({ value, onClick, highlight }: { value: Square; onClick: () => void; highlight?: boolean }) {
  return (
    <button className={highlight ? 'square highlight' : 'square'} onClick={onClick} disabled={!!value}>
      {value}
    </button>
  );
}

// --- Ollama API integration ---
async function fetchOllamaMove(
  board: Board,
  bot: Player,
  user: Player
): Promise<{ move: number; comment: string }> {
  const prompt = `You are an expert Tic-Tac-Toe bot. The board is a 3x3 grid with positions 0-8:

Board layout:
0 | 1 | 2
---------
3 | 4 | 5
---------
6 | 7 | 8

Current board: [${board.map((sq) => sq || 'empty').join(', ')}]
You are: ${bot}
Opponent is: ${user}

STRATEGY (in order of priority):
1. WIN: If you can win in one move, take it immediately
2. BLOCK: If opponent can win next turn, block them
3. CENTER: Take center (position 4) if available - it's the strongest position
4. CORNERS: Take corners (0,2,6,8) - they create multiple winning paths
5. SIDES: Only take sides (1,3,5,7) as last resort

Analyze the board carefully and choose the BEST strategic move.

Respond ONLY in this exact JSON format:
{"move": <number>, "comment": "<your cheeky comment>"}`;

  try {
    const response = await ollama.chat({
      model: 'llama3.1',
      messages: [{ role: 'user', content: prompt }],
    });
    
    const responseText = response.message.content;
    
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[^}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.move !== undefined && parsed.comment && 
          parsed.move >= 0 && parsed.move <= 8 && !board[parsed.move]) {
        return { move: parsed.move, comment: parsed.comment };
      }
    }
  } catch (error) {
    console.error('Ollama API error:', error);
  }
  
  // fallback: use the simple bot logic
  const fallbackMove = botMove(board, bot, user);
  const phrases = [
    "Interesting play!",
    "Are you letting me win?",
    "Are you getting scared?",
    "Hmm, let's see what you do next.",
    "That was a bold move!",
    "I'm watching your strategy...",
    "You won't beat me that easily!",
    "Nice try!",
    "I like your style!"
  ];
  const idx = Math.floor(Math.random() * phrases.length);
  return {
    move: fallbackMove,
    comment: phrases[idx]
  };
}

function App() {
  const [user, setUser] = useState<Player>('X');
  const [bot, setBot] = useState<Player>('O');
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true); // X always starts
  const [chat, setChat] = useState<string[]>([]);
  const [botType, setBotType] = useState<'simple' | 'chatgpt'>('simple');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const botMoveInProgress = useRef(false);
  const winnerInfo = calculateWinner(board);
  const winner = winnerInfo?.winner || null;
  const winningLine = winnerInfo?.line || [];
  const isDraw = !winner && board.every(Boolean);

  // Handle user move
  function handleClick(i: number) {
    if (board[i] || winner || isBotThinking) return;
    
    // Check if it's actually the user's turn
    const isUserTurn = (xIsNext && user === 'X') || (!xIsNext && user === 'O');
    if (!isUserTurn) return;
    
    const newBoard = board.slice();
    newBoard[i] = xIsNext ? 'X' : 'O';
    setBoard(newBoard);
    setXIsNext(!xIsNext);
  }

  // Helper to add a bot message
  function botSay(message: string) {
    setChat((prev) => [...prev, message]);
  }
  function botSayRandom() {
    const phrases = [
      "Interesting play!",
      "Are you letting me win?",
      "Are you getting scared?",
      "Hmm, let's see what you do next.",
      "That was a bold move!",
      "I'm watching your strategy...",
      "You won't beat me that easily!",
      "Nice try!",
      "I like your style!"
    ];
    const idx = Math.floor(Math.random() * phrases.length);
    botSay(phrases[idx]);
  }

  // Bot move effect
  useEffect(() => {
    // Don't move on initial render
    if (board.every(sq => sq === null) && user === 'X') {
      return; // User X should move first
    }
    
    // Early exit conditions
    if (winner || isDraw || isBotThinking || botMoveInProgress.current) {
      return;
    }
    
    // Check if it's the bot's turn
    const currentPlayer = xIsNext ? 'X' : 'O';
    if (currentPlayer !== bot) {
      return; // Not the bot's turn
    }
    
    // Bot should make a move
    botMoveInProgress.current = true;
    
    if (botType === 'simple') {
      const move = botMove(board, bot, user);
      if (move !== -1) {
        setTimeout(() => {
          setBoard(prevBoard => {
            const newBoard = [...prevBoard];
            newBoard[move] = bot;
            return newBoard;
          });
          setXIsNext(prev => !prev);
          botSayRandom();
          // Use setTimeout to reset on next tick
          setTimeout(() => {
            botMoveInProgress.current = false;
          }, 0);
        }, 500);
      } else {
        botMoveInProgress.current = false;
      }
    } else if (botType === 'chatgpt') {
      setIsBotThinking(true);
      
      fetchOllamaMove(board, bot, user).then(({ move, comment }) => {
        setBoard(prevBoard => {
          const newBoard = [...prevBoard];
          if (!newBoard[move] && move >= 0 && move <= 8) {
            newBoard[move] = bot;
            return newBoard;
          }
          return prevBoard;
        });
        setXIsNext(prev => !prev);
        botSay(comment);
      }).catch(error => {
        console.error('Bot move error:', error);
      }).finally(() => {
        setIsBotThinking(false);
        // Use setTimeout to reset on next tick
        setTimeout(() => {
          botMoveInProgress.current = false;
        }, 0);
      });
    }
    // eslint-disable-next-line
  }, [board, xIsNext, bot, user, winner, isDraw, botType]);

  // Add chat messages for win/draw
  useEffect(() => {
    // Only add win/draw messages if the game has actually been played
    const hasMovesBeenMade = board.some(sq => sq !== null);
    if (!hasMovesBeenMade) return;
    
    if (winner) {
      if (winner === bot) {
        botSay('I win! Good game!');
      } else {
        botSay('You win! Well played!');
      }
    } else if (isDraw) {
      botSay("It's a draw! Let's play again?");
    }
    // eslint-disable-next-line
  }, [winner, isDraw, bot]);

  // Reset chat on new game or side change
  useEffect(() => {
    setChat([]);
    if (user === 'O') {
      botSay('I start as X!');
    } else {
      botSay('Your move!');
    }
    // eslint-disable-next-line
  }, [user, board.length]);

  // Only show the last 4 messages in the chat window
  const visibleChat = chat.slice(-4);

  // Change side
  function chooseSide(p: Player) {
    setUser(p);
    setBot(p === 'X' ? 'O' : 'X');
    setBoard(Array(9).fill(null));
    setXIsNext(true); // X always starts
    setIsBotThinking(false); // Cancel any pending bot thinking
    botMoveInProgress.current = false; // Reset bot move tracking
  }

  // Reset game
  function resetGame() {
    setBoard(Array(9).fill(null));
    setXIsNext(true); // X always starts
    botMoveInProgress.current = false; // Reset bot move tracking
  }

  return (
    <div className="tictactoe-layout">
      <div className="tictactoe-container">
        <h1>Tic-Tac-Toe</h1>
        <div className="side-select">
          <span>Play as: </span>
          <button className={user === 'X' ? 'active' : ''} onClick={() => chooseSide('X')}>X</button>
          <button className={user === 'O' ? 'active' : ''} onClick={() => chooseSide('O')}>O</button>
        </div>
        <div className="bot-select">
          <span>Bot: </span>
          <button className={botType === 'simple' ? 'active' : ''} onClick={() => setBotType('simple')}>
            Simple{botType === 'simple' ? ' ✓' : ''}
          </button>
          <button className={botType === 'chatgpt' ? 'active' : ''} onClick={() => setBotType('chatgpt')}>
            Ollama{botType === 'chatgpt' ? ' ✓' : ''}
          </button>
        </div>
        <div className="board">
          {board.map((sq, i) => (
            <Square
              key={i}
              value={sq}
              onClick={() => handleClick(i)}
              highlight={winner ? winningLine.includes(i) : false}
            />
          ))}
        </div>
        <div className="status">
          {isBotThinking ? (
            <span className="thinking">Bot is thinking...</span>
          ) : winner ? (
            <span className="winner">Winner: {winner}</span>
          ) : isDraw ? (
            <span className="draw">It's a draw!</span>
          ) : (
            <span>Next: {xIsNext ? 'X' : 'O'}</span>
          )}
        </div>
        <button className="reset-btn" onClick={resetGame}>Restart</button>
      </div>
      <div className="chat-container">
        <h2>Bot Chat ({botType === 'simple' ? 'Simple' : 'Ollama'})</h2>
        <div className="chat-bubbles">
          {visibleChat.map((msg, i) => (
            <div key={i} className="bot-bubble">{msg}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App
