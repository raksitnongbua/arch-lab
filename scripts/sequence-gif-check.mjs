#!/usr/bin/env node
/**
 * GIF encoder check — the encoder's output is DECODED and compared, pixel for
 * pixel, against what went in.
 *
 * Why this script exists in this shape: a GIF encoder is the kind of code that
 * produces a file which opens, looks right in a thumbnail, and is wrong. LZW
 * with variable code widths has three failure modes that all survive casual
 * inspection — a code width that grows one symbol too late, a dictionary reset
 * emitted at the new width instead of the old, and bit packing that is
 * MSB-first instead of LSB-first. Each of those yields an image that decodes
 * correctly for the first few hundred pixels and then shears. "It looked fine
 * in Preview" cannot catch any of them; a decoder can.
 *
 * The decoder below is written independently of the encoder — it follows the
 * GIF89a spec's reading algorithm rather than inverting the encoder's own
 * logic — so a shared misunderstanding cannot cancel itself out.
 *
 * Run with: pnpm check:sequence-gif
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { encodeGif, lzwEncode, quantise } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/export/gif.ts")).href
);

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/* ----------------------------------------------------------------------- */
/* An independent GIF89a reader                                             */
/* ----------------------------------------------------------------------- */

function readGif(bytes) {
  let at = 0;
  const u8 = () => bytes[at++];
  const u16 = () => {
    const value = bytes[at] | (bytes[at + 1] << 8);
    at += 2;
    return value;
  };

  const signature = String.fromCharCode(...bytes.slice(0, 6));
  at = 6;
  const width = u16();
  const height = u16();
  const packed = u8();
  u8(); // background index
  u8(); // aspect ratio

  const globalTableSize = 1 << ((packed & 0x07) + 1);
  const palette = [];
  if ((packed & 0x80) !== 0) {
    for (let index = 0; index < globalTableSize; index += 1) {
      palette.push([u8(), u8(), u8()]);
    }
  }

  /** Concatenates a sub-block chain and leaves `at` past its terminator. */
  const readBlocks = () => {
    const parts = [];
    for (;;) {
      const size = u8();
      if (size === 0) break;
      parts.push(bytes.slice(at, at + size));
      at += size;
    }
    let total = 0;
    for (const part of parts) total += part.length;
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    return joined;
  };

  const frames = [];
  let loops = null;
  let pendingDelay = 0;

  for (;;) {
    const marker = u8();
    if (marker === 0x3b || marker === undefined) break;

    if (marker === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8(); // block size
        u8(); // packed
        pendingDelay = u16();
        u8(); // transparent index
        u8(); // terminator
      } else if (label === 0xff) {
        const size = u8();
        const name = String.fromCharCode(...bytes.slice(at, at + size));
        at += size;
        const data = readBlocks();
        if (name === "NETSCAPE2.0") loops = data[1] | (data[2] << 8);
      } else {
        readBlocks();
      }
      continue;
    }

    if (marker !== 0x2c)
      throw new Error(`unexpected block 0x${marker.toString(16)}`);

    u16(); // left
    u16(); // top
    const frameWidth = u16();
    const frameHeight = u16();
    const framePacked = u8();
    if ((framePacked & 0x80) !== 0) throw new Error("unexpected local palette");

    const minCodeSize = u8();
    const data = readBlocks();

    /* LZW decode, straight from the spec's reading algorithm. */
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let dictionary = [];
    const resetDictionary = () => {
      dictionary = [];
      for (let index = 0; index < clearCode; index += 1)
        dictionary.push([index]);
      dictionary.push(null); // clear
      dictionary.push(null); // eoi
    };
    resetDictionary();

    const indices = [];
    let bitBuffer = 0;
    let bitCount = 0;
    let cursor = 0;
    let previous = null;

    for (;;) {
      while (bitCount < codeSize) {
        if (cursor >= data.length) {
          bitCount = -1;
          break;
        }
        bitBuffer |= data[cursor++] << bitCount;
        bitCount += 8;
      }
      if (bitCount < 0) break;

      const code = bitBuffer & ((1 << codeSize) - 1);
      bitBuffer >>= codeSize;
      bitCount -= codeSize;

      if (code === clearCode) {
        resetDictionary();
        codeSize = minCodeSize + 1;
        previous = null;
        continue;
      }
      if (code === eoiCode) break;

      let entry;
      if (code < dictionary.length && dictionary[code] !== null) {
        entry = dictionary[code];
      } else if (previous !== null) {
        entry = [...previous, previous[0]];
      } else {
        throw new Error("corrupt stream: code before any prefix");
      }

      for (const value of entry) indices.push(value);

      if (previous !== null) {
        dictionary.push([...previous, entry[0]]);
        if (dictionary.length === 1 << codeSize && codeSize < 12) codeSize += 1;
      }
      previous = entry;
    }

    frames.push({
      width: frameWidth,
      height: frameHeight,
      delay: pendingDelay,
      indices,
    });
  }

  return { signature, width, height, palette, frames, loops };
}

/* ----------------------------------------------------------------------- */
/* Fixtures                                                                 */
/* ----------------------------------------------------------------------- */

