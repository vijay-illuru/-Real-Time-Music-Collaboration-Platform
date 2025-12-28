import express from 'express';
import { register, login, me } from '../controllers/auth.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);

router.get('/me', auth, me);

router.post('/login', login);

export default router;
