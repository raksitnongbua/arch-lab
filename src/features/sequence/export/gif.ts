/**
 * A GIF89a encoder, hand-rolled.
 *
 * WHY NOT A DEPENDENCY. The same reason `viewer/export/zip.ts` writes ZIP
 * archives by hand and `download.ts` rasterises PNG through a canvas: this app
 * ships no runtime dependency it can write itself in a few hundred lines, and a
 * GIF encoder is one of those. The format is frozen, it is small, and the whole
 * surface used here — global palette, looping extension, per-frame LZW — is
 * specified in GIF89a and has not changed since 1989.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No inter-frame differencing, no local
 * palettes, no transparency. Every frame is a full image over one global
 * palette, which costs bytes and buys correctness: the delta encoders that
 * shrink real-world GIFs need a disposal-method state machine, and getting that
 * subtly wrong produces the smeared-ghost artefacts everyone has seen. A
 * sequence diagram is flat vector art on a solid ground — a handful of colours,
 * mostly unchanged between frames — so LZW alone compresses it well.
 *
 * The two pieces below are the only parts with any real difficulty:
 *
 *   QUANTISATION. GIF allows 256 colours. Anti-aliased vector art blows past
 *   that on edge pixels alone, so a median cut reduces the histogram — chosen
 *   over a fixed web palette because the diagram's colours are lane hues and
 *   theme tokens, and a generic palette would band exactly the strokes the
 *   reader is looking at.
 *
 *   LZW. Variable-width codes, LSB-first bit packing, and a dictionary reset at
 *   4096 — the one place a subtly wrong encoder still produces a file that
 *   opens, then falls apart on a long frame. `check:sequence-gif` decodes what
 *   this writes and compares pixels, because "it looked fine in Preview" is not
 *   a test.
 */

/* -------------------------------------------------------------------------- */
/* Bytes                                                                       */
/* -------------------------------------------------------------------------- */

class ByteWriter {
  private bytes: number[] = [];

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  /** GIF integers are little-endian. */
  short(value: number): void {
    this.byte(value);
    this.byte(value >> 8);
  }

  ascii(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      this.byte(text.charCodeAt(index));
    }
  }

  raw(values: readonly number[] | Uint8Array): void {
    for (const value of values) this.byte(value);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/* -------------------------------------------------------------------------- */
/* Quantisation                                                                */
/* -------------------------------------------------------------------------- */

export interface Quantised {
  /** One palette index per pixel. */
  indices: Uint8Array;
  /** RGB triples, at most 256 entries. */
  palette: number[][];
}

interface Bucket {
  colors: number[][];
}

/** The channel with the widest spread — the axis a median cut should split. */
function widestChannel(colors: number[][]): number {
  let widest = 0;
  let widestRange = -1;
  for (let channel = 0; channel < 3; channel += 1) {
    let min = 255;
    let max = 0;
    for (const color of colors) {
      const value = color[channel] as number;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min > widestRange) {
      widestRange = max - min;
      widest = channel;
    }
  }
  return widest;
}

/**
 * Median cut to at most `limit` colours.
 *
 * Buckets are split by their WIDEST channel rather than a fixed axis order,
 * which is what keeps a diagram's few saturated lane hues from being merged
 * into one another while a hundred near-identical anti-aliasing greys survive.
 */
function medianCut(unique: number[][], limit: number): number[][] {
  if (unique.length <= limit) return unique;

  let buckets: Bucket[] = [{ colors: unique }];
  while (buckets.length < limit) {
    // Split the bucket with the most colours in it; splitting an already-tight
    // bucket wastes a palette slot the crowded one needs.
    let target = -1;
    let most = 1;
    for (let index = 0; index < buckets.length; index += 1) {
      const size = (buckets[index] as Bucket).colors.length;
      if (size > most) {
        most = size;
        target = index;
      }
    }
    if (target < 0) break;

    const bucket = buckets[target] as Bucket;
    const channel = widestChannel(bucket.colors);
    const sorted = [...bucket.colors].sort(
      (a, b) => (a[channel] as number) - (b[channel] as number),
    );
    const middle = sorted.length >> 1;
    buckets = [
      ...buckets.slice(0, target),
      { colors: sorted.slice(0, middle) },
      { colors: sorted.slice(middle) },
      ...buckets.slice(target + 1),
    ];
  }

  return buckets.map((bucket) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const color of bucket.colors) {
      r += color[0] as number;
      g += color[1] as number;
      b += color[2] as number;
    }
    const size = Math.max(1, bucket.colors.length);
    return [Math.round(r / size), Math.round(g / size), Math.round(b / size)];
  });
}

