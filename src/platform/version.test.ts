import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { version } from '../../package.json';
import { createSession } from '../core/tournament';
import { exportRecord } from './browser';

it('keeps desktop metadata, lockfiles and exported records on the same stable version', () => {
  const text = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(JSON.parse(text('src-tauri/tauri.conf.json')).version).toBe(version);
  const lock = JSON.parse(text('package-lock.json'));
  expect(lock.version).toBe(version);
  expect(lock.packages[''].version).toBe(version);
  expect(text('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1]).toBe(version);
  expect(text('src-tauri/Cargo.lock').match(/name = "image-arena"\r?\nversion = "([^"]+)"/)?.[1]).toBe(version);
  const session = createSession({ imageIds: ['only'], targetK: 1, seed: 1 });
  expect(exportRecord(session, []).appVersion).toBe(version);
});
