// Generate a proper .ico file from the PNG icon
// Usage: node scripts/generate_ico.js
const fs = require('fs');
const path = require('path');

// Simple ICO generator - creates a valid ICO with a single 256x256 PNG entry
function createIcoFromPng(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);

  // ICO Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // Reserved
  header.writeUInt16LE(1, 2);     // Type: 1 = ICO
  header.writeUInt16LE(1, 4);     // Count: 1 image

  // ICO Directory Entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);         // Width: 0 = 256
  entry.writeUInt8(0, 1);         // Height: 0 = 256
  entry.writeUInt8(0, 2);         // Color palette
  entry.writeUInt8(0, 3);         // Reserved
  entry.writeUInt16LE(1, 4);      // Color planes
  entry.writeUInt16LE(32, 6);     // Bits per pixel
  entry.writeUInt32LE(png.length, 8);   // Image size
  entry.writeUInt32LE(22, 12);    // Offset (6 header + 16 entry = 22)

  const ico = Buffer.concat([header, entry, png]);
  fs.writeFileSync(icoPath, ico);
  console.log(`Created ${icoPath} (${ico.length} bytes)`);
}

const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('icon.png not found at', pngPath);
  console.log('Trying to copy the generated JPG as a fallback...');
  // Fallback: just copy the jpg source if sharp didn't work
  const jpgSource = process.argv[2];
  if (jpgSource && fs.existsSync(jpgSource)) {
    fs.copyFileSync(jpgSource, pngPath);
    createIcoFromPng(pngPath, icoPath);
  } else {
    process.exit(1);
  }
} else {
  createIcoFromPng(pngPath, icoPath);
}
