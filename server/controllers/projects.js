import Project from '../models/Project.js';
import ProjectVersion from '../models/ProjectVersion.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Groq from 'groq-sdk';
import config from '../config/config.js';

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
console.log('Groq client initialized:', !!groq);

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function writeWavPcm16Mono(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i], -1, 1);
    const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    buffer.writeInt16LE(int16, o);
    o += 2;
  }

  return buffer;
}

function renderProjectToMonoPcm(project, { sampleRate = 44100 } = {}) {
  const events = [];
  for (const track of project.tracks || []) {
    for (const ev of track.events || []) {
      if (ev?.type !== 'note') continue;
      if (typeof ev.note !== 'number' || typeof ev.time !== 'number') continue;
      events.push({
        note: ev.note,
        time: ev.time,
        duration: typeof ev.duration === 'number' ? ev.duration : 0.25,
        velocity: typeof ev.velocity === 'number' ? ev.velocity : 100,
      });
    }
  }

  const maxEnd = events.reduce((m, e) => Math.max(m, e.time + (e.duration || 0)), 0);
  const totalSeconds = Math.max(0.5, maxEnd + 0.5);
  const totalSamples = Math.ceil(totalSeconds * sampleRate);
  const out = new Float32Array(totalSamples);

  // Simple synth: sine oscillator + short ADSR
  const attack = 0.005;
  const release = 0.08;

  for (const e of events) {
    const start = Math.max(0, Math.floor(e.time * sampleRate));
    const durS = Math.max(0.02, e.duration || 0.25);
    const end = Math.min(totalSamples, start + Math.floor((durS + release) * sampleRate));

    const freq = midiToFreq(e.note);
    const vel = clamp((e.velocity || 100) / 127, 0, 1);
    const amp = 0.18 * vel;

    for (let i = start; i < end; i++) {
      const t = (i - start) / sampleRate;
      const phase = 2 * Math.PI * freq * t;
      let env = 1;
      if (t < attack) env = t / attack;
      const relT = t - durS;
      if (relT > 0) env *= Math.exp(-relT / release);
      const s = Math.sin(phase) * amp * env;
      out[i] += s;
    }
  }

  // Soft normalization to avoid clipping
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0.99 ? 0.99 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= gain;

  return out;
}

function returnMock(res, prompt) {
  const promptLower = (prompt || '').toLowerCase();
  let mockNotes = [];
  let title = 'Mock Harmony (Demo)';
  let description = 'AI services unavailable. Using a simple harmony demo.';
  
  if (promptLower.includes('bass')) {
    title = 'Mock Bassline';
    description = 'AI services unavailable. Using a simple bassline demo.';
    mockNotes = [
      { note: 36, step: 0, durationSteps: 4, velocity: 100 },
      { note: 41, step: 4, durationSteps: 4, velocity: 100 },
      { note: 43, step: 8, durationSteps: 4, velocity: 100 },
      { note: 36, step: 12, durationSteps: 4, velocity: 100 },
    ];
  } else if (promptLower.includes('melody') || promptLower.includes('lead')) {
    title = 'Mock Melody';
    description = 'AI services unavailable. Using a simple melody demo.';
    mockNotes = [
      { note: 72, step: 0, durationSteps: 1, velocity: 100 },
      { note: 74, step: 1, durationSteps: 1, velocity: 100 },
      { note: 76, step: 2, durationSteps: 1, velocity: 100 },
      { note: 77, step: 3, durationSteps: 1, velocity: 100 },
      { note: 79, step: 4, durationSteps: 2, velocity: 100 },
      { note: 77, step: 6, durationSteps: 1, velocity: 100 },
      { note: 76, step: 7, durationSteps: 1, velocity: 100 },
      { note: 74, step: 8, durationSteps: 2, velocity: 100 },
    ];
  } else {
    // Default harmony
    mockNotes = [
      { note: 60, step: 0, durationSteps: 2, velocity: 100 },
      { note: 64, step: 2, durationSteps: 2, velocity: 100 },
      { note: 67, step: 4, durationSteps: 2, velocity: 100 },
      { note: 72, step: 6, durationSteps: 2, velocity: 100 },
    ];
  }
  return res.json({
    suggestion: { title, description, notes: mockNotes },
  });
}

