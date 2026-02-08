import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export type OadmConfig = {
  apiUrl: string;
  name?: string;
  token?: string;
};

export function configDir() {
  return path.join(os.homedir(), '.oadm');
}

export function configPath() {
  return path.join(configDir(), 'config.json');
}

export function readConfig(): OadmConfig {
  const p = configPath();
  if (!fs.existsSync(p)) {
    return { apiUrl: process.env.OADM_API_URL ?? 'http://localhost:3000' };
  }
  const raw = fs.readFileSync(p, 'utf8');
  const cfg = JSON.parse(raw) as OadmConfig;
  cfg.apiUrl = cfg.apiUrl ?? process.env.OADM_API_URL ?? 'http://localhost:3000';
  return cfg;
}

export function writeConfig(cfg: OadmConfig) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  try {
    fs.chmodSync(configPath(), 0o600);
  } catch {
    // ignore on platforms that don't support chmod
  }
}
