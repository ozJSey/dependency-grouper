const esbuild = require('esbuild');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node16',
  minify: true,
  sourcemap: false,
  external: ['sort-package-json', 'yaml'],
};

// Library entry
esbuild.buildSync({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.min.js',
  format: 'cjs',
});

// CLI entry
esbuild.buildSync({
  ...shared,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.min.js',
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
});

console.log('Built dist/index.min.js and dist/cli.min.js');