export const listProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const projects = await Project.find({
      $or: [{ owner: userId }, { 'collaborators.user': userId }],
    })
      .select('name description owner collaborators bpm timeSignature updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .populate('owner', ['username', 'avatar']);

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const newProject = new Project({
      name,
      description,
      owner: req.user.id,
      collaborators: [{
        user: req.user.id,
        role: 'editor'
      }],
      tracks: [{
        name: 'Piano',
        instrument: 'piano',
        events: []
      }]
    });

    const project = await newProject.save();
    res.status(201).json(project);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', ['username', 'avatar'])
      .populate('collaborators.user', ['username', 'avatar']);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess = 
      project.owner._id.toString() === req.user.id ||
      project.collaborators.some(c => c.user._id.toString() === req.user.id);

    if (!hasAccess && !project.isPublic) {
      return res.status(403).json({ message: 'Not authorized to access this project' });
    }

    res.json(project);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(500).send('Server error');
  }
};

export const updateProject = async (req, res) => {
  try {
    const { name, description, bpm, timeSignature, tracks, isPublic } = req.body;
    
    let project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isEditor = 
      project.owner.toString() === req.user.id ||
      project.collaborators.some(
        c => c.user.toString() === req.user.id && c.role === 'editor'
      );

    if (!isEditor) {
      return res.status(403).json({ message: 'Not authorized to update this project' });
    }

    const projectFields = {};
    if (name) projectFields.name = name;
    if (description) projectFields.description = description;
    if (bpm) projectFields.bpm = bpm;
    if (timeSignature) projectFields.timeSignature = timeSignature;
    if (tracks) {
      const processedTracks = tracks.map(track => {
        if (!track._id) {
          return {
            ...track,
            _id: new mongoose.Types.ObjectId()
          };
        }
        return track;
      });
      projectFields.tracks = processedTracks;
    }
    if (isPublic !== undefined) projectFields.isPublic = isPublic;

    if (tracks && Array.isArray(tracks)) {
      const lastVersion = await ProjectVersion.findOne({ projectId: project._id }).sort('-version');
      const nextVersion = (lastVersion?.version || 0) + 1;
      await ProjectVersion.create({
        projectId: project._id,
        version: nextVersion,
        description: `Version ${nextVersion}`,
        tracks: project.tracks,
        createdBy: req.user.id,
      });
    }

    project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: projectFields },
      { new: true }
    );

    res.json(project);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this project' });
    }

    await project.remove();
    res.json({ message: 'Project removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(500).send('Server error');
  }
};

