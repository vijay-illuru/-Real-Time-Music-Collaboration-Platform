import mongoose from 'mongoose';

const midiEventSchema = new mongoose.Schema({
  type: { type: String, required: true }, 
  note: { type: Number }, 
  velocity: { type: Number }, 
  channel: { type: Number, default: 0 }, 
  time: { type: Number, required: true }, 
  duration: { type: Number }, 
  trackId: { type: String, required: true }, 
  data: { type: mongoose.Schema.Types.Mixed }, 
});

const trackSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'New Track' },
  instrument: { type: String, default: 'piano' },
  volume: { type: Number, default: 0, min: -60, max: 0 },
  pan: { type: Number, default: 0, min: -1, max: 1 },
  mute: { type: Boolean, default: false },
  solo: { type: Boolean, default: false },
  color: { type: String, default: '#4a90e2' },
  events: [midiEventSchema],
});

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'Untitled Project',
    },
    description: {
      type: String,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    collaborators: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        role: {
          type: String,
          enum: ['editor', 'viewer'],
          default: 'editor',
        },
      },
    ],
    bpm: {
      type: Number,
      default: 120,
      min: 40,
      max: 300,
    },
    timeSignature: {
      numerator: { type: Number, default: 4 },
      denominator: { type: Number, default: 4 },
    },
    tracks: [trackSchema],
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

projectSchema.index({ name: 'text', description: 'text' });

projectSchema.virtual('duration').get(function () {
  if (!this.tracks || this.tracks.length === 0) return 0;
  
  let maxEndTime = 0;
  this.tracks.forEach(track => {
    track.events.forEach(event => {
      const eventEndTime = event.time + (event.duration || 0);
      if (eventEndTime > maxEndTime) {
        maxEndTime = eventEndTime;
      }
    });
  });
  
  return maxEndTime;
});

const Project = mongoose.model('Project', projectSchema);

export default Project;
