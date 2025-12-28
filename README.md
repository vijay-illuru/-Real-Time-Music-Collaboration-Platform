# Real-Time Music Collaboration Platform

A platform for real-time collaborative music composition with AI-powered suggestions.

## Features

- 🎵 Multi-track MIDI editing with Tone.js
- 👥 Real-time collaboration using Socket.io
- 🤖 AI-powered music suggestions using Groq
- 🎹 Virtual MIDI keyboard
- 🎚️ Audio effects and mixing
- 💾 Save and load projects
- 🎧 Real-time audio streaming

## Prerequisites

- Node.js 16+ and npm
- MongoDB (local or MongoDB Atlas)
- Groq API key

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/real-time-music-collab.git
   cd real-time-music-collab
   ```

2. **Install dependencies**
   ```bash
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env` in the server directory
   - Update the values in `.env` with your configuration
   
   ```bash
   cp server/.env.example server/.env
   ```

4. **Start the development servers**
   ```bash
   # In the project root directory
   # Start MongoDB (if using local)
   # Start the server
   cd server
   npm run dev

   # In a new terminal
   # Start the client
   cd client
   npm run dev
   ```

   Or using Docker:
   ```bash
   docker-compose up --build
   ```

5. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:5001

## Project Structure

```
real-time-music-collab/
├── client/                 # React frontend
├── server/                 # Node.js backend
├── docker-compose.yml      # Docker Compose configuration
└── README.md              # This file
```

## Environment Variables

See `.env.example` for all required environment variables.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For support, please open an issue in the GitHub repository.
