const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("/Users/naoryanko/rime-rush/node_modules/playwright-core");

const ROOT = "/Users/naoryanko/Documents/antigravity/excited-hopper";
const HTML_PATH = path.join(ROOT, "landing_page", "promo-video-mobile.html");
const OUT_MP4 = path.join(ROOT, "dist", "streamsnap_promo_mobile_9x16.mp4");
const ASSET_MP4 = path.join(ROOT, "landing_page", "assets", "streamsnap_promo_mobile_9x16.mp4");

const FPS = 25;
const DURATION = 24;
const TOTAL_FRAMES = FPS * DURATION;

async function main() {
  console.log("Launching headless Chromium for 1080x1920 Mobile Vertical Promo rendering...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.body.classList.add("capture-mode");
  });
  await page.waitForTimeout(400);

  const audioExpr = [
    "0.08*sin(2*PI*110*t)*exp(-mod(t,0.5)*3)",
    "0.05*sin(2*PI*220*t)*exp(-mod(t,0.25)*6)",
    "0.14*sin(2*PI*880*t)*between(t,4.4,4.75)*exp(-(t-4.4)*10)",
    "0.10*sin(2*PI*(350+400*(t-5.0))*t)*between(t,5.0,6.2)",
    "0.15*sin(2*PI*660*t)*between(t,6.8,7.15)*exp(-(t-6.8)*10)",
    "0.14*sin(2*PI*520*t)*between(t,10.2,10.55)*exp(-(t-10.2)*8)",
    "0.18*sin(2*PI*1046.5*t)*between(t,13.8,14.25)*exp(-(t-13.8)*8)",
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

    if (i % 60 === 0 || i === TOTAL_FRAMES - 1) {
      console.log(`Rendered mobile frame ${i + 1}/${TOTAL_FRAMES} (${((i + 1) / TOTAL_FRAMES * 100).toFixed(0)}%)`);
    }
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

  fs.copyFileSync(OUT_MP4, ASSET_MP4);
  await browser.close();
  console.log(`✅ Mobile Promo Video saved to: ${OUT_MP4}`);
}

main().catch((err) => {
  console.error("Error rendering mobile video:", err);
  process.exit(1);
});
