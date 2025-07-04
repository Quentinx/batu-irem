// server.js
const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// File paths
const USERS_FILE = path.join(__dirname, 'users.json');
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Make sure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📂 Created uploads directory');
}

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Helper functions
function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function readPhotos() {
  try {
    return JSON.parse(fs.readFileSync(PHOTOS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function savePhotos(photos) {
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
}

// Serve index.html as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`📧 Login attempt: ${email}`);

  const users = readUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).send('Kullanıcı bulunamadı.');

  try {
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).send('Şifre yanlış.');
    console.log(`✅ Login successful for ${email}`);
    res.json({ email: user.email, role: user.role });
  } catch (error) {
    console.error('bcrypt.compare error:', error);
    res.status(500).send('Sunucu hatası.');
  }
});

// Public upload route
app.post('/upload-stream', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('Dosya yüklenmedi.');
  }

  const photos = readPhotos();
  req.files.forEach(file => {
    photos.push({
      filename: file.filename,
      owner: 'Anonim',
      likes: 0
    });
    console.log(`✅ Saved file: ${file.filename}`);
  });

  savePhotos(photos);
  res.send(`Upload başarılı. ${req.files.length} dosya yüklendi.`);
});

// Gallery
app.get('/gallery', (req, res) => {
  res.json(readPhotos());
});

// Like photo
app.post('/like/:filename', (req, res) => {
  const filename = req.params.filename;
  const photos = readPhotos();
  const photo = photos.find(p => p.filename === filename);
  if (!photo) return res.status(404).send('Fotoğraf/Video bulunamadı.');

  photo.likes += 1;
  savePhotos(photos);
  console.log(`❤️ Liked: ${filename} → ${photo.likes}`);
  res.json({ success: true, likes: photo.likes });
});

// Delete photo (admin only)
app.delete('/delete/:filename', async (req, res) => {
  const { filename } = req.params;
  const { email, role } = req.query;

  console.log(`🗑️ Delete request → Email: ${email}, Role: ${role}, File: ${filename}`);
  if (!email || !role) return res.status(400).send('Kullanıcı bilgisi gerekli.');
  if (role !== 'admin') return res.status(403).send('Sadece admin silebilir.');

  const photos = readPhotos();
  const photo = photos.find(p => p.filename === filename);
  if (!photo) return res.status(404).send('Fotoğraf/Video bulunamadı.');

  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    await fsPromises.unlink(filePath);
    console.log(`✅ File removed from disk: ${filename}`);
  } catch {
    console.warn(`⚠️ File missing on disk: ${filename}`);
  }

  savePhotos(photos.filter(p => p.filename !== filename));
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
