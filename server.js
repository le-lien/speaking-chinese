const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3003);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const RECORDINGS_DIR = path.join(ROOT, "recordings");
const METADATA_FILE = path.join(RECORDINGS_DIR, "metadata.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".txt": "text/plain; charset=utf-8",
};

function ensureRecordingStore() {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  if (!fs.existsSync(METADATA_FILE)) {
    fs.writeFileSync(METADATA_FILE, "[]\n", "utf8");
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": typeof data === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function safeName(name) {
  return String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function readMetadata() {
  ensureRecordingStore();
  try {
    const records = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeMetadata(records) {
  ensureRecordingStore();
  fs.writeFileSync(METADATA_FILE, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function discoverCards() {
  const files = fs.readdirSync(ROOT);
  const cards = new Map();
  const pattern = /^s(\d+)u(\d+)s(\d+)_(cn|en)\.txt$/i;

  for (const file of files) {
    const match = file.match(pattern);
    if (!match) continue;
    const [, seriesRaw, unitRaw, sentenceRaw, language] = match;
    const key = `s${seriesRaw}u${unitRaw}s${sentenceRaw}`;
    const existing = cards.get(key) || {
      id: key,
      series: Number(seriesRaw),
      unit: Number(unitRaw),
      sentence: Number(sentenceRaw),
      cn: "",
      en: "",
      audio: {
        cn: `/data/${key}_cn.mp3`,
        en: `/data/${key}_en.mp3`,
      },
    };
    existing[language.toLowerCase()] = fs.readFileSync(path.join(ROOT, file), "utf8").trim();
    cards.set(key, existing);
  }

  return [...cards.values()]
    .filter((card) => card.cn)
    .sort((a, b) => a.series - b.series || a.unit - b.unit || a.sentence - b.sentence);
}

function serveFile(req, res, filePath, noStore = false) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": noStore ? "no-store" : "public, max-age=60",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/cards") {
    send(res, 200, { cards: discoverCards() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/recordings") {
    send(res, 200, { recordings: readMetadata() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/recordings") {
    const body = await readJsonBody(req);
    const audioData = String(body.audio || "");
    const match = audioData.match(/^data:audio\/webm[^,]*,(.+)$/);
    if (!match) {
      send(res, 400, { error: "Recording audio is missing." });
      return;
    }
    const id = crypto.randomUUID();
    const filename = `${id}.webm`;
    const title = safeName(body.title) || "Recording";
    const buffer = Buffer.from(match[1], "base64");
    fs.writeFileSync(path.join(RECORDINGS_DIR, filename), buffer);
    const records = readMetadata();
    const record = {
      id,
      title,
      filename,
      cardId: safeName(body.cardId),
      createdAt: new Date().toISOString(),
    };
    records.unshift(record);
    writeMetadata(records);
    send(res, 201, { recording: record });
    return;
  }

  const recordingMatch = url.pathname.match(/^\/api\/recordings\/([a-f0-9-]+)$/i);
  if (recordingMatch && req.method === "PATCH") {
    const body = await readJsonBody(req);
    const id = recordingMatch[1];
    const records = readMetadata();
    const record = records.find((item) => item.id === id);
    if (!record) {
      send(res, 404, { error: "Recording not found." });
      return;
    }
    record.title = safeName(body.title) || record.title;
    writeMetadata(records);
    send(res, 200, { recording: record });
    return;
  }

  if (recordingMatch && req.method === "DELETE") {
    const id = recordingMatch[1];
    const records = readMetadata();
    const record = records.find((item) => item.id === id);
    if (!record) {
      send(res, 404, { error: "Recording not found." });
      return;
    }
    const filePath = path.join(RECORDINGS_DIR, record.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    writeMetadata(records.filter((item) => item.id !== id));
    send(res, 200, { ok: true });
    return;
  }

  send(res, 404, { error: "Not found." });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/data/")) {
      const file = path.basename(decodeURIComponent(url.pathname));
      serveFile(req, res, path.join(ROOT, file), true);
      return;
    }

    if (url.pathname.startsWith("/recordings/")) {
      const file = path.basename(decodeURIComponent(url.pathname));
      serveFile(req, res, path.join(RECORDINGS_DIR, file), true);
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      send(res, 403, "Forbidden");
      return;
    }
    serveFile(req, res, filePath);
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

ensureRecordingStore();
server.listen(PORT, () => {
  console.log(`Speaking Chinese is running at http://localhost:${PORT}`);
});