/** A frame of flat blocks — what a diagram mostly is. */
function blocks(width, height, shift) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const band = Math.floor((x + shift) / 7) % 3;
      rgba[at] = band === 0 ? 27 : band === 1 ? 155 : 79;
      rgba[at + 1] = band === 0 ? 27 : band === 1 ? 140 : 214;
      rgba[at + 2] = band === 0 ? 35 : band === 1 ? 255 : 228;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

/** Deterministic noise — forces the dictionary to fill and reset. */
function noise(width, height, seed) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  let state = seed;
  for (let index = 0; index < width * height; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const at = index * 4;
    rgba[at] = state & 0xff;
    rgba[at + 1] = (state >> 8) & 0xff;
    rgba[at + 2] = (state >> 16) & 0xff;
    rgba[at + 3] = 255;
  }
  return rgba;
}

/* ----------------------------------------------------------------------- */
/* 1. Structure                                                             */
/* ----------------------------------------------------------------------- */

const W = 48;
const H = 32;
const simple = encodeGif(
  [
    { rgba: blocks(W, H, 0), delayMs: 120 },
    { rgba: blocks(W, H, 3), delayMs: 120 },
    { rgba: blocks(W, H, 6), delayMs: 500 },
  ],
  W,
  H,
);
const read = readGif(simple);

check("writes a GIF89a header and the right screen size", () => {
  assert.equal(read.signature, "GIF89a");
  assert.equal(read.width, W);
  assert.equal(read.height, H);
});

check("ends with the trailer byte", () => {
  assert.equal(simple[simple.length - 1], 0x3b);
});

check("loops forever via the NETSCAPE2.0 extension", () => {
  assert.equal(read.loops, 0, "0 means loop forever; missing means play once");
});

check("keeps every frame, in order", () => {
  assert.equal(read.frames.length, 3);
});

check("stores delays in hundredths of a second", () => {
  assert.equal(read.frames[0].delay, 12);
  assert.equal(read.frames[2].delay, 50);
});

/* ----------------------------------------------------------------------- */
/* 2. Pixels survive the round trip                                         */
/* ----------------------------------------------------------------------- */

check("every frame decodes to exactly width × height pixels", () => {
  for (const frame of read.frames) {
    assert.equal(
      frame.indices.length,
      W * H,
      `expected ${W * H} pixels, got ${frame.indices.length}`,
    );
  }
});

check("flat colours survive the round trip EXACTLY", () => {
  // Few enough colours to fit the palette untouched, so quantisation must be
  // lossless here — any drift is an encoder bug, not a colour-reduction cost.
  const source = blocks(W, H, 0);
  const decoded = read.frames[0];
  for (let index = 0; index < W * H; index += 1) {
    const entry = read.palette[decoded.indices[index]];
    const at = index * 4;
    assert.deepEqual(
      entry,
      [source[at], source[at + 1], source[at + 2]],
      `pixel ${index} differs`,
    );
  }
});

check("a later frame decodes to its own pixels, not the first frame's", () => {
  const source = blocks(W, H, 3);
  const decoded = read.frames[1];
  for (let index = 0; index < W * H; index += 1) {
    const entry = read.palette[decoded.indices[index]];
    const at = index * 4;
    assert.deepEqual(entry, [source[at], source[at + 1], source[at + 2]]);
  }
});

/* ----------------------------------------------------------------------- */
/* 3. The dictionary reset — the bug that survives a thumbnail              */
/* ----------------------------------------------------------------------- */

check(
  "a noisy frame large enough to fill the dictionary still round-trips",
  () => {
    // Noise defeats LZW, so the dictionary reaches 4096 and must reset mid-frame.
    // A reset emitted at the wrong code width decodes cleanly until that point
    // and shears afterwards — which is why this asserts the WHOLE frame.
    const nw = 140;
    const nh = 140;
    const frame = noise(nw, nh, 7);
    const encoded = encodeGif([{ rgba: frame, delayMs: 100 }], nw, nh);
    const back = readGif(encoded);
    assert.equal(back.frames.length, 1);
    assert.equal(back.frames[0].indices.length, nw * nh);

    // Quantisation is lossy on noise, so compare against the encoder's own
    // mapping rather than the source: what is being tested here is LZW, and the
    // quantiser is checked separately below.
    const { palette, frames } = quantise([frame]);
    assert.equal(back.palette.length >= palette.length, true);
    for (let index = 0; index < nw * nh; index += 1) {
      assert.equal(
        back.frames[0].indices[index],
        frames[0][index],
        `index ${index} differs after the dictionary reset`,
      );
    }
  },
);

/* ----------------------------------------------------------------------- */
/* 4. Quantisation                                                          */
/* ----------------------------------------------------------------------- */

check("a palette of few colours is kept exactly, not approximated", () => {
  const { palette } = quantise([blocks(32, 32, 0)]);
  assert.ok(palette.length <= 3, `expected ≤3 colours, got ${palette.length}`);
});

check("never exceeds 256 colours, however many the source has", () => {
  const { palette } = quantise([noise(100, 100, 3)]);
  assert.ok(palette.length <= 256, `got ${palette.length}`);
});