/**
 * Builds ONE palette for every frame and maps all of them through it.
 *
 * Shared rather than per-frame because a local colour table per frame would
 * make each frame's colours drift a shade as the histogram changes — on a
 * static background that reads as the whole image flickering, which is exactly
 * the artefact that makes hand-rolled GIFs look broken.
 */
export function quantise(
  frames: readonly Uint8ClampedArray[],
  limit = 256,
): { palette: number[][]; frames: Uint8Array[] } {
  /*
   * 5 bits per channel — enough to keep the lane hues apart, and a key space of
   * exactly 32768, which is why these are typed arrays rather than Maps. A
   * full-page GIF is ten million pixels across its frames, and a Map lookup per
   * pixel here and again in `nearest` below was thirty million hash operations
   * on the main thread: the tab froze for the better part of a minute and the
   * export looked like it had done nothing at all. An array index over the same
   * key is the same algorithm at a fraction of the cost.
   */
  const seen = new Uint8Array(32768);
  const unique: number[][] = [];
  for (const rgba of frames) {
    for (let index = 0; index < rgba.length; index += 4) {
      const r = rgba[index] as number;
      const g = rgba[index + 1] as number;
      const b = rgba[index + 2] as number;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (seen[key] === 0) {
        seen[key] = 1;
        unique.push([r, g, b]);
      }
    }
  }

  const palette = medianCut(unique, limit);
  if (palette.length === 0) palette.push([0, 0, 0]);

  // Nearest-colour cache over the same 15-bit bucket. -1 means "not computed";
  // an Int16Array holds every palette index (max 255) and is indexed directly.
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key] as number;
    if (hit >= 0) return hit;
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const entry = palette[index] as number[];
      const dr = r - (entry[0] as number);
      const dg = g - (entry[1] as number);
      const db = b - (entry[2] as number);
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    cache[key] = best;
    return best;
  };

  const mapped = frames.map((rgba) => {
    const indices = new Uint8Array(rgba.length / 4);
    for (let index = 0; index < indices.length; index += 1) {
      const at = index * 4;
      indices[index] = nearest(
        rgba[at] as number,
        rgba[at + 1] as number,
        rgba[at + 2] as number,
      );
    }
    return indices;
  });

  return { palette, frames: mapped };
}

/* -------------------------------------------------------------------------- */
/* LZW                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * GIF's LZW variant: codes start one bit wider than the palette depth, grow as
 * the dictionary fills, and reset at 4096. Bits pack LSB-first, and the result
 * is chunked into sub-blocks of at most 255 bytes.
 */