export const listVersions = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess =
      project.owner.toString() === req.user.id ||
      project.collaborators.some(c => c.user.toString() === req.user.id);

    if (!hasAccess && !project.isPublic) {
      return res.status(403).json({ message: 'Not authorized to access this project' });
    }

    const versions = await ProjectVersion.find({ projectId: project._id })
      .populate('createdBy', ['username'])
      .sort('-version');

    res.json(versions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const restoreVersion = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const isEditor =
      project.owner.toString() === req.user.id ||
      project.collaborators.some(
        c => c.user.toString() === req.user.id && c.role === 'editor'
      );

    if (!isEditor) {
      return res.status(403).json({ message: 'Not authorized to update this project' });
    }

    const version = await ProjectVersion.findOne({
      projectId: project._id,
      _id: req.params.versionId,
    });

    if (!version) {
      return res.status(404).json({ message: 'Version not found' });
    }

    const lastVersion = await ProjectVersion.findOne({ projectId: project._id }).sort('-version');
    const nextVersion = (lastVersion?.version || 0) + 1;
    await ProjectVersion.create({
      projectId: project._id,
      version: nextVersion,
      description: `Before restore to version ${version.version}`,
      tracks: project.tracks,
      createdBy: req.user.id,
    });

    project.tracks = version.tracks;
    await project.save();

    res.json({ message: 'Restored to version', version: version.version, tracks: project.tracks });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getProjectCollaborators = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('collaborators.user', [
      'username',
      'avatar',
    ]);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess = 
      project.owner.toString() === req.user.id ||
      project.collaborators.some(c => c.user._id.toString() === req.user.id);

    if (!hasAccess && !project.isPublic) {
      return res.status(403).json({ message: 'Not authorized to view this project' });
    }

    res.json(project.collaborators);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const addCollaborator = async (req, res) => {
  try {
    const { email, role = 'editor' } = req.body;
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to add collaborators' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (
      project.collaborators.some(
        collab => collab.user.toString() === user._id.toString()
      )
    ) {
      return res.status(400).json({ message: 'User is already a collaborator' });
    }

    project.collaborators.unshift({
      user: user._id,
      role,
    });

    await project.save();
    
    await project.populate('collaborators.user', ['username', 'avatar']);
    const newCollaborator = project.collaborators.find(
      collab => collab.user._id.toString() === user._id.toString()
    );

    res.json(newCollaborator);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const removeCollaborator = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to remove collaborators' });
    }

    if (project.owner.toString() === req.params.userId) {
      return res.status(400).json({ message: 'Cannot remove project owner' });
    }

    project.collaborators = project.collaborators.filter(
      collab => collab.user.toString() !== req.params.userId
    );

    await project.save();
    res.json({ message: 'Collaborator removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getAISuggestions = async (req, res) => {
  try {
    const { prompt, context, grid } = req.body;
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess = 
      project.owner.toString() === req.user.id ||
      project.collaborators.some(c => c.user.toString() === req.user.id);

    if (!hasAccess && !project.isPublic) {
      return res.status(403).json({ message: 'Not authorized to access this project' });
    }

    const projectContext = {
      bpm: project.bpm,
      timeSignature: project.timeSignature,
      tracks: project.tracks.map(track => ({
        name: track.name,
        instrument: track.instrument,
        eventCount: track.events.length,
      })),
    };

    if (!groq) {
      const promptLower = (prompt || '').toLowerCase();
      let mockNotes = [];
      let title = 'Mock Harmony (Demo)';
      let description = 'Groq API key not configured. Using a simple harmony demo.';
      
      if (promptLower.includes('bass')) {
        title = 'Mock Bassline';
        description = 'Groq API key not configured. Using a simple bassline demo.';
        mockNotes = [
          { note: 36, step: 0, durationSteps: 4, velocity: 100 },
          { note: 41, step: 4, durationSteps: 4, velocity: 100 },
          { note: 43, step: 8, durationSteps: 4, velocity: 100 },
          { note: 36, step: 12, durationSteps: 4, velocity: 100 },
        ];
      } else if (promptLower.includes('melody') || promptLower.includes('lead')) {
        title = 'Mock Melody';
        description = 'Groq API key not configured. Using a simple melody demo.';
        mockNotes = [
          { note: 72, step: 0, durationSteps: 1, velocity: 100 },
          { note: 74, step: 1, durationSteps: 1, velocity: 100 },
          { note: 76, step: 2, durationSteps: 1, velocity: 100 },
          { note: 77, step: 3, durationSteps: 1, velocity: 100 },
          { note: 79, step: 4, durationSteps: 2, velocity: 100 },
          { note: 77, step: 6, durationSteps: 1, velocity: 100 },
          { note: 76, step: 7, durationSteps: 1, velocity: 100 },
          { note: 74, step: 8, durationSteps: 2, velocity: 100 },
        ];
      } else {
        mockNotes = [
          { note: 60, step: 0, durationSteps: 2, velocity: 100 },
          { note: 64, step: 2, durationSteps: 2, velocity: 100 },
          { note: 67, step: 4, durationSteps: 2, velocity: 100 },
          { note: 72, step: 6, durationSteps: 2, velocity: 100 },
        ];
      }
      return res.json({
        suggestion: { title, description, notes: mockNotes },
      });
    }

    const steps = Number(grid?.steps ?? 16);
    const stepSeconds = Number(grid?.stepSeconds ?? 0.25);
    const pitchMin = Number(grid?.pitchMin ?? 60);
    const pitchMax = Number(grid?.pitchMax ?? 72);

    const existing = (project.tracks?.[0]?.events || [])
      .filter((ev) => ev?.type === 'note' && typeof ev.note === 'number' && typeof ev.time === 'number')
      .slice(-64)
      .map((ev) => ({
        note: ev.note,
        step: Math.round(ev.time / stepSeconds),
        durationSteps: Math.max(1, Math.round((ev.duration || stepSeconds) / stepSeconds)),
      }))
      .filter((n) => n.step >= 0 && n.step < steps);

    const schema = {
      title: 'MusicSuggestion',
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              note: { type: 'integer', minimum: 0, maximum: 127 },
              step: { type: 'integer', minimum: 0, maximum: steps - 1 },
              durationSteps: { type: 'integer', minimum: 1, maximum: steps },
              velocity: { type: 'integer', minimum: 1, maximum: 127 },
            },
            required: ['note', 'step', 'durationSteps'],
          },
        },
      },
      required: ['notes'],
    };

    const system = {
      role: 'system',
      content: `You are a music composition assistant.
Return ONLY valid JSON (no markdown).
You must match this JSON schema: ${JSON.stringify(schema)}
Constraints:
- steps=${steps}, stepSeconds=${stepSeconds}
- pitchMin=${pitchMin}, pitchMax=${pitchMax}
- Use MIDI note numbers.
- Provide 4 to 12 notes that sound musical as a harmony/melody layer.
Project context: ${JSON.stringify(projectContext)}
Existing notes (last 64): ${JSON.stringify(existing)}`,
    };

    const userMsg = {
      role: 'user',
      content: prompt || 'Suggest a simple harmony that fits the existing notes. Prefer consonant intervals and repeatable loop.',
    };

    let raw, suggestionObj;
    try {
      console.log('Using Groq...');
      const groqResponse = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [system, userMsg],
        temperature: 0.6,
        max_tokens: 600,
      });
      raw = groqResponse.choices?.[0]?.message?.content || '';
      console.log('Groq succeeded');
    } catch (groqErr) {
      console.error('Groq error:', groqErr.message);
      return returnMock(res, prompt);
    }

    suggestionObj = null;
    try {
      suggestionObj = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          suggestionObj = JSON.parse(raw.slice(start, end + 1));
        } catch {
          suggestionObj = null;
        }
      }
    }

    if (!suggestionObj || !Array.isArray(suggestionObj.notes)) {
      return res.json({
        suggestion: {
          title: 'AI Suggestion',
          description: 'Model response could not be parsed as JSON. Showing raw suggestion text.',
          notes: [],
          raw,
        },
      });
    }

    const notes = suggestionObj.notes
      .map((n) => ({
        note: Number(n.note),
        step: Number(n.step),
        durationSteps: Number(n.durationSteps),
        velocity: n.velocity === undefined ? 100 : Number(n.velocity),
      }))
      .filter(
        (n) =>
          Number.isFinite(n.note) &&
          Number.isFinite(n.step) &&
          Number.isFinite(n.durationSteps) &&
          n.note >= 0 &&
          n.note <= 127 &&
          n.step >= 0 &&
          n.step < steps &&
          n.durationSteps >= 1
      )
      .map((n) => ({
        ...n,
        note: Math.max(pitchMin, Math.min(pitchMax, Math.round(n.note))),
        step: Math.max(0, Math.min(steps - 1, Math.round(n.step))),
        durationSteps: Math.max(1, Math.min(steps, Math.round(n.durationSteps))),
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity || 100))),
      }));

    res.json({
      suggestion: {
        title: suggestionObj.title || 'AI Suggestion',
        description: suggestionObj.description || '',
        notes,
      },
    });
  } catch (err) {
    console.error('AI Suggestion Error:', err.message);
    res.status(500).json({ 
      message: 'Error generating AI suggestions',
      error: err.message 
    });
  }
};

export const exportProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const hasAccess =
      project.owner.toString() === req.user.id ||
      project.collaborators.some(c => c.user.toString() === req.user.id);

    if (!hasAccess && !project.isPublic) {
      return res.status(403).json({ message: 'Not authorized to export this project' });
    }

    const sampleRate = 44100;
    const pcm = renderProjectToMonoPcm(project, { sampleRate });
    const wav = writeWavPcm16Mono(pcm, sampleRate);

    const safeName = String(project.name || 'project').replace(/[^a-z0-9-_]+/gi, '_');
    const filename = `${safeName}-${Date.now()}.wav`;

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(wav.length),
    });

    res.send(wav);
  } catch (err) {
    console.error('Export Error:', err.message);
    res.status(500).send('Server error during export');
  }
};
