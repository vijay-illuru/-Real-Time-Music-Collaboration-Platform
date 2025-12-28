import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import config from './config/config.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import Project from './models/Project.js';
import ProjectVersion from './models/ProjectVersion.js';

const app = express();
const httpServer = createServer(app);

const corsOrigin = config.nodeEnv === 'development' ? true : config.corsOrigin;

app.use(
  cors({
    origin: corsOrigin,
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('joinProject', (projectId) => {
    socket.join(projectId);
    console.log(`User joined project: ${projectId}`);
  });

  socket.on('midiEvent', async (data) => {
    try {
      const { projectId, event } = data || {};
      if (!projectId || !event) return;

      socket.to(projectId).emit('midiEvent', event);

      if (event.type === 'noteToggle') {
        const note = event.note;
        const time = event.time;
        const duration = event.duration;
        const velocity = event.velocity;
        const incomingTrackId = event.trackId;

        if (typeof note !== 'number' || typeof time !== 'number') return;

        const noteDoc = {
          type: 'note',
          note,
          time,
          duration: typeof duration === 'number' ? duration : 0.25,
          velocity: typeof velocity === 'number' ? velocity : 100,
          trackId: incomingTrackId ? String(incomingTrackId) : '',
        };

        if (incomingTrackId) {
          // 1) Try to remove existing note event (toggle off)
          const pullRes = await Project.updateOne(
            { _id: projectId },
            { $pull: { 'tracks.$[t].events': { type: 'note', note, time } } },
            { arrayFilters: [{ 't._id': incomingTrackId }] }
          );

          // 2) If nothing removed, add it (toggle on)
          if ((pullRes.modifiedCount || 0) === 0) {
            await Project.updateOne(
              { _id: projectId },
              { $push: { 'tracks.$[t].events': noteDoc } },
              { arrayFilters: [{ 't._id': incomingTrackId }] }
            );
          }
        } else {
          // Fallback: if no trackId provided, apply to the first track.
          const pullRes = await Project.updateOne(
            { _id: projectId },
            { $pull: { 'tracks.0.events': { type: 'note', note, time } } }
          );

          if ((pullRes.modifiedCount || 0) === 0) {
            await Project.updateOne(
              { _id: projectId },
              { $push: { 'tracks.0.events': noteDoc } }
            );
          }
        }
      }
    } catch (err) {
      console.error('Socket midiEvent error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Real-Time Music Collaboration API',
    health: '/api/health',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

mongoose
  .connect(config.mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

const PORT = config.port || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
