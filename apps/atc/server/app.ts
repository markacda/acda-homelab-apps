import express, { Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import corsOptions from './config/cors';
import mainRoutes from './routes/index';
import apiRoutes from './routes/api';

const app: Express = express();

// Middleware
// To Do: maybe use helmet middleware for security headers
app.use(morgan('[:date[iso]] :method :url :status :res[content-length] - :response-time ms')); // Request logging
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
