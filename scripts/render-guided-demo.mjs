import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const width = 1920;
const height = 1080;
const slideSeconds = 5;
const fontFamily = "SF Mono, SFMono-Regular, Menlo, monospace";

const colors = {
  background: "#07111f",
  panel: "#101b2c",
  border: "#2d3f5a",
  text: "#cbd5e3",
  muted: "#7b8aa1",
  blue: "#67b7f7",
  purple: "#b58be2",
  yellow: "#efc55a",
  green: "#47d1a0",
  red: "#ff6678",
};

const line = (label, text, color = "text", options = {}) => ({
  label,
  text,
  color,
  ...options,
});

const slides = [
  {
    title: "WELCOME TO PRODUCT-TO-PR",
    progress: 0,
    lines: [
      line("", "You do not need to know the technical process in advance.", "text", { gapAfter: 28 }),
      line("", "1   Check that your project and tools are ready"),
      line("", "2   Safely understand the real project"),
      line("", "3   Confirm the outcome you want"),
      line("", "4   Resolve only decisions that affect the result"),
      line("", "5   Review and approve the specification"),
      line("", "6   Create a separate branch"),
      line("", "7   Build only the approved change"),
      line("", "8   Run the project's trusted checks"),
      line("", "9   Review the changes and evidence"),
      line("", "10  Prepare a pull request, then stop before merge"),
    ],
  },
  {
    title: "STEP 1 OF 10  •  READINESS",
    progress: 1,
    lines: [
      line("NEXT", "Check the project, GitHub connection, and AI tools.", "blue"),
      line("WHY", "Find setup problems before work begins.", "purple"),
      line("SAFE", "Read-only: no installs, code edits, or setting changes.", "yellow", { gapAfter: 30 }),
      line("DONE", "Git, GitHub, the repository, and Codex are ready.", "green"),
    ],
  },
  {
    title: "STEP 2 OF 10  •  UNDERSTAND THE PROJECT",
    progress: 2,
    lines: [
      line("NEXT", "Read the project's structure, instructions, and tests.", "blue"),
      line("WHY", "Ground the plan in real evidence, not guesses.", "purple"),
      line("SAFE", "Inspection reads files; it does not edit them.", "yellow", { gapAfter: 30 }),
      line("DONE", "Relevant files and trusted checks were found.", "green"),
    ],
  },
  {
    title: "STEP 3 OF 10  •  CONFIRM THE OUTCOME",
    progress: 3,
    lines: [
      line("", "Product-to-PR restates the idea in everyday language:", "text", { gapAfter: 22 }),
      line("", "“Show a warm greeting when someone enters no name,"),
      line("", " instead of displaying a confusing undefined value.”", "text", { gapAfter: 30 }),
      line("YOU", "Confirm or correct the interpretation before planning.", "yellow"),
      line("DONE", "The product outcome is now confirmed.", "green"),
    ],
  },
  {
    title: "STEP 4 OF 10  •  PRODUCT DECISIONS",
    progress: 4,
    lines: [
      line("NEXT", "Ask only questions that materially affect the result.", "blue"),
      line("WHY", "AI recommendations must not silently become requirements.", "purple", { gapAfter: 30 }),
      line("YOU", "Treat omitted, empty, or whitespace-only names as missing.", "yellow"),
      line("DONE", "Each decision is recorded with its source.", "green"),
    ],
  },
  {
    title: "STEP 5 OF 10  •  REVIEW THE SPECIFICATION",
    progress: 5,
    lines: [
      line("NEXT", "Review the complete plan before code changes.", "blue", { gapAfter: 30 }),
      line("SUMMARY", "Replace the broken fallback with “Welcome, friend!”"),
      line("SUCCESS", "Named greetings stay unchanged; missing names are warm"),
      line("FILES", "The greeting behavior and its existing tests"),
      line("CHECK", "Use the project's existing automated checks", "text", { gapAfter: 30 }),
      line("YOU", "Approve, modify, or reject.", "yellow"),
      line("DONE", "The approved plan is saved and resumable.", "green"),
    ],
  },
  {
    title: "STEP 6 OF 10  •  CREATE A SAFE BRANCH",
    progress: 6,
    lines: [
      line("NEXT", "Create a separate line of work for the change.", "blue"),
      line("WHY", "Keep the project's main version untouched.", "purple"),
      line("SAFE", "The branch is local; nothing is published to GitHub.", "yellow", { gapAfter: 30 }),
      line("DONE", "product-to-pr/friendly-fallback-greeting is ready.", "green"),
    ],
  },
  {
    title: "STEP 7 OF 10  •  BUILD THE APPROVED CHANGE",
    progress: 7,
    lines: [
      line("NEXT", "Ask Codex to implement only the approved specification.", "blue"),
      line("SAFE", "It cannot test, commit, push, open a PR, or merge.", "yellow", { gapAfter: 30 }),
      line("DONE", "Two local files changed.", "green"),
      line("DONE", "Nothing has been verified, committed, or published yet.", "green"),
    ],
  },
  {
    title: "STEP 8 OF 10  •  CHECK THE WORK",
    progress: 8,
    lines: [
      line("NEXT", "Run only the checks this project declares safe.", "blue"),
      line("WHY", "Use evidence to catch mistakes and protect existing behavior.", "purple", { gapAfter: 30 }),
      line("YOU", "Run the project's trusted checks?  verify", "yellow"),
      line("DONE", "7 tests passed  •  0 failed", "green"),
    ],
  },
  {
    title: "STEP 9 OF 10  •  REVIEW THE EVIDENCE",
    progress: 9,
    lines: [
      line("NEXT", "Compare the real changes with every success criterion.", "blue"),
      line("SAFE", "Review is read-only; it cannot publish or approve work.", "yellow", { gapAfter: 30 }),
      line("DONE", "Missing-name greeting: passed", "green"),
      line("DONE", "Named greeting unchanged: passed", "green"),
      line("DONE", "Full test suite: passed", "green"),
      line("DONE", "Implementation evaluation: 10/10", "green"),
    ],
  },
  {
    title: "STEP 10 OF 10  •  SAVE THE REVIEWED CHANGE",
    progress: 10,
    lines: [
      line("NEXT", "Decide whether to create a commit.", "blue", { gapAfter: 30 }),
      line("", "A commit is a named snapshot on this separate branch."),
      line("", "It remains local and sends nothing to GitHub.", "text", { gapAfter: 30 }),
      line("YOU", "Commit or stop?  commit", "yellow"),
      line("DONE", "Reviewed changes committed.", "green"),
    ],
  },
  {
    title: "STEP 10 OF 10  •  SHARE FOR REVIEW",
    progress: 10,
    lines: [
      line("NEXT", "Decide whether to push the branch to GitHub.", "blue"),
      line("SAFE", "Main stays unchanged; no pull request or merge yet.", "yellow"),
      line("YOU", "Push or stop?  push", "yellow", { gapAfter: 30 }),
      line("NEXT", "Decide whether to open a pull request.", "blue"),
      line("", "A pull request presents the change for human review."),
      line("YOU", "Open pull request or stop?  pull request", "yellow"),
    ],
  },
  {
    title: "STEP 10 COMPLETE",
    progress: 10,
    lines: [
      line("DONE", "Pull request opened:", "green"),
      line("", "github.com/vworld26/product-to-pr-demo/pull/2", "text", { indent: 72, gapAfter: 30 }),
      line("", "Product-to-PR stopped before merge."),
      line("", "The repository maintainer owns the final review and decision."),
    ],
  },
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderLine(item, y) {
  const labelX = 138;
  const textX = item.label ? 330 : 138 + (item.indent ?? 0);
  const label = item.label
    ? `<text x="${labelX}" y="${y}" class="body" fill="${colors[item.color]}">${escapeXml(item.label)}</text>`
    : "";
  const body = `<text x="${textX}" y="${y}" class="body" fill="${colors[item.color]}">${escapeXml(item.text)}</text>`;
  return `${label}${body}`;
}

function renderSlide(slide, index) {
  let y = 260;
  const body = slide.lines
    .map((item) => {
      const rendered = renderLine(item, y);
      y += 50 + (item.gapAfter ?? 0);
      return rendered;
    })
    .join("\n");

  const dots = Array.from({ length: 10 }, (_, dotIndex) => {
    const fill = dotIndex < slide.progress ? colors.green : colors.border;
    return `<circle cx="${1240 + dotIndex * 54}" cy="164" r="9" fill="${fill}"/>`;
  }).join("\n");

  const counter = `${String(index + 1).padStart(2, "0")}/${String(slides.length).padStart(2, "0")}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: ${fontFamily}; font-weight: 400; }
    .top { font-size: 29px; letter-spacing: 0.5px; }
    .window-title { font-size: 23px; letter-spacing: 2px; }
    .body { font-size: 34px; }
    .footer { font-size: 22px; letter-spacing: 1.5px; }
  </style>
  <rect width="${width}" height="${height}" fill="${colors.background}"/>
  <text x="105" y="82" class="top" fill="${colors.text}">PRODUCT</text>
  <text x="256" y="82" class="top" fill="${colors.green}">→</text>
  <text x="306" y="82" class="top" fill="${colors.text}">PR</text>
  <text x="1800" y="82" text-anchor="end" class="top" fill="${colors.muted}">${counter}</text>
  <rect x="84" y="124" width="1752" height="860" rx="22" fill="${colors.panel}" stroke="${colors.border}" stroke-width="2"/>
  <circle cx="134" cy="166" r="11" fill="${colors.red}"/>
  <circle cx="173" cy="166" r="11" fill="${colors.yellow}"/>
  <circle cx="212" cy="166" r="11" fill="${colors.green}"/>
  <text x="248" y="174" class="window-title" fill="${colors.muted}">${escapeXml(slide.title)}</text>
  ${dots}
  ${body}
  <text x="105" y="1043" class="footer" fill="${colors.muted}">Real Guide me run  •  pauses shortened  •  no merge</text>
</svg>`;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..");
const outputDir = join(repositoryRoot, "docs", "media");
const workDir = mkdtempSync(join(tmpdir(), "product-to-pr-guided-demo-"));
const svgRenderer = join(scriptDir, "svg-to-png.swift");

try {
  const concatLines = [];
  slides.forEach((slide, index) => {
    const basename = `slide-${String(index + 1).padStart(2, "0")}`;
    const svgPath = join(workDir, `${basename}.svg`);
    const pngPath = join(workDir, `${basename}.png`);
    writeFileSync(svgPath, renderSlide(slide, index));
    execFileSync(
      "swift",
      [svgRenderer, svgPath, pngPath, String(width), String(height)],
      { stdio: "ignore" },
    );
    concatLines.push(`file '${pngPath.replaceAll("'", "'\\''")}'`);
    concatLines.push(`duration ${slideSeconds}`);
  });

  const finalPng = join(workDir, `slide-${String(slides.length).padStart(2, "0")}.png`);
  concatLines.push(`file '${finalPng.replaceAll("'", "'\\''")}'`);
  const concatPath = join(workDir, "slides.txt");
  writeFileSync(concatPath, `${concatLines.join("\n")}\n`);

  const mp4Path = join(workDir, "product-to-pr-demo.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-vf",
      "fps=30,format=yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      mp4Path,
    ],
    { stdio: "ignore" },
  );

  const palettePath = join(workDir, "palette.png");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      mp4Path,
      "-vf",
      "fps=2,scale=1920:1080:flags=lanczos,palettegen=max_colors=96:stats_mode=diff",
      palettePath,
    ],
    { stdio: "ignore" },
  );

  const gifPath = join(workDir, "product-to-pr-demo.gif");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      mp4Path,
      "-i",
      palettePath,
      "-lavfi",
      "fps=2,scale=1920:1080:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4",
      "-loop",
      "0",
      gifPath,
    ],
    { stdio: "ignore" },
  );

  cpSync(mp4Path, join(outputDir, "product-to-pr-demo.mp4"));
  cpSync(gifPath, join(outputDir, "product-to-pr-demo.gif"));
  console.log(`Rendered ${slides.length} slides at ${width}x${height}.`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
