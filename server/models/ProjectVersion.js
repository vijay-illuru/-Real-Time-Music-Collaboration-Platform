import mongoose from 'mongoose';

const ProjectVersionSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  version: { type: Number, required: true },
  description: { type: String, default: '' },
  tracks: [{ type: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

ProjectVersionSchema.index({ projectId: 1, version: 1 }, { unique: true });

export default mongoose.model('ProjectVersion', ProjectVersionSchema);
