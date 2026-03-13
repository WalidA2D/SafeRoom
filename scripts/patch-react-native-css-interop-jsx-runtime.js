const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgDir = path.join(root, 'node_modules', 'react-native-css-interop');
const targetFile = path.join(pkgDir, 'jsx-runtime.js');
const targetDir = path.join(pkgDir, 'dist', 'runtime');
const sourceFile = path.join(targetDir, 'jsx-runtime.js');

if (!fs.existsSync(pkgDir)) {
  console.warn('react-native-css-interop not found in node_modules; skipping patch.');
  process.exit(0);
}

if (!fs.existsSync(sourceFile)) {
  console.warn('Expected source file not found:', sourceFile);
  process.exit(0);
}

const content = `module.exports = require('./dist/runtime/jsx-runtime');\n`;

if (fs.existsSync(targetFile)) {
  const existing = fs.readFileSync(targetFile, 'utf8');
  if (existing === content) {
    process.exit(0);
  }
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Patched react-native-css-interop/jsx-runtime.js');
