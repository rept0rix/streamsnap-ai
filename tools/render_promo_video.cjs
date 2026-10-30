const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const ROOT = "/Users/naoryanko/Documents/antigravity/excited-hopper";
const HTML_PATH = path.join(ROOT, "landing_page", "promo-video.html");
const OUT_MP4 = path.join(ROOT, "dist", "streamsnap_promo_16x9.mp4");

const FPS = 25;
const DURATION = 24;
const TOTAL_FRAMES = FPS * DURATION;

async function main() {
  console.log("Launching headless Chromium for 1920x1080 Promo Video rendering...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.body.classList.add("capture-mode");
  });
  await page.waitForTimeout(400);

  // Spawn ffmpeg: pipe JPEG frames in, synthesize ambient cyber bass + UI chimes audio track
  const audioExpr = [
    "0.08*sin(2*PI*110*t)*exp(-mod(t,0.5)*3)",
    "0.05*sin(2*PI*220*t)*exp(-mod(t,0.25)*6)",
    "0.14*sin(2*PI*880*t)*between(t,2.4,2.75)*exp(-(t-2.4)*10)",
    "0.14*sin(2*PI*920*t)*between(t,5.5,5.65)*exp(-(t-5.5)*20)",
    "0.10*sin(2*PI*(350+400*(t-6.2))*t)*between(t,6.2,7.3)",
    "0.15*sin(2*PI*660*t)*between(t,8.2,8.55)*exp(-(t-8.2)*10)",
    "0.18*sin(2*PI*1046.5*t)*between(t,14.2,14.65)*exp(-(t-14.2)*8)",
    "0.15*sin(2*PI*784*t)*between(t,20.5,21.2)*exp(-(t-20.5)*5)"
  ].join("+");

  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(FPS),
    "-i", "-",
    "-f", "lavfi",
    "-i", `aevalsrc='${audioExpr}:s=44100:d=${DURATION}'`,
    "-shortest",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    OUT_MP4
  ];

  const ff = spawn("/opt/homebrew/bin/ffmpeg", ffmpegArgs, {
    stdio: ["pipe", "ignore", "pipe"]
  });

  ff.stderr.on("data", () => {});

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;
    await page.evaluate((time) => {
      window.setVideoTime(time, "he");
    }, t);

    const buf = await page.screenshot({
      type: "jpeg",
      quality: 90
    });

    const canContinue = ff.stdin.write(buf);
    if (!canContinue) {
      await new Promise((resolve) => ff.stdin.once("drain", resolve));
    }

    if (i % 50 === 0 || i === TOTAL_FRAMES - 1) {
      console.log(`Rendered frame ${i + 1}/${TOTAL_FRAMES} (${((i + 1) / TOTAL_FRAMES * 100).toFixed(0)}%)`);
    }
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

  await browser.close();
  console.log(`✅ Promo Video saved to: ${OUT_MP4}`);
}

main().catch((err) => {
  console.error("Error rendering video:", err);
  process.exit(1);
});
