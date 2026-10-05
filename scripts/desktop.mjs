import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, delimiter } from 'node:path';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
// Optional portable Rust installation; otherwise use the developer's normal PATH.
const localTools = process.env.IMAGE_ARENA_TOOLCHAIN;
const env = { ...process.env };
if (localTools && existsSync(resolve(localTools, 'cargo/bin/cargo.exe'))) {
  env.CARGO_HOME = resolve(localTools, 'cargo');
  env.RUSTUP_HOME = resolve(localTools, 'rustup');
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${resolve(localTools, 'cargo/bin')}${delimiter}${env[pathKey] ?? ''}`;
}
const args = process.argv.slice(2);
const testing = args[0] === 'test';
// Keep compiler diagnostics useful without embedding the builder's private paths.
if (!testing) {
  const existing = env.CARGO_ENCODED_RUSTFLAGS !== undefined
    ? env.CARGO_ENCODED_RUSTFLAGS.split('\x1f')
    : (env.RUSTFLAGS ?? '').split(/\s+/).filter(Boolean);
  const mappings = [...new Set([root, homedir(), env.CARGO_HOME].filter(Boolean)
    .flatMap(path => [path, path.replaceAll('\\', '/')]))];
  env.CARGO_ENCODED_RUSTFLAGS = [...existing, ...mappings.map(path =>
    `--remap-path-prefix=${path}=/build`)].join('\x1f');
}
const child = testing
  ? spawn('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', ...args.slice(1)], { cwd: root, env, stdio: 'inherit' })
  : spawn(process.execPath, [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...args], { cwd: root, env, stdio: 'inherit' });
child.on('error', error => { console.error(`Desktop tool failed: ${error.message}. Install Rust MSVC or check the local toolchain.`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
