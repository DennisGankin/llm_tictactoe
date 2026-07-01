import React, { useState, useEffect, useRef } from 'react';
import './App.css'
import ollama from 'ollama'

// Types for the board and players
type Player = 'X' | 'O';
type Square = Player | null;
type Board = Square[];

// Result from the Ollama bot
interface BotResponse {
  move: number;
  comment: string;
}

// Maximum Ollama API failures (unparseable response) before falling back to simple bot
const MAX_OLLAMA_FAILURES = 3;

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

// Board layout reference for the bot
const BOARD_LAYOUT = `
0 | 1 | 2
---------
3 | 4 | 5
---------
6 | 7 | 8
`;

// Strategy priorities for the bot
const STRATEGY = `
STRATEGY (in priority order):
  1. WIN: Take the move that wins immediately
  2. BLOCK: Block opponent's winning move
  3. CENTER: Take position 4 if available
  4. CORNERS: Take 0, 2, 6, or 8
  5. SIDES: Take 1, 3, 5, or 7 as last resort
`;

// System message: role and rules (static, sent once)
function buildSystemMessage(bot: Player, user: Player, chatHistory: string[]): string {
  const lines = [
    `You are a witty, competitive Tic-Tac-Toe bot with a sarcastic personality.`,
    `The board is a 3x3 grid with positions numbered 0-8:`,
    BOARD_LAYOUT,
    `You play as ${bot}, your opponent plays as ${user}.`,
    STRATEGY,
  ];

  // Include recent chat history for consistency
  if (chatHistory.length > 0) {
    lines.push(
      `Your previous comments this game (${chatHistory.length} so far):`,
      ...chatHistory.slice(-4).map((msg, i) => `  "${msg}"`),
      `Write your new comment with a similar playful tone but make it fresh and different.`,
    );
  }

  lines.push(`Respond with exactly this JSON — nothing else:`);
  return lines.join('\n');
}

// User message: current board state only (changes every turn)
function buildUserMessage(board: Board, bot: Player, user: Player): string {
  const boardState = board.map((sq, i) => `${i}:${sq || '.'}`).join(', ');
  const availablePositions = board
    .map((sq, i) => sq === null ? i : -1)
    .filter(i => i !== -1);

  return (
    `Board: [${boardState}]\n` +
    `Your side: ${bot}\n` +
    `Opponent: ${user}\n` +
    `Available positions: [${availablePositions.join(', ')}]\n` +
    `Choose a move from the available positions and provide a short witty comment.`
  );
}

// --- Ollama API integration ---

async function fetchOllamaMove(
  board: Board,
  bot: Player,
  user: Player,
  chatHistory: string[] = [],
): Promise<BotResponse | null> {
  const response = await ollama.chat({
    model: 'llama3.1',
    messages: [
      { role: 'system', content: buildSystemMessage(bot, user, chatHistory) },
      { role: 'user', content: buildUserMessage(board, bot, user) },
    ],
    format: 'json',
  });

  const responseText = response.message.content;
  console.log('🎯 Ollama raw response:', responseText);

  // Parse the response, handling potential markdown code fences
  let parsed: BotResponse;
  try {
    const cleaned = responseText
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/g, '')
      .trim();
    parsed = JSON.parse(cleaned) as BotResponse;
  } catch (e) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as BotResponse;
    } else {
      console.error('❌ Could not parse Ollama response:', responseText);
      return null;
    }
  }

  // Check if the move is valid (unoccupied position)
  const isValidMove = parsed.move >= 0 && parsed.move <= 8 && !board[parsed.move];
  if (!isValidMove) {
    // Instead of retrying (which would just return the same occupied square),
    // clamp the move to the best available position.
    // Strategy: prefer center (4), then corners (0,2,6,8), then sides (1,3,5,7)
    const availablePositions = board
      .map((sq, i) => sq === null ? i : -1)
      .filter(i => i !== -1);

    const preferredOrder = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // strategy order
    const clampedMove = preferredOrder.find(p => availablePositions.includes(p))!;

    console.warn(
      `⚠️ Bot picked occupied move ${parsed.move}, clamping to ${clampedMove}`,
    );

    return { move: clampedMove, comment: parsed.comment };
  }

  console.log('✅ Parsed response:', parsed);
  return parsed;
}

function App() {
  const [user, setUser] = useState<Player>('X');
  const [bot, setBot] = useState<Player>('O');
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true); // X always starts
  const [chat, setChat] = useState<string[]>([]);
  const [botType, setBotType] = useState<'simple' | 'ollama'>('simple');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const botMoveInProgress = useRef(false);
  const ollamaFailedCount = useRef(0); // total consecutive Ollama failures
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
    } else if (botType === 'ollama') {
      setIsBotThinking(true);

      fetchOllamaMove(board, bot, user, chat).then((result) => {
        if (!result) {
          // Parse/API failure — increment counter and let user play
          console.warn('⚠️ Ollama failed to respond, incrementing failure counter');
          ollamaFailedCount.current++;
        } else {
          // Reset failure counter on success
          ollamaFailedCount.current = 0;
          console.log('🚀 Ollama move successful - Move:', result.move, 'Comment:', result.comment);
          setBoard(prevBoard => {
            const newBoard = [...prevBoard];
            newBoard[result.move] = bot;
            return newBoard;
          });
          setXIsNext(prev => !prev);
          botSay(result.comment);
        }
      }).catch(error => {
        console.error('💥 Bot move error, skipping turn:', error);
        ollamaFailedCount.current++;
      }).finally(() => {
        // Clear thinking state immediately so user can click
        setIsBotThinking(false);
        // Reset move-in-progress so the next useEffect check can re-enter
        botMoveInProgress.current = false;
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
    // Reset Ollama failure tracking on game reset
    ollamaFailedCount.current = 0;
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
    setChat([]); // Clear chat history
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
          <button className={botType === 'ollama' ? 'active' : ''} onClick={() => setBotType('ollama')}>
            Ollama{botType === 'ollama' ? ' ✓' : ''}
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
        <div className="chat-header">
          <h2>Bot Chat ({botType === 'simple' ? 'Simple' : 'Ollama'})</h2>
          {isBotThinking && (
            <div className="thinking-indicator">
              <div className="spinner"></div>
              <span>Thinking...</span>
            </div>
          )}
        </div>
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
