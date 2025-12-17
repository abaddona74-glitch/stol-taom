#!/usr/bin/env node
// Lightweight Redis availability check (no external deps) used by `preinstall`.
// Behavior:
// - If `SKIP_REDIS_CHECK=1` or true -> skip and exit 0
// - Try TCP PING to Redis URL (default redis://127.0.0.1:6379)
// - If ping fails and an installer exists under ./install, attempt to run it (Windows: .msi via msiexec, .exe tried with common silent flags)
// - Re-check after installer; exit 0 on success, non-zero on failure

const net = require('net');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function log(...a) { console.log(...a); }
function err(...a) { console.error(...a); }

// Load .env from repo root (if present) so users can set SKIP_REDIS_CHECK there.
function loadDotEnvFile() {
    try {
        const repoEnv = path.join(__dirname, '..', '.env');
        if (!fs.existsSync(repoEnv)) return;
        const content = fs.readFileSync(repoEnv, 'utf8');
        for (const line of content.split(/\r?\n/)) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;
            const eq = l.indexOf('=');
            if (eq === -1) continue;
            const key = l.slice(0, eq).trim();
            let val = l.slice(eq + 1).trim();
            if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            // don't overwrite existing env vars
            if (process.env[key] === undefined) process.env[key] = val;
        }
    } catch (e) {
        // ignore
    }
}

loadDotEnvFile();

if (process.env.SKIP_REDIS_CHECK === '1' || String(process.env.SKIP_REDIS_CHECK).toLowerCase() === 'true') {
    log('skip redis check via SKIP_REDIS_CHECK');
    process.exit(0);
}

const rawUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let host = '127.0.0.1', port = 6379;
try {
    const u = new URL(rawUrl);
    host = u.hostname || host;
    port = Number(u.port) || port;
} catch (e) {
    // fallback: parse host:port
    const m = rawUrl.match(/([\d.]+):(\d+)/);
    if (m) { host = m[1]; port = Number(m[2]); }
}

const timeoutMs = Number(process.env.REDIS_CHECK_TIMEOUT_MS || 2000);

function pingRedisOnce(timeout) {
    return new Promise((resolve, reject) => {
        const s = new net.Socket();
        let finished = false;
        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            try { s.destroy(); } catch (e) { }
            reject(new Error('timeout'));
        }, timeout || timeoutMs);

        s.once('error', (e) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { s.destroy(); } catch (e) { }
            reject(e);
        });

        s.connect(port, host, () => {
            // send simple RESP PING
            s.write('*1\r\n$4\r\nPING\r\n');
        });

        let data = '';
        s.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('PONG') || data.includes('+PONG')) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                try { s.end(); } catch (e) { }
                resolve(true);
            }
        });

        s.on('close', () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(new Error('socket closed'));
        });
    });
}

async function attemptInstallFromRepo() {
    const installDir = path.join(__dirname, '..', 'install');
    if (!fs.existsSync(installDir)) {
        err('No install directory at', installDir);
        return false;
    }

    // Prefer explicit install/Redis folder if present
    const preferDir = path.join(installDir, 'Redis');
    const scanDirs = [preferDir, installDir].filter(d => fs.existsSync(d));

    for (const dir of scanDirs) {
        log('Scanning installer directory:', dir);
        const files = fs.readdirSync(dir).map(f => path.join(dir, f));

        // If a portable redis-server.exe exists, start it detached
        const redisServer = files.find(f => f.match(/redis-server(\.exe)?$/i));
        if (redisServer) {
            try {
                log('Found redis-server executable:', redisServer, '-> starting detached');
                const child = child_process.spawn(redisServer, [], { detached: true, stdio: 'ignore' });
                child.unref();
                // give server a moment to start
                await new Promise(r => setTimeout(r, 2000));
                return true;
            } catch (e) {
                err('Failed to start redis-server:', e);
                // continue to attempt installers
            }
        }

        const msi = files.find(f => f.match(/\.msi$/i));
        const exes = files.filter(f => f.match(/\.exe$/i));

        if (msi) {
            log('Found MSI installer:', msi, '-> running msiexec /i');
            try {
                const res = child_process.spawnSync('msiexec', ['/i', msi, '/qn', '/norestart'], { stdio: 'inherit' });
                if (res.status === 0) return true;
            } catch (e) {
                err('msiexec failed:', e);
            }
        }

        if (exes.length) {
            for (const exe of exes) {
                log('Attempting installer:', exe);
                // try common silent flags first
                const tryFlags = [['/S'], ['/silent'], ['/quiet'], ['/verysilent'], []];
                for (const flags of tryFlags) {
                    try {
                        const args = flags;
                        log('Running', exe, args.join(' '));
                        const res = child_process.spawnSync(exe, args, { stdio: 'inherit' });
                        if (res.status === 0) {
                            log('Installer finished successfully');
                            return true;
                        }
                    } catch (e) {
                        err('Installer attempt failed:', e);
                    }
                }
            }
            err('All exe installer attempts failed in', dir);
            // continue to next scanDir
        }
    }

    err('No suitable installer or redis-server found in', installDir, 'or install/Redis');
    return false;
}

(async function main() {
    try {
        await pingRedisOnce(timeoutMs);
        log('redis ok');
        process.exit(0);
    } catch (e) {
        err('redis ping failed:', e && e.message ? e.message : e);
    }

    // If here, ping failed. Try to install from repo on Windows.
    if (process.platform === 'win32') {
        log('Attempting to install Redis from ./install (Windows)');
        const ok = await attemptInstallFromRepo();
        if (!ok) {
            err('Installer not run or failed');
            process.exit(1);
        }

        // wait a bit and re-check
        await new Promise(r => setTimeout(r, 3000));
        try {
            await pingRedisOnce(timeoutMs);
            log('redis ok after install');
            process.exit(0);
        } catch (e) {
            err('redis still not responding after install:', e && e.message ? e.message : e);
            process.exit(1);
        }
    }

    err('No automatic installer available for platform', process.platform);
    process.exit(1);
})();
