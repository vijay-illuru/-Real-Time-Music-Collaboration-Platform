import express from 'express';
import { auth } from '../middleware/auth.js';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectCollaborators,
  addCollaborator,
  removeCollaborator,
  getAISuggestions,
  exportProject,
  listVersions,
  restoreVersion,
} from '../controllers/projects.js';

const router = express.Router();

router.use(auth);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

router.get('/:id/collaborators', getProjectCollaborators);
router.post('/:id/collaborators', addCollaborator);
router.delete('/:id/collaborators/:userId', removeCollaborator);

router.post('/:id/suggestions', getAISuggestions);

router.get('/:id/export', exportProject);

router.get('/:id/versions', listVersions);
router.post('/:id/versions/:versionId/restore', restoreVersion);

export default router;
