import app from "./app.ts";
import path from "path";

const PORT: number = parseInt(process.env.PORT || "6001", 10);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Serving static files from: ${path.join(import.meta.dirname, "..", "src")}`);
  console.log(`🌐 CORS enabled for api.airplanes.live`);
  console.log(`✅ Server started successfully on http://localhost:${PORT}`);
});
