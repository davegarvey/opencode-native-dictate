import { transformFileAsync } from '@babel/core';
import { mkdir, writeFile, cp, readdir } from 'node:fs/promises';
await mkdir('dist', {recursive: true});
const result = await transformFileAsync('src/tui.tsx', {presets: [
  ['babel-preset-solid', {moduleName: '@opentui/solid', generate: 'universal'}],
  ['@babel/preset-typescript', {allExtensions: true, isTSX: true}]
]});
await writeFile('dist/tui.js', result.code);
for (const name of (await readdir('src')).filter(name => name.endsWith('.mjs'))) {
  await cp(`src/${name}`, `dist/${name}`);
}