export function lzwEncode(
  indices: Uint8Array,
  minCodeSize: number,
): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  /*
   * The dictionary as a flat table rather than a Map, for the same reason as
   * the quantiser above: this runs once per PIXEL. The key packs a prefix code
   * (< 4096) with a symbol byte, so the space is 2^20 — one allocation, and 0
   * safely means "empty" because dictionary values always start above the
   * end-of-information code and can never be 0.
   */
  const dictionary = new Int32Array(1 << 20);

  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);

  if (indices.length > 0) {
    let current = indices[0] as number;
    for (let index = 1; index < indices.length; index += 1) {
      const next = indices[index] as number;
      // Key packs (prefix, symbol); symbols are bytes, prefixes < 4096.
      const key = (current << 8) | next;
      const found = dictionary[key] as number;
      if (found !== 0) {
        current = found;
        continue;
      }
      emit(current);
      if (nextCode === 4096) {
        // Full: tell the decoder to reset, then start over. The clear MUST be
        // emitted at the OLD code size — the decoder is still reading at that
        // width when it arrives.
        emit(clearCode);
        dictionary.fill(0);
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      } else {
        dictionary[key] = nextCode;
        nextCode += 1;
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize += 1;
      }
      current = next;
    }
    emit(current);
  }

  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  // Sub-blocks: one length byte, up to 255 data bytes, terminated by a zero.
  const blocked = new ByteWriter();
  for (let index = 0; index < out.length; index += 255) {
    const chunk = out.slice(index, index + 255);
    blocked.byte(chunk.length);
    blocked.raw(chunk);
  }
  blocked.byte(0);
  return blocked.toUint8Array();
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

export interface GifFrame {
  /** RGBA pixels, `width * height * 4`. */
  rgba: Uint8ClampedArray;
  /** How long this frame is shown, in milliseconds. */
  delayMs: number;
}

/**
 * Encodes frames into a looping GIF89a.
 *
 * Delays are stored in HUNDREDTHS of a second, which is the format's unit and
 * the reason GIF timing is coarse: a 30ms delay rounds to 3 and a 25ms delay
 * rounds to 2, so callers should choose delays that are multiples of 10ms
 * rather than expect the file to honour arbitrary ones.
 */
export function encodeGif(
  frames: readonly GifFrame[],
  width: number,
  height: number,
): Uint8Array {
  if (frames.length === 0) throw new Error("A GIF needs at least one frame.");

  const { palette, frames: indexed } = quantise(frames.map((f) => f.rgba));

  // The colour table is a power of two, at least 2 entries; unused slots are
  // black. `depth` is what both the table size and the LZW width derive from.
  let depth = 1;
  while (1 << depth < palette.length) depth += 1;
  const tableSize = 1 << depth;

  const gif = new ByteWriter();
  gif.ascii("GIF89a");

  // Logical screen descriptor.
  gif.short(width);
  gif.short(height);
  // Packed: global colour table present, colour resolution 7, not sorted, size.
  gif.byte(0x80 | 0x70 | (depth - 1));
  gif.byte(0); // background colour index
  gif.byte(0); // pixel aspect ratio: none

  for (let index = 0; index < tableSize; index += 1) {
    const entry = palette[index] ?? [0, 0, 0];
    gif.byte(entry[0] as number);
    gif.byte(entry[1] as number);
    gif.byte(entry[2] as number);
  }

  // NETSCAPE2.0 looping extension. Not part of GIF89a proper — it is a de facto
  // standard every viewer honours, and without it the animation plays once.
  gif.byte(0x21);
  gif.byte(0xff);
  gif.byte(11);
  gif.ascii("NETSCAPE2.0");
  gif.byte(3);
  gif.byte(1);
  gif.short(0); // 0 = loop forever
  gif.byte(0);

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index] as GifFrame;

    // Graphic control extension: disposal 1 (leave in place) is right because
    // every frame is a full image — nothing needs restoring underneath.
    gif.byte(0x21);
    gif.byte(0xf9);
    gif.byte(4);
    gif.byte(0x04);
    gif.short(Math.max(1, Math.round(frame.delayMs / 10)));
    gif.byte(0); // transparent colour index (unused; flag above is off)
    gif.byte(0);

    // Image descriptor: full frame, no local colour table, not interlaced.
    gif.byte(0x2c);
    gif.short(0);
    gif.short(0);
    gif.short(width);
    gif.short(height);
    gif.byte(0);

    // LZW minimum code size is at least 2, even for a 2-colour image.
    const minCodeSize = Math.max(2, depth);
    gif.byte(minCodeSize);
    gif.raw(lzwEncode(indexed[index] as Uint8Array, minCodeSize));
  }

  gif.byte(0x3b); // trailer
  return gif.toUint8Array();
}
