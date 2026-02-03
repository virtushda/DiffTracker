const esbuild = require('esbuild');
const path = require('path');

async function build() {
  const entryPoint = path.join(__dirname, 'src', 'webview', 'diffs-entry.ts');
  const outFile = path.join(__dirname, 'webview', 'diffs-bundle.js');

  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      globalName: 'PierreDiffs',
      target: ['es2020'],
      outfile: outFile,
      sourcemap: false,
      minify: true,
      logLevel: 'info',
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

build();
