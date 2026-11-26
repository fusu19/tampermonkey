import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const repository = process.argv[2] ?? process.env.GITHUB_REPOSITORY;
if (!repository || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('Specify a GitHub repository as owner/name.');
}

const name = 'xuetangx-homework-exporter';
const sourcePath = new URL(`../${name}.user.js`, import.meta.url);
const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n');
const endMarker = '// ==/UserScript==';
const headerEnd = source.indexOf(`\n${endMarker}\n`);
if (!source.startsWith('// ==UserScript==\n') || headerEnd < 0) {
  throw new Error('The userscript metadata block is missing.');
}

const sourceHeader = source.slice(0, headerEnd);
const version = sourceHeader.match(/^\/\/ @version\s+([0-9]+\.[0-9]+\.[0-9]+)$/m)?.[1];
const body = source.slice(headerEnd + endMarker.length + 2);
const runtimeVersion = body.match(/^\s*const VERSION = '([^']+)';$/m)?.[1];
if (!version || version !== runtimeVersion) {
  throw new Error('The @version and panel VERSION must be the same three-part version.');
}

const baseUrl = `https://github.com/${repository}/releases/latest/download`;
const metadata = sourceHeader.split('\n').filter(line => !/^\/\/ @(?:updateURL|downloadURL)\s/.test(line)).join('\n');
const releaseHeader = [
  metadata,
  `// @updateURL    ${baseUrl}/${name}.meta.js`,
  `// @downloadURL  ${baseUrl}/${name}.user.js`,
  endMarker,
  '',
].join('\n');

const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(new URL(`${name}.meta.js`, dist), releaseHeader, 'utf8'),
  writeFile(new URL(`${name}.user.js`, dist), releaseHeader + body, 'utf8'),
]);
const tag = `v${version}`;
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`, 'utf8');
console.log(`${tag} ${baseUrl}/${name}.user.js`);
