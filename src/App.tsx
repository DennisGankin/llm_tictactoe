import React, { useState, useEffect } from 'react';
import './App.css'

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

// --- ChatGPT API integration ---
async function fetchChatGPTMove(
  board: Board,
  bot: Player,
  user: Player
): Promise<{ move: number; comment: string }> {
  // You must set your OpenAI API key in an environment variable or config for this to work securely in production.
  // For demo, this is a direct call. In production, proxy this through a backend!
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const systemPrompt = `You are a Tic-Tac-Toe bot. The board is a 3x3 array (0-8). X and O are players. Respond ONLY with a function call: make_move(move: number, comment: string). Your comments should be cheeky, playful, and sometimes a bit teasing. Don't just say you made a move—react to the board, the user's play, or your own brilliance! Always choose a move that maximizes your chances to win or draw, and never make a move that lets the user win if you can prevent it.`;
  const userPrompt = `Current board: [${board.map((sq) => sq || ' ').join(', ')}]\nBot is: ${bot}\nUser is: ${user}\nIt's your turn. Which move do you make? Add a short comment for the chat.`;
  const body = {
    model: 'gpt-3.5-turbo-1106',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    functions: [
      {
        name: 'make_move',
        description: 'Make a move and provide a comment',
        parameters: {
          type: 'object',
          properties: {
            move: { type: 'integer', description: 'The board index (0-8) to play' },
            comment: { type: 'string', description: 'A short comment for the chat' }
          },
          required: ['move', 'comment']
        }
      }
    ],
    function_call: { name: 'make_move' }
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const fnCall = data.choices?.[0]?.message?.function_call;
  if (fnCall && fnCall.arguments) {
    const args = JSON.parse(fnCall.arguments);
    return { move: args.move, comment: args.comment };
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
  const winnerInfo = calculateWinner(board);
  const winner = winnerInfo?.winner || null;
  const winningLine = winnerInfo?.line || [];
  const isDraw = !winner && board.every(Boolean);

  // Handle user move
  function handleClick(i: number) {
    if (board[i] || winner) return;
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
    if (winner || isDraw) return;
    if ((xIsNext && bot === 'X') || (!xIsNext && bot === 'O')) {
      if (botType === 'simple') {
        const move = botMove(board, bot, user);
        if (move !== -1) {
          const newBoard = board.slice();
          newBoard[move] = bot;
          setTimeout(() => {
            setBoard(newBoard);
            setXIsNext((prev) => !prev);
            botSayRandom();
          }, 500);
        }
      } else if (botType === 'chatgpt') {
        setIsBotThinking(true);
        fetchChatGPTMove(board, bot, user).then(({ move, comment }) => {
          const newBoard = board.slice();
          newBoard[move] = bot;
          setBoard(newBoard);
          setXIsNext((prev) => !prev);
          botSay(comment);
        }).finally(() => setIsBotThinking(false));
      }
    }
    // eslint-disable-next-line
  }, [board, xIsNext, bot, user, winner, isDraw, botType]);

  // Add chat messages for win/draw
  useEffect(() => {
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
  }, [winner, isDraw]);

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
  }

  // Reset game
  function resetGame() {
    setBoard(Array(9).fill(null));
    setXIsNext(true); // X always starts
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
            ChatGPT{botType === 'chatgpt' ? ' ✓' : ''}
          </button>
        </div>
        <div className="board">
          {board.map((sq, i) => (
            <Square
              key={i}
              value={sq}
              onClick={() => user === (xIsNext ? 'X' : 'O') && handleClick(i)}
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
        <h2>Bot Chat ({botType === 'simple' ? 'Simple' : 'ChatGPT'})</h2>
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
