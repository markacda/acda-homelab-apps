import app from './app';
import path from 'path';

const PORT: number = parseInt(process.env.PORT || '8080', 10);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Serving static files from: ${path.join(__dirname, '..', 'src')}`);
  console.log(`🌐 CORS enabled for api.airplanes.live`);
  console.log(`✅ Server started successfully on http://localhost:${PORT}`);
});
