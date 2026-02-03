const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'riverdub';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const dbPath = path.join(dataDir, 'riverdub.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            filename TEXT NOT NULL,
            mime TEXT NOT NULL,
            preview_filename TEXT,
            threshold INTEGER NOT NULL DEFAULT 90,
            created_at TEXT NOT NULL
        )
    `);
});

db.serialize(() => {
    db.all(`PRAGMA table_info(videos)`, (err, rows) => {
        if (err || !rows) return;
        const columns = new Set(rows.map((row) => row.name));
        if (!columns.has('preview_filename')) {
            db.run(`ALTER TABLE videos ADD COLUMN preview_filename TEXT`);
        }
    });
});

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const safeBase = path
            .basename(file.originalname)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safeBase}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 500 }
});

app.use(express.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'riverdub-secret',
        resave: false,
        saveUninitialized: false
    })
);

app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

const normalizeRow = (row) => ({
    ...row,
    url: `/uploads/${row.filename}`,
    preview_url: row.preview_filename ? `/uploads/${row.preview_filename}` : ''
});

const requireAuth = (req, res, next) => {
    if (req.session && req.session.auth === true) {
        next();
        return;
    }
    res.status(401).json({ error: 'unauthorized' });
};

app.post('/api/login', (req, res) => {
    const { login, password } = req.body || {};
    if (login === adminUser && password === adminPass) {
        req.session.auth = true;
        res.json({ ok: true });
        return;
    }
    res.status(401).json({ error: 'invalid_credentials' });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
    if (req.session && req.session.auth === true) {
        res.json({ ok: true });
        return;
    }
    res.status(401).json({ error: 'unauthorized' });
});

app.get('/api/videos', (req, res) => {
    const params = [];
    let sql = 'SELECT * FROM videos';
    if (req.query.type) {
        sql += ' WHERE type = ?';
        params.push(req.query.type);
    }
    sql += ' ORDER BY created_at DESC';
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'db_error' });
            return;
        }
        res.json(rows.map(normalizeRow));
    });
});

app.get('/api/videos/:id', (req, res) => {
    db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: 'db_error' });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        res.json(normalizeRow(row));
    });
});

app.post('/api/videos', requireAuth, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), (req, res) => {
    const { title, type, description = '', threshold = 90 } = req.body;
    const file = req.files?.file?.[0];
    const preview = req.files?.preview?.[0];
    if (!file) {
        res.status(400).json({ error: 'file_required' });
        return;
    }
    if (!title || !type) {
        res.status(400).json({ error: 'fields_required' });
        return;
    }
    const allowedTypes = new Set(['series', 'interview', 'teaser']);
    if (!allowedTypes.has(type)) {
        res.status(400).json({ error: 'invalid_type' });
        return;
    }

    const createdAt = new Date().toISOString();
    const safeThreshold = Math.min(Math.max(Number(threshold) || 90, 60), 99);
    const params = [
        title,
        type,
        description,
        file.filename,
        file.mimetype,
        preview ? preview.filename : null,
        safeThreshold,
        createdAt
    ];

    db.run(
        `
        INSERT INTO videos (title, type, description, filename, mime, preview_filename, threshold, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params,
        function (err) {
            if (err) {
                res.status(500).json({ error: 'db_error' });
                return;
            }
            db.get('SELECT * FROM videos WHERE id = ?', [this.lastID], (getErr, row) => {
                if (getErr || !row) {
                    res.status(500).json({ error: 'db_error' });
                    return;
                }
                res.json(normalizeRow(row));
            });
        }
    );
});

app.put('/api/videos/:id', requireAuth, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), (req, res) => {
    const { title, type, description = '', threshold = 90 } = req.body;
    const file = req.files?.file?.[0];
    const preview = req.files?.preview?.[0];
    const allowedTypes = new Set(['series', 'interview', 'teaser']);
    if (!title || !type || !allowedTypes.has(type)) {
        res.status(400).json({ error: 'fields_required' });
        return;
    }

    db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) {
            res.status(404).json({ error: 'not_found' });
            return;
        }

        const safeThreshold = Math.min(Math.max(Number(threshold) || 90, 60), 99);
        const updated = {
            title,
            type,
            description,
            threshold: safeThreshold,
            filename: file ? file.filename : row.filename,
            mime: file ? file.mimetype : row.mime,
            preview_filename: preview ? preview.filename : row.preview_filename
        };

        db.run(
            `
            UPDATE videos
            SET title = ?, type = ?, description = ?, filename = ?, mime = ?, preview_filename = ?, threshold = ?
            WHERE id = ?
            `,
            [
                updated.title,
                updated.type,
                updated.description,
                updated.filename,
                updated.mime,
                updated.preview_filename,
                updated.threshold,
                row.id
            ],
            (updateErr) => {
                if (updateErr) {
                    res.status(500).json({ error: 'db_error' });
                    return;
                }
                db.get('SELECT * FROM videos WHERE id = ?', [row.id], (getErr, freshRow) => {
                    if (getErr || !freshRow) {
                        res.status(500).json({ error: 'db_error' });
                        return;
                    }
                    res.json(normalizeRow(freshRow));
                });
            }
        );
    });
});

app.listen(PORT, () => {
    console.log(`RiverDub server running on http://localhost:${PORT}`);
});
