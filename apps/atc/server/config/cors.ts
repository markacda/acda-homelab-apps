import { CorsOptions } from 'cors';

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow all origins for the frontend, but configure proxy if needed
    callback(null, true);
  },
  credentials: true
};

export default corsOptions;
