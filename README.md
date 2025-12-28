# 🎵 Real-Time Music Collaboration Platform

A web-based platform that enables **multiple users to collaboratively compose music in real time**, enhanced with **AI-powered harmonization and melody suggestions**.

---

## 📌 Project Overview

The **Real-Time Music Collaboration Platform** allows musicians to collaboratively create multi-track MIDI compositions in real time. Using **Socket.io**, all MIDI events are synchronized instantly across connected users. The platform integrates **AI models (Groq / OpenAI / Claude)** to generate intelligent music suggestions such as **harmonies, chord progressions, and melody variations**, assisting users during composition.

---

## 🚀 Features

- 🎵 **Multi-track MIDI composition and playback** using Tone.js  
- 👥 **Real-time collaboration** with Socket.io (synchronized MIDI events)  
- 🤖 **AI-powered music suggestions** (harmonies, chords, melodies) using LLMs  
- 🎹 **Virtual MIDI keyboard** for live input  
- 🎚️ **Audio effects and mixing controls**  
- 💾 **Save, load, and version music projects** using MongoDB  
- 📤 **Export compositions to WAV or MP3** on the server  
- 🎧 **Real-time audio playback and streaming**

---

## 🧰 Technologies Used

### Frontend
- React.js  
- Tone.js  

### Backend
- Node.js  
- Express.js  
- Socket.io  

### Database
- MongoDB (Local or MongoDB Atlas)

### AI Integration
- Groq API  
- OpenAI API / Claude API  

### DevOps
- Docker  
- Docker Compose  

---

## 📦 Prerequisites

- Node.js **16+**
- npm
- MongoDB (local or MongoDB Atlas)
- AI API key (Groq / OpenAI / Claude)

---

## ⚙️ Setup Instructions

### 1️⃣ Clone the repository
```bash
git clone https://github.com/yourusername/real-time-music-collab.git
cd real-time-music-collab

# Server dependencies
cd server
npm install

# Client dependencies
cd ../client
npm install

cp server/.env.example server/.env

#without docker
# Start backend
cd server
npm run dev

# Start frontend (new terminal)
cd client
npm run dev

#with docker
docker-compose up --build

🌐 Access URLs

Frontend: http://localhost:3001

Backend API: http://localhost:5001


🗂 Project Structure
real-time-music-collab/
├── client/                 # React frontend
├── server/                 # Node.js backend
├── docker-compose.yml      # Docker configuration
└── README.md               # Project documentation

🤖 AI Functionality

The AI module analyzes MIDI sequences and provides:

Harmonic accompaniment suggestions

Chord progressions

Melody variations

This assists users during collaborative composition without interrupting workflow.


