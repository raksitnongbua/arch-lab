/**
 * A minimal ZIP writer — enough to hand back one file when the reader asked
 * for every diagram in the model.
 *
 * Why hand-rolled rather than a dependency: this is the third time this
 * feature area has faced that choice and answered the same way. `render-svg.ts`
 * draws the diagram itself rather than screenshotting the DOM; `download.ts`
 * rasterises PNG through a canvas rather than pulling in an encoder. A ZIP
 * container with no compression is a documented, stable, forty-year-old byte
 * layout that takes one CRC table and three record writers, and the
 * alternative was shipping a general-purpose archiver to a browser bundle for
 * the sake of five SVG files.
 *
 * STORED, never DEFLATEd. The payloads are SVG text (which the browser will
 * gzip over the wire anyway if it ever travels) or already-compressed PNG,
 * where a second pass buys nothing. Store mode also means no bit-level
 * encoder: every field below is a plain little-endian integer, so the whole
 * format is auditable by reading it.
 *
 * Deliberately NOT implemented, because nothing here needs it: Zip64 (an
 * archive of diagrams will not pass 4GB), encryption, data descriptors,
 * multi-disk archives, and directory entries — paths with slashes are enough
 * for every unzip tool to create folders on extraction.
 */

/* -------------------------------------------------------------------------- */
/* CRC-32                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Standard CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320) table, built
 * once on first use. ZIP requires the checksum in the local header BEFORE the
 * data, which is why every entry's bytes are materialised up front rather than
 * streamed.
 */
let crcTable: Uint32Array | null = null;

function crc32Table(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Little-endian writing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A byte array that definitely owns a plain `ArrayBuffer`, not a
 * `SharedArrayBuffer`. `Uint8Array` became generic in its backing buffer, and
 * only the non-shared form is a valid `BlobPart` — spelling it out here keeps
 * that constraint at the one boundary that cares.
 */
type Bytes = Uint8Array<ArrayBuffer>;

/** Grow-as-you-go little-endian byte sink. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  bytes(value: Uint8Array): void {
    this.chunks.push(value);
    this.length += value.length;
  }

  u16(value: number): void {
    this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.bytes(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  get offset(): number {
    return this.length;
  }

  finish(): Bytes {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}

/**
 * MS-DOS packed date and time, which is the only timestamp ZIP's base format
 * carries. Two-second resolution and a 1980 epoch — both are the format's,
 * not ours. Anything before 1980 is clamped rather than allowed to wrap into a
 * nonsense date.
 */
function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    date:
      (((year - 1980) & 0x7f) << 9) |
      (((when.getMonth() + 1) & 0x0f) << 5) |
      (when.getDate() & 0x1f),
    time:
      ((when.getHours() & 0x1f) << 11) |
      ((when.getMinutes() & 0x3f) << 5) |
      ((when.getSeconds() >> 1) & 0x1f),
  };
}

/* -------------------------------------------------------------------------- */
/* The archive                                                                 */
/* -------------------------------------------------------------------------- */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes make folders on extraction. */
  name: string;
  /** File contents. Text callers should encode as UTF-8 first. */
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Store method (no compression) — see the module comment. */
const METHOD_STORE = 0;

/** Version 2.0, the floor for anything a modern unzip will read without complaint. */
const VERSION = 20;

/**
 * Bit 11 of the general-purpose flags: the file name is UTF-8. Set
 * unconditionally, because diagram titles are user text and a model called
 * "Zahlungsdienst — Container" must not arrive with a mangled filename.
 */
const FLAG_UTF8 = 0x0800;

/**
 * Packs `entries` into a ZIP archive.
 *
 * Entry order is preserved, which is the point when the caller has already
 * sorted the diagrams into drill order: an unzip listing then reads root-first
 * exactly like the model does.
 */
export function createZip(entries: readonly ZipEntry[], when: Date): Blob {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(when);

  const body = new ByteWriter();
  const directory = new ByteWriter();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const offset = body.offset;

    // Local file header, immediately followed by the stored bytes.
    body.u32(LOCAL_HEADER);
    body.u16(VERSION);
    body.u16(FLAG_UTF8);
    body.u16(METHOD_STORE);
    body.u16(time);
    body.u16(date);
    body.u32(checksum);
    body.u32(entry.data.length); // compressed == uncompressed under STORE
    body.u32(entry.data.length);
    body.u16(name.length);
    body.u16(0); // no extra field
    body.bytes(name);
    body.bytes(entry.data);

    // Central directory record — the index an unzip tool actually reads.
    directory.u32(CENTRAL_HEADER);
    directory.u16(VERSION); // version made by
    directory.u16(VERSION); // version needed to extract
    directory.u16(FLAG_UTF8);
    directory.u16(METHOD_STORE);
    directory.u16(time);
    directory.u16(date);
    directory.u32(checksum);
    directory.u32(entry.data.length);
    directory.u32(entry.data.length);
    directory.u16(name.length);
    directory.u16(0); // extra
    directory.u16(0); // comment
    directory.u16(0); // disk number
    directory.u16(0); // internal attributes
    directory.u32(0); // external attributes
    directory.u32(offset);
    directory.bytes(name);
  }

  const directoryBytes = directory.finish();
  const bodyBytes = body.finish();

  const end = new ByteWriter();
  end.u32(END_OF_CENTRAL_DIRECTORY);
  end.u16(0); // this disk
  end.u16(0); // disk with the start of the central directory
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(directoryBytes.length);
  end.u32(bodyBytes.length); // central directory starts right after the body
  end.u16(0); // no archive comment

  return new Blob([bodyBytes, directoryBytes, end.finish()], {
    type: "application/zip",
  });
}
