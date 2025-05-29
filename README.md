# Tic-Tac-Toe Web App

This is a modern, interactive Tic-Tac-Toe game built with React, TypeScript, and Vite. The app features two types of bot opponents, including one powered by the OpenAI ChatGPT API using function calls for both move selection and playful, cheeky commentary.

[▶️ Watch the demo video](./demo.mp4)

## 🎮 Main Features

- **Play Tic-Tac-Toe in your browser**: Enjoy a classic game with a beautiful, responsive interface.
- **Choose your side**: Play as X or O.
- **Play against two types of bots**:
  - **Simple Bot**: Makes smart but not perfect moves.
  - **ChatGPT Bot**: Uses OpenAI's ChatGPT API (with function calls) to decide its moves and comment on the game with cheeky, playful messages.
- **Bot Chat**: See the bot's comments in a chat bubble next to the game board for a more interactive experience.
- **Winning Highlight**: Only the winning line is highlighted when someone wins.
- **Restart and Side Switch**: Easily restart the game or switch sides at any time.

## 🛠️ Technologies Used

- **React**: For building the user interface.
- **TypeScript**: For type safety and better code quality.
- **Vite**: For fast development and build tooling.
- **OpenAI API**: The ChatGPT bot uses OpenAI's API with function calls to generate moves and fun comments.

## 🚀 How to Run

1. **Clone the repository** and install dependencies:
   ```sh
   npm install
   ```
2. **Add your OpenAI API key** to a `.env` file in the project root:
   ```env
   VITE_OPENAI_API_KEY=sk-...
   ```
3. **Start the development server:**
   ```sh
   npm run dev
   ```
4. **Open your browser** to the local address shown in the terminal (usually http://localhost:5173).

## 📹 Demo

[▶️ Watch the demo video](./demo.mp4)

## ✨ Why This Project?

This project demonstrates:
- Building modern, user-friendly web apps
- Integrating third-party APIs (OpenAI) with function calls
- Creating interactive, engaging user experiences
- Writing clean, maintainable code with React and TypeScript

---

Thank you for checking out this Tic-Tac-Toe project! If you have any questions or feedback, feel free to reach out.
