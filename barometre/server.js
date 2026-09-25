'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { openDb } = require('./src/db');
const { SCALE, DIMENSIONS, QUESTIONS, DEMOGRAPHICS, ANONYMITY_THRESHOLD } = require('./src/questions');
const stats = require('./src/stats');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 100 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, file));
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Introuvable.');
  fs.readFile(resolved, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'Introuvable.' });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(content);
  });
}

function createApp({ db, adminToken }) {
  const tokenBuf = Buffer.from(adminToken);

  function requireAdmin(req) {
    const header = req.headers.authorization || '';
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (given.length !== tokenBuf.length || !crypto.timingSafeEqual(given, tokenBuf)) {
      throw new HttpError(401, 'Accès administrateur refusé.');
    }
  }

  function campaignFromQuery(url) {
    const id = Number(url.searchParams.get('campaign'));
    const campaign = id ? db.getCampaign(id) : db.getActiveCampaign();
    if (!campaign) throw new HttpError(404, 'Campagne introuvable.');
    return campaign;
  }

  function filtersFromQuery(url) {
    const filters = {};
    for (const d of DEMOGRAPHICS) {
      const v = url.searchParams.get(d.id);
      if (v) filters[d.id] = v;
    }
    return filters;
  }

  function parseCampaignBody(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const headcount = body.headcount == null || body.headcount === '' ? null : Number(body.headcount);
    if (headcount != null && (!Number.isInteger(headcount) || headcount < 1)) {
      throw new HttpError(400, 'L’effectif doit être un entier positif.');
    }
    return { name, headcount };
  }

  const routes = {
    // --- Public ---------------------------------------------------------------
    'GET /api/questionnaire': () => {
      const campaign = db.getActiveCampaign();
      return {
        campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
        scale: SCALE,
        dimensions: DIMENSIONS.map((d) => ({ id: d.id, label: d.label })),
        questions: QUESTIONS.map(({ id, dimension, text }) => ({ id, dimension, text })),
        demographics: DEMOGRAPHICS,
      };
    },

    'POST /api/responses': async (req) => {
      const campaign = db.getActiveCampaign();
      if (!campaign) throw new HttpError(409, 'Aucune campagne n’est ouverte actuellement.');
      let submission;
      try {
        submission = stats.validateSubmission(await readJson(req));
      } catch (err) {
        throw err instanceof HttpError ? err : new HttpError(400, err.message);
      }
      db.insertResponse(campaign.id, submission);
      return [201, { ok: true }];
    },

    // --- Administration -------------------------------------------------------
    'GET /api/admin/campaigns': (req) => {
      requireAdmin(req);
      return db.listCampaigns();
    },

    'POST /api/admin/campaigns': async (req) => {
      requireAdmin(req);
      const { name, headcount } = parseCampaignBody(await readJson(req));
      if (!name) throw new HttpError(400, 'Le nom de la campagne est obligatoire.');
      const id = db.createCampaign({ name, headcount });
      db.setActiveCampaign(id);
      return [201, db.getCampaign(id)];
    },

    'POST /api/admin/campaigns/:id': async (req, url, id) => {
      requireAdmin(req);
      if (!db.getCampaign(id)) throw new HttpError(404, 'Campagne introuvable.');
      const body = await readJson(req);
      const { name, headcount } = parseCampaignBody(body);
      db.updateCampaign(id, {
        name: 'name' in body && name ? name : undefined,
        headcount: 'headcount' in body ? headcount : undefined,
      });
      if (body.active === true) db.setActiveCampaign(id);
      if (body.active === false && db.getCampaign(id).active) db.setActiveCampaign(null);
      return db.getCampaign(id);
    },

    'GET /api/admin/results': (req, url) => {
      requireAdmin(req);
      const campaign = campaignFromQuery(url);
      const filters = filtersFromQuery(url);
      const all = db.getResponses(campaign.id);
      const filtered = stats.applyFilters(all, filters);
      const base = {
        campaign,
        filters,
        threshold: ANONYMITY_THRESHOLD,
        totalRespondents: all.length,
        participationRate: campaign.headcount ? Math.round((all.length / campaign.headcount) * 1000) / 10 : null,
        breakdown: stats.breakdown(all),
      };
      if (filtered.length < ANONYMITY_THRESHOLD) {
        return { ...base, hidden: true, respondents: filtered.length };
      }
      const previous = db.getPreviousCampaign(campaign.id);
      const previousResults = previous
        ? stats.computeResults(stats.applyFilters(db.getResponses(previous.id), filters))
        : null;
      const results = stats.withEvolution(stats.computeResults(filtered), previousResults);
      return {
        ...base,
        hidden: false,
        previousCampaign: previousResults && previousResults.respondents >= ANONYMITY_THRESHOLD
          ? { id: previous.id, name: previous.name } : null,
        ...results,
        highlights: stats.highlights(results),
        comments: filtered.filter((r) => r.comment).map((r) => r.comment),
      };
    },

    'GET /api/admin/export.csv': (req, url, _id, res) => {
      requireAdmin(req);
      const campaign = campaignFromQuery(url);
      const slug = campaign.name.normalize('NFD').replace(/[^\w-]+/g, '_');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="barometre_${slug}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.end(stats.toCsv(db.getResponses(campaign.id)));
      return undefined;
    },
  };

  function matchRoute(method, pathname) {
    const exact = routes[`${method} ${pathname}`];
    if (exact) return [exact, null];
    const m = pathname.match(/^\/api\/admin\/campaigns\/(\d+)$/);
    if (m && method === 'POST') return [routes['POST /api/admin/campaigns/:id'], Number(m[1])];
    return [null, null];
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
        serveStatic(req, res, url.pathname);
        return;
      }
      const [route, id] = matchRoute(req.method, url.pathname);
      if (!route) throw new HttpError(404, 'Route inconnue.');
      const result = await route(req, url, id, res);
      if (result === undefined) return;
      const [status, data] = Array.isArray(result) && typeof result[0] === 'number' ? result : [200, result];
      sendJson(res, status, data);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (!res.headersSent) {
        sendJson(res, err.status || 500, { error: err instanceof HttpError ? err.message : 'Erreur interne.' });
      }
    }
  };
}

function main() {
  const port = Number(process.env.PORT) || 3000;
  const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'barometre.db');
  let adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    adminToken = crypto.randomBytes(12).toString('hex');
    console.warn(`ADMIN_TOKEN non défini : jeton généré pour cette session -> ${adminToken}`);
  }

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  if (db.listCampaigns().length === 0) {
    const id = db.createCampaign({ name: `Baromètre ${new Date().getFullYear()}` });
    db.setActiveCampaign(id);
  }

  http.createServer(createApp({ db, adminToken })).listen(port, () => {
    console.log(`Baromètre social disponible sur http://localhost:${port}`);
    console.log(`Tableau de bord : http://localhost:${port}/admin`);
  });
}

if (require.main === module) main();

module.exports = { createApp };
