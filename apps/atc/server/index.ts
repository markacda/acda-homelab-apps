import app from "./app.ts";
import path from "path";
import { installConsoleLogging } from "../../../packages/access-log/logger.ts";

// Mirror console.* output into the structured app.log (see log-viewer).
installConsoleLogging("atc");

const PORT: number = parseInt(process.env.PORT || "6001", 10);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Serving static files from: ${path.join(process.cwd(), "src")}`);
  console.log(`🌐 CORS enabled for api.airplanes.live`);
  console.log(`✅ Server started successfully on http://localhost:${PORT}`);
});
