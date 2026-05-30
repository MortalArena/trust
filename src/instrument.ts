import { startEngine } from '@/lib/sync-engine';

let started = false;

export function ensureSyncEngine() {
  if (!started && typeof globalThis === 'object') {
    started = true;
    startEngine();
  }
}
