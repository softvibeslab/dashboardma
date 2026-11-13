#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DATA = path.resolve(process.cwd(), 'data/state.json');
const GLOBAL_EMAILS = ['rgarcia@mobilityappsin.com.mx', 'teamworkmobility@gmail.com'];
const GLOBAL_TELEGRAM = ['5791501756'];
const ERROR_STATUSES = new Set(['PAT_EXPIRED', 'AUTH_FAILED', 'ACCESS_DENIED', 'REMOTE_NOT_FOUND', 'FETCH_FAILED', 'PULL_FAILED', 'DIRTY_WORKTREE', 'DIVERGED', 'UNKNOWN_ERROR']);

function runGit(repoPath, args) {
  const result = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8', timeout: 120000 });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function sanitize(value) {
  return String(value || '')
    .replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=_-]+/gi, 'Authorization: Basic [REDACTED]')
    .replace(/(pat|token|secret|password)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+@dev\.azure\.com/gi, 'https://[REDACTED]@dev.azure.com')
    .slice(0, 1200);
}
function classify(stderr) {
  const text = String(stderr || '').toLowerCase();
  if (text.includes('access denied') || text.includes('permission')) return 'ACCESS_DENIED';
  if (text.includes('expired')) return 'PAT_EXPIRED';
  if (text.includes('authentication') || text.includes('could not read username') || text.includes('could not read password')) return 'AUTH_FAILED';
  if (text.includes('repository not found') || text.includes('tf401019')) return 'REMOTE_NOT_FOUND';
  return 'FETCH_FAILED';
}
function recipientsFor(repo, responsibles) {
  const owners = (repo.responsibleIds || []).map((id) => responsibles.find((owner) => owner.id === id)).filter((owner) => owner && owner.active !== false);
  return {
    emails: [...new Set([...GLOBAL_EMAILS, ...owners.map((owner) => owner.email).filter(Boolean)])],
    telegramIds: [...new Set([...GLOBAL_TELEGRAM, ...owners.map((owner) => owner.telegramId).filter(Boolean)])]
  };
}
function createAlert(repo, status, message, responsibles) {
  return {
    id: `RALERT-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    repoId: repo.id,
    status,
    severity: ERROR_STATUSES.has(status) ? 'critical' : 'medium',
    message: sanitize(message),
    createdAt: new Date().toISOString(),
    recipients: recipientsFor(repo, responsibles),
    deliveryStatus: [
      { channel: 'email', status: 'pending' },
      { channel: 'telegram', status: 'pending' }
    ]
  };
}
function evaluateRepo(repo, responsibles) {
  if (!repo.localPath) return { ...repo, status: 'UNKNOWN_ERROR', alert: createAlert(repo, 'UNKNOWN_ERROR', 'Repositorio sin localPath configurado', responsibles) };
  const status = runGit(repo.localPath, ['status', '--short']);
  if (status.status !== 0) return { ...repo, status: 'UNKNOWN_ERROR', alert: createAlert(repo, 'UNKNOWN_ERROR', status.stderr || status.stdout, responsibles) };
  if (status.stdout.trim()) return { ...repo, status: 'DIRTY_WORKTREE', alert: createAlert(repo, 'DIRTY_WORKTREE', 'Worktree con cambios locales; no se ejecuta pull automático.', responsibles) };
  const branch = runGit(repo.localPath, ['branch', '--show-current']);
  const currentBranch = branch.stdout.trim() || repo.currentBranch || '';
  const fetch = runGit(repo.localPath, ['fetch', 'origin', '--prune']);
  if (fetch.status !== 0) {
    const errorStatus = classify(fetch.stderr || fetch.stdout);
    return { ...repo, currentBranch, status: errorStatus, alert: createAlert(repo, errorStatus, fetch.stderr || fetch.stdout, responsibles) };
  }
  const target = repo.canonicalBranch || currentBranch;
  const remoteRef = `origin/${target}`;
  const remoteHead = runGit(repo.localPath, ['rev-parse', '--verify', remoteRef]);
  if (remoteHead.status !== 0) return { ...repo, currentBranch, status: 'REMOTE_NOT_FOUND', alert: createAlert(repo, 'REMOTE_NOT_FOUND', remoteHead.stderr || remoteHead.stdout, responsibles) };
  if (currentBranch !== target) return { ...repo, currentBranch, remoteHead: remoteHead.stdout.trim(), status: 'BEHIND', decision: `checkout_required:${target}` };
  const localHead = runGit(repo.localPath, ['rev-parse', 'HEAD']).stdout.trim();
  const base = runGit(repo.localPath, ['merge-base', 'HEAD', remoteRef]).stdout.trim();
  if (localHead === remoteHead.stdout.trim()) return { ...repo, currentBranch, localHead, remoteHead: remoteHead.stdout.trim(), status: 'UP_TO_DATE', lastSyncAt: new Date().toISOString() };
  if (base === localHead) {
    const pull = runGit(repo.localPath, ['pull', '--ff-only', 'origin', target]);
    if (pull.status !== 0) return { ...repo, currentBranch, localHead, status: 'PULL_FAILED', alert: createAlert(repo, 'PULL_FAILED', pull.stderr || pull.stdout, responsibles) };
    const newHead = runGit(repo.localPath, ['rev-parse', 'HEAD']).stdout.trim();
    return { ...repo, currentBranch, localHead: newHead, remoteHead: newHead, status: 'UPDATED', lastSyncAt: new Date().toISOString() };
  }
  return { ...repo, currentBranch, localHead, remoteHead: remoteHead.stdout.trim(), status: 'DIVERGED', alert: createAlert(repo, 'DIVERGED', 'La rama local y remota divergen; requiere revisión humana.', responsibles) };
}
async function main() {
  const dataFile = path.resolve(process.argv[2] || process.env.REPO_SYNC_STATE || DEFAULT_DATA);
  const dryRun = process.argv.includes('--dry-run');
  const raw = await readFile(dataFile, 'utf8');
  const data = JSON.parse(raw);
  data.repositories = Array.isArray(data.repositories) ? data.repositories : [];
  data.repoResponsibles = Array.isArray(data.repoResponsibles) ? data.repoResponsibles : [];
  data.repoAlerts = Array.isArray(data.repoAlerts) ? data.repoAlerts : [];
  const results = data.repositories.map((repo) => evaluateRepo(repo, data.repoResponsibles));
  const alerts = results.map((repo) => repo.alert).filter(Boolean);
  data.repositories = results.map(({ alert, ...repo }) => repo);
  data.repoAlerts = [...alerts, ...data.repoAlerts].slice(0, 500);
  data.meta = {
    ...(data.meta || {}),
    repoSync: { syncedAt: new Date().toISOString(), dryRun, repositories: results.length, alerts: alerts.length }
  };
  if (!dryRun) {
    await mkdir(path.dirname(dataFile), { recursive: true });
    await writeFile(dataFile, JSON.stringify(data, null, 2) + '\n');
  }
  const summary = { ok: alerts.length === 0, dryRun, repositories: results.length, alerts: alerts.length, statuses: results.map((repo) => ({ id: repo.id, name: repo.name, status: repo.status })) };
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = alerts.length ? 2 : 0;
}
main().catch((error) => { console.error(sanitize(error.stack || error.message)); process.exitCode = 1; });
