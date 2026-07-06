import express, { Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import corsOptions from './config/cors';
import mainRoutes from './routes/index';
import apiRoutes from './routes/api';
import { pageLoadLogger } from './logger';

const app: Express = express();

// Middleware
// To Do: maybe use helmet middleware for security headers
app.use(pageLoadLogger('atc')); // Structured per-request access logging to a rotating file
app.use(cors(corsOptions));
app.use(compression()); // Compress responses for better performance

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '..', 'src'), {
  maxAge: '1d', // Cache static assets for 1 day
  etag: true
}));

// Routes
app.use('/', mainRoutes);
app.use('/api', apiRoutes);

export default app;
