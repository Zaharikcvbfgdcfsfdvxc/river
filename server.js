const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
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
            season INTEGER,
            episode INTEGER,
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
        if (!columns.has('season')) {
            db.run(`ALTER TABLE videos ADD COLUMN season INTEGER`);
        }
        if (!columns.has('episode')) {
            db.run(`ALTER TABLE videos ADD COLUMN episode INTEGER`);
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
    const where = [];
    let sql = 'SELECT * FROM videos';
    if (req.query.type) {
        where.push('type = ?');
        params.push(req.query.type);
    }
    const seasonParam = Number(req.query.season);
    if (Number.isFinite(seasonParam) && seasonParam > 0) {
        where.push('season = ?');
        params.push(Math.floor(seasonParam));
    }
    if (where.length) {
        sql += ` WHERE ${where.join(' AND ')}`;
    }
    const query = String(req.query.q || req.query.query || '').trim();
    sql += ' ORDER BY created_at DESC';
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'db_error' });
            return;
        }
        if (!query) {
            res.json(rows.map(normalizeRow));
            return;
        }
        const terms = query
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

        const levenshtein = (a, b) => {
            if (a === b) return 0;
            const alen = a.length;
            const blen = b.length;
            if (alen === 0) return blen;
            if (blen === 0) return alen;
            const matrix = Array.from({ length: alen + 1 }, () => new Array(blen + 1));
            for (let i = 0; i <= alen; i += 1) matrix[i][0] = i;
            for (let j = 0; j <= blen; j += 1) matrix[0][j] = j;
            for (let i = 1; i <= alen; i += 1) {
                for (let j = 1; j <= blen; j += 1) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + cost
                    );
                }
            }
            return matrix[alen][blen];
        };

        const fuzzyMatch = (term, hay) => {
            if (hay.includes(term)) return true;
            if (term.length <= 2) return false;
            const words = hay.match(/[a-zа-я0-9]+/gi) || [];
            const maxDistance = term.length <= 4 ? 1 : term.length <= 7 ? 2 : 3;
            return words.some((word) => {
                if (word.startsWith(term)) return true;
                const dist = levenshtein(term, word);
                const similarity = 1 - dist / Math.max(term.length, word.length);
                return dist <= maxDistance || similarity >= 0.7;
            });
        };

        const filtered = rows.filter((row) => {
            const hay = `${row.title} ${row.description || ''}`.toLowerCase();
            return terms.every((term) => fuzzyMatch(term, hay));
        });
        res.json(filtered.map(normalizeRow));
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
    const allowedTypes = new Set(['video', 'demo']);
    if (!allowedTypes.has(type)) {
        res.status(400).json({ error: 'invalid_type' });
        return;
    }

    const parsePositiveInt = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return null;
        return Math.floor(num);
    };
    const season = parsePositiveInt(req.body.season);
    const episode = parsePositiveInt(req.body.episode);
    const normalizedSeason = season && episode ? season : null;
    const normalizedEpisode = season && episode ? episode : null;

    const createdAt = new Date().toISOString();
    const safeThreshold = Math.min(Math.max(Number(threshold) || 90, 60), 99);
    const params = [
        title,
        type,
        description,
        file.filename,
        file.mimetype,
        preview ? preview.filename : null,
        normalizedSeason,
        normalizedEpisode,
        safeThreshold,
        createdAt
    ];

    db.run(
        `
        INSERT INTO videos (title, type, description, filename, mime, preview_filename, season, episode, threshold, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const allowedTypes = new Set(['video', 'demo']);
    if (!title || !type || !allowedTypes.has(type)) {
        res.status(400).json({ error: 'fields_required' });
        return;
    }

    const parsePositiveInt = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return null;
        return Math.floor(num);
    };
    const season = parsePositiveInt(req.body.season);
    const episode = parsePositiveInt(req.body.episode);
    const normalizedSeason = season && episode ? season : null;
    const normalizedEpisode = season && episode ? episode : null;

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
            preview_filename: preview ? preview.filename : row.preview_filename,
            season: normalizedSeason,
            episode: normalizedEpisode
        };

        db.run(
            `
            UPDATE videos
            SET title = ?, type = ?, description = ?, filename = ?, mime = ?, preview_filename = ?, season = ?, episode = ?, threshold = ?
            WHERE id = ?
            `,
            [
                updated.title,
                updated.type,
                updated.description,
                updated.filename,
                updated.mime,
                updated.preview_filename,
                updated.season,
                updated.episode,
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

app.delete('/api/videos/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        db.run('DELETE FROM videos WHERE id = ?', [req.params.id], (delErr) => {
            if (delErr) {
                res.status(500).json({ error: 'db_error' });
                return;
            }
            const files = [row.filename, row.preview_filename].filter(Boolean);
            files.forEach((file) => {
                const target = path.join(uploadDir, file);
                fs.unlink(target, () => {});
            });
            res.json({ ok: true });
        });
    });
});

app.listen(PORT, () => {
    console.log(`RiverDub server running on http://localhost:${PORT}`);
});