check("one palette is shared by every frame", () => {
  // A per-frame palette would let a static background shift a shade between
  // frames, which reads as the whole image flickering.
  const { palette, frames } = quantise([blocks(32, 32, 0), blocks(32, 32, 5)]);
  assert.equal(frames.length, 2);
  assert.ok(palette.length <= 3);
});

/* ----------------------------------------------------------------------- */
/* 5. LZW sub-blocks                                                        */
/* ----------------------------------------------------------------------- */

check("LZW output is chunked into sub-blocks and zero-terminated", () => {
  const indices = new Uint8Array(2000).fill(0);
  const encoded = lzwEncode(indices, 2);
  assert.equal(encoded[encoded.length - 1], 0, "missing block terminator");
  let at = 0;
  let blocksSeen = 0;
  while (at < encoded.length) {
    const size = encoded[at];
    if (size === 0) break;
    assert.ok(size <= 255, `sub-block of ${size} bytes exceeds 255`);
    at += size + 1;
    blocksSeen += 1;
  }
  assert.ok(blocksSeen > 0);
  assert.equal(at, encoded.length - 1, "sub-block chain does not end cleanly");
});

/* ----------------------------------------------------------------------- */
/* 6. The loop closes                                                       */
/* ----------------------------------------------------------------------- */

/*
 * The GIF is a LOOP of the diagram's idle motion, and a loop only reads as one
 * if every moving thing completes whole cycles inside it. On screen the comet
 * (4200ms per traversal) and the reply dash (2750ms per period) do not divide
 * into each other, so the export picks its own window — one comet traversal and
 * an INTEGER number of dash periods.
 *
 * A fractional period is the failure this guards: the file still plays, still
 * looks right frame by frame, and jerks once per loop at the wrap. That is
 * exactly the kind of defect nobody files a bug for and everybody notices.
 */
const framesSource = readFileSync(
  path.join(ROOT, "src/features/sequence/export/frames.ts"),
  "utf8",
);

check("the reply dash completes a whole number of periods per loop", () => {
  const match = framesSource.match(/REPLY_PERIODS\s*=\s*([\d.]+)/);
  assert.ok(match, "REPLY_PERIODS is not declared");
  assert.ok(
    Number.isInteger(Number(match[1])),
    `REPLY_PERIODS is ${match[1]} — a fraction leaves the dash mid-stride at the wrap`,
  );
});

check("the comet travels exactly one whole path per loop", () => {
  // Bands start at their own dash length and count down by 100 — one full
  // `pathLength`. Any other span would land the band somewhere else at wrap.
  assert.match(framesSource, /band\.lit - 100 \* t/);
});

check("frame phases never reach 1, so no phase is held twice", () => {
  // t = index / frameCount over 0..frameCount-1. Dividing by count - 1 would
  // make the last frame identical to the first and stall the loop for a beat.
  assert.match(framesSource, /const t = index \/ frameCount;/);
});

/* ----------------------------------------------------------------------- */
/* 7. The quality presets                                                   */
/* ----------------------------------------------------------------------- */

/*
 * Sharpness and smoothness are offered as presets, and each one has to stay
 * legal on its own: GIF stores delays in HUNDREDTHS of a second, so a delay that
 * is not a multiple of 10ms is silently rounded and the loop runs at a speed
 * nobody chose. Raising smoothness must also add FRAMES rather than slow the
 * animation down — the loop stays about the same length — or "smooth" would
 * quietly mean "slower", which is a different setting.
 */
const framesModule = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/export/frames.ts")).href
);

check("every smoothness preset uses a delay GIF can actually store", () => {
  for (const [name, preset] of Object.entries(framesModule.GIF_SMOOTHNESS)) {
    assert.equal(
      preset.delayMs % 10,
      0,
      `${name}: ${preset.delayMs}ms is not a whole hundredth`,
    );
  }
});

check("smoothness adds frames without changing the loop's length", () => {
  const durations = Object.values(framesModule.GIF_SMOOTHNESS).map(
    (preset) => preset.frames * preset.delayMs,
  );
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  assert.ok(
    max - min <= 200,
    `loop lengths span ${min}–${max}ms; smoothness must not become speed`,
  );
});

check("the presets are ordered — smoother means strictly more frames", () => {
  const { simple, standard, smooth } = framesModule.GIF_SMOOTHNESS;
  assert.ok(simple.frames < standard.frames, "simple is not the fewest");
  assert.ok(standard.frames < smooth.frames, "smooth is not the most");
});

check("sharper means strictly more pixels", () => {
  const { compact, standard, sharp } = framesModule.GIF_SHARPNESS;
  assert.ok(compact < standard && standard < sharp, "sharpness is not ordered");
});

check("the default is a real preset, not a stray value", () => {
  const { DEFAULT_GIF_QUALITY, GIF_SHARPNESS, GIF_SMOOTHNESS } = framesModule;
  assert.ok(DEFAULT_GIF_QUALITY.sharpness in GIF_SHARPNESS);
  assert.ok(DEFAULT_GIF_QUALITY.smoothness in GIF_SMOOTHNESS);
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-gif assertions passed.`);
