const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');
const { StringDecoder } = require('string_decoder');

const PUBLIC_DIR = path.join(__dirname, 'pharma');
const USERS_FILE = path.join(__dirname, 'pharma_users.json');
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || null;

if (!GOOGLE_MAPS_API_KEY) {
  console.warn('Warning: GOOGLE_MAPS_API_KEY not set in environment. Directions proxy will be unavailable.');
}

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]), 'utf8');
  }
}

function readUsers() {
  ensureUsersFile();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '[]');
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function hash(p) {
  return require('crypto').createHash('sha256').update(p).digest('hex');
}

function serveStatic(req, res) {
  let parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Decode an encoded polyline string into an array of {lat, lon}
function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0, coordinates = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return coordinates;
}

function collectRequestData(req, cb) {
  const decoder = new StringDecoder('utf8');
  let body = '';
  req.on('data', chunk => { body += decoder.write(chunk); });
  req.on('end', () => { body += decoder.end(); cb(body); });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Directions proxy for secure use of Google Maps API key (server-side only)
  if (pathname === '/api/directions' && req.method === 'GET') {
    const origin = parsed.query.origin; // expected 'lat,lon'
    const destination = parsed.query.destination; // expected 'lat,lon'
    if (!GOOGLE_MAPS_API_KEY) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'missing_api_key' }));
      return;
    }
    if (!origin || !destination) {
      res.writeHead(400, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'missing_parameters' }));
      return;
    }

    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}&mode=driving`;
    https.get(directionsUrl, (gres) => {
      let body = '';
      gres.on('data', chunk => body += chunk);
      gres.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.routes || !data.routes.length) {
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ok: false, routes: [] }));
            return;
          }
          const encoded = data.routes[0].overview_polyline?.points || '';
          const points = decodePolyline(encoded);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok: true, polyline: points }));
        } catch (e) {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ error: 'directions_parse_error' }));
        }
      });
    }).on('error', (err) => {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'directions_request_error' }));
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    // API endpoints
    if (pathname === '/api/register' && req.method === 'POST') {
      collectRequestData(req, body => {
        try {
          const data = JSON.parse(body || '{}');
          const { name, role, password } = data;
          if (!name || !role || !password) { res.writeHead(400); res.end(JSON.stringify({error:'missing'})); return; }
          const users = readUsers();
          if (users.find(u=>u.name===name && u.role===role)) { res.writeHead(409); res.end(JSON.stringify({error:'exists'})); return; }
          const passwordHash = hash(password);
          users.unshift({ name, role, passwordHash });
          saveUsers(users);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok: true, user: { name, role } }));
        } catch (e) { res.writeHead(500); res.end('{}'); }
      });
      return;
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      collectRequestData(req, body => {
        try {
          const data = JSON.parse(body || '{}');
          const { name, role, password } = data;
          const users = readUsers();
          const passwordHash = hash(password || '');
          const found = users.find(u=>u.name===name && u.role===role && u.passwordHash===passwordHash);
          if (!found) { res.writeHead(401); res.end(JSON.stringify({ ok:false })); return; }
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok:true, user:{ name: found.name, role: found.role } }));
        } catch(e){ res.writeHead(500); res.end('{}'); }
      });
      return;
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      const users = readUsers();
      // return without password hashes
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(users.map(u=>({ name:u.name, role:u.role }))));
      return;
    }

    if (pathname.startsWith('/api/users') && req.method === 'DELETE') {
      collectRequestData(req, body => {
        try {
          const data = JSON.parse(body || '{}');
          const { name, role } = data;
          if (!name) { res.writeHead(400); res.end(JSON.stringify({error:'missing'})); return; }
          let users = readUsers();
          users = users.filter(u => !(u.name===name && (!role || u.role===role)));
          saveUsers(users);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok:true }));
        } catch(e){ res.writeHead(500); res.end('{}'); }
      });
      return;
    }

    res.writeHead(404); res.end('API not found');
    return;
  }

  // static
  serveStatic(req, res);
});

const port = process.env.PORT || 3001;
server.listen(port, () => console.log(`Server serving ./pharma and API on http://localhost:${port}`));
