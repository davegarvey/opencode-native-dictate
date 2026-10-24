import { chmod, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const PREFIX = 'opencode-dictate-';
const OWNER_FILE = '.owner.json';
const OWNER_ID = 'opencode-native-dictate';

async function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

/** Remove only our named session directories whose recorded owner is gone. */
export async function cleanupStaleSessions(base = tmpdir()) {
  const root = resolve(base);
  for (const name of await readdir(root)) {
    if (!name.startsWith(PREFIX)) continue;
    const directory = join(root, name);
    const stat = await lstat(directory).catch(error => error?.code === 'ENOENT' ? undefined : Promise.reject(error));
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue;
    const ownerPath = join(directory, OWNER_FILE);
    const ownerStat = await lstat(ownerPath).catch(error => error?.code === 'ENOENT' ? undefined : Promise.reject(error));
    if (!ownerStat?.isFile() || ownerStat.isSymbolicLink()) continue;
    let owner;
    try { owner = JSON.parse(await readFile(ownerPath, 'utf8')); } catch { continue; }
    if (owner?.id !== OWNER_ID || !Number.isSafeInteger(owner.pid)) continue;
    if (!await processIsAlive(owner.pid)) await rm(directory, {recursive: true, force: true});
  }
}

export async function createPrivateSessionDirectory(base = tmpdir()) {
  await cleanupStaleSessions(base);
  const directory = await mkdtemp(join(base, PREFIX));
  try {
    await chmod(directory, 0o700);
    await writeFile(join(directory, OWNER_FILE), JSON.stringify({id: OWNER_ID, pid: process.pid, createdAt: Date.now()}), {mode: 0o600, flag: 'wx'});
    return directory;
  } catch (error) {
    await rm(directory, {recursive: true, force: true});
    throw error;
  }
}

export async function removePrivateSessionDirectory(directory) {
  const resolved = resolve(directory);
  if (!resolved.split('/').pop()?.startsWith(PREFIX)) throw new Error('Refusing to remove a directory not owned by Native Dictate');
  const directoryStat = await lstat(resolved).catch(error => error?.code === 'ENOENT' ? undefined : Promise.reject(error));
  if (!directoryStat) return;
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Refusing to remove a non-directory Native Dictate session path');
  const ownerPath = join(resolved, OWNER_FILE);
  const ownerStat = await lstat(ownerPath).catch(error => error?.code === 'ENOENT' ? undefined : Promise.reject(error));
  if (!ownerStat?.isFile() || ownerStat.isSymbolicLink()) throw new Error('Refusing to remove a session without a valid Native Dictate owner marker');
  let owner;
  try { owner = JSON.parse(await readFile(ownerPath, 'utf8')); } catch {
    throw new Error('Refusing to remove a session with an unreadable owner marker');
  }
  if (owner?.id !== OWNER_ID || owner.pid !== process.pid) throw new Error('Refusing to remove a session not owned by this process');
  await rm(resolved, {recursive: true, force: true});
}
