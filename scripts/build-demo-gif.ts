import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function main() {
  const imgDir = path.resolve('docs/images');
  const tempDir = path.resolve('.temp_gif_frames');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const frames = [
    'vectorsync-dashboard.png',
    'vectorsync-sandbox.png',
    'vectorsync-search.png',
    'vectorsync-ledger.png',
  ];

  console.log('Normalizing frames to uniform 850x560 canvas with background color #090d16...');
  const normalizedFrames: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const srcPath = path.join(imgDir, frames[i]);
    const dstPath = path.join(tempDir, `frame_${String(i).padStart(2, '0')}.png`);
    // Scale and pad to exactly 850x560
    execSync(
      `ffmpeg -y -i "${srcPath}" -vf "scale=850:560:force_original_aspect_ratio=decrease:flags=lanczos,pad=850:560:(ow-iw)/2:(oh-ih)/2:color=#090d16" "${dstPath}"`,
      { stdio: 'ignore' }
    );
    normalizedFrames.push(dstPath);
  }

  // Create concat file for normalized frames (3 seconds per frame)
  let concatText = '';
  for (const nf of normalizedFrames) {
    const cleanPath = nf.replace(/\\/g, '/');
    concatText += `file '${cleanPath}'\nduration 2.5\n`;
  }
  const lastPath = normalizedFrames[normalizedFrames.length - 1].replace(/\\/g, '/');
  concatText += `file '${lastPath}'\n`;

  const concatFile = path.join(tempDir, 'frames.txt');
  fs.writeFileSync(concatFile, concatText, 'utf8');

  const palettePath = path.join(tempDir, 'palette.png');
  const outGif = path.join(imgDir, 'vectorsync_demo.gif');

  console.log('Generating color palette with ffmpeg...');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -vf "palettegen" "${palettePath}"`,
    { stdio: 'inherit' }
  );

  console.log('Assembling final high-quality GIF with paletteuse...');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -i "${palettePath}" -lavfi "paletteuse=dither=bayer:bayer_scale=3" -r 10 "${outGif}"`,
    { stdio: 'inherit' }
  );

  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log(`Successfully generated demo GIF at ${outGif}!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
