#!/usr/bin/env node
/**
 * Multi-diagram export check: the "All views" archive must be a real ZIP that
 * a real unzip accepts, and its contents must be complete and in drill order.
 *
 * `export/zip.ts` is a hand-rolled ZIP writer, so it carries the burden any
 * hand-rolled binary format does: a wrong offset or a wrong CRC produces a
 * file that looks fine (it downloads, it has a size) and fails only when
 * somebody tries to open it, possibly weeks later. So this script parses the
 * container back byte by byte rather than trusting it, and then — when the
 * system has `unzip` — hands it to that as an independent second opinion.
 *
 * Loads the REAL modules through the same `registerHooks` resolver pattern as
 * `scripts/validate-samples-check.mjs`. What it proves:
 *
 *   1. `createZip` emits a well-formed archive: local header per entry at the
 *      offset the central directory claims, matching sizes, and a CRC-32 that
 *      recomputes over the stored bytes.
 *   2. Entry order and names survive, including non-ASCII names (the UTF-8
 *      flag) and a zero-byte entry.
 *   3. `unzip -t` agrees, if it is installed. If it is NOT, that is REPORTED,
 *      never passed over in silence — a skipped cross-check must not read like
 *      a green one.
 *   4. `diagramsInDrillOrder` returns the root first, then children depth
 *      first, and appends an unreachable diagram rather than dropping it.
 *   5. `archiveEntryName` keeps drill order sortable and disambiguates two
 *      diagrams that share a title.
 *
 * Exits non-zero on any failure. Run with: pnpm check:export-archive
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

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
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { createZip } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/export/zip.ts")).href
);
const { archiveEntryName, fileStem } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/export/download.ts")).href
);
const { diagramsInDrillOrder } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/lib/model.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let checks = 0;
const notes = [];

const ok = (message) => {
  checks += 1;
  console.log(`  ok  ${message}`);
};
const fail = (message, detail) => {
  checks += 1;
  failures += 1;
  console.error(`  FAIL  ${message}\n        ${detail}`);
};
const note = (message) => {
  notes.push(message);
  console.log(`  --  ${message}`);
};

/* ----------------------------------------------------------------------- */
/* An independent ZIP reader                                                */
/* ----------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let v = i;
    for (let b = 0; b < 8; b += 1) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[i] = v >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Reads an archive the way an unzip tool does — end record first, then the
 * central directory, then each local header at the offset the directory
 * claims. Deliberately NOT sharing code with the writer: a reader built from
 * the writer's own helpers would agree with its mistakes.
 */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: scan back for the signature.
  let end = -1;
  for (let at = bytes.length - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error("no end-of-central-directory record");

  const total = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);

  const entries = [];
  let at = directoryOffset;
  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error(`central record ${index} has a bad signature`);
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const uncompressed = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLength),
    );

    // Follow the offset into the body and read the local header + data.
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`"${name}" local header signature is wrong`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressed);

    entries.push({ name, flags, method, crc, compressed, uncompressed, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at - directoryOffset !== directorySize) {
    throw new Error(
      `central directory is ${at - directoryOffset} bytes, header says ${directorySize}`,
    );
  }
  return entries;
}

/* ----------------------------------------------------------------------- */
/* 1 + 2. The container round-trips                                         */
/* ----------------------------------------------------------------------- */

const encoder = new TextEncoder();
const SAMPLE = [
  { name: "01-context-root.svg", data: encoder.encode("<svg>context</svg>") },
  {
    name: "02-container-zahlungsdienst-übersicht.svg",
    data: encoder.encode("<svg>ümlaut</svg>"),
  },
  { name: "03-empty.svg", data: new Uint8Array(0) },
];

const archiveBytes = new Uint8Array(
  await createZip(SAMPLE, new Date("2026-03-04T05:06:08Z")).arrayBuffer(),
);

let parsed = null;
try {
  parsed = readZip(archiveBytes);
  ok(`createZip emits a readable archive (${archiveBytes.length} bytes)`);
} catch (error) {
  fail("createZip emits a readable archive", error.message);
}

if (parsed !== null) {
  const names = parsed.map((entry) => entry.name);
  const expected = SAMPLE.map((entry) => entry.name);
  if (names.join("|") === expected.join("|")) {
    ok("entry names and order survive, non-ASCII included");
  } else {
    fail(
      "entry names and order survive",
      `got ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`,
    );
  }

  let bad = null;
  for (const [index, entry] of parsed.entries()) {
    const source = SAMPLE[index];
    if (entry.method !== 0)
      bad = `${entry.name}: method ${entry.method}, expected 0 (store)`;
    else if ((entry.flags & 0x0800) === 0)
      bad = `${entry.name}: UTF-8 flag not set`;
    else if (entry.uncompressed !== source.data.length)
      bad = `${entry.name}: size ${entry.uncompressed}, expected ${source.data.length}`;
    else if (entry.crc !== crc32(source.data))
      bad = `${entry.name}: CRC ${entry.crc.toString(16)} does not match the payload`;
    else if (
      Buffer.compare(Buffer.from(entry.data), Buffer.from(source.data)) !== 0
    )
      bad = `${entry.name}: stored bytes differ from the input`;
    if (bad !== null) break;
  }
  if (bad === null)
    ok("every entry stores its exact bytes with a valid CRC-32");
  else fail("every entry stores its exact bytes with a valid CRC-32", bad);
}

/* ----------------------------------------------------------------------- */
/* 3. A real unzip agrees — or says loudly that it was not asked            */
/* ----------------------------------------------------------------------- */

{
  const label = "the system unzip accepts the archive";
  let unzipAvailable = true;
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    unzipAvailable = false;
  }

  if (!unzipAvailable) {
    note(
      `SKIPPED: ${label} — no \`unzip\` on this system. The byte-level checks above still ran; ` +
        `the independent cross-check did not.`,
    );
  } else {
    const dir = mkdtempSync(path.join(tmpdir(), "arch-lab-zip-"));
    const file = path.join(dir, "archive.zip");
    try {
      writeFileSync(file, archiveBytes);
      const output = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
      if (/No errors detected/.test(output)) ok(label);
      else fail(label, output.trim().split("\n").slice(-3).join(" / "));
    } catch (error) {
      fail(label, (error.stdout ?? error.message ?? "").toString().trim());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/* ----------------------------------------------------------------------- */
/* 4. Drill order                                                           */
/* ----------------------------------------------------------------------- */

{
  const diagram = (id, level, nodes) => ({
    id,
    level,
    title: id,
    ownerNodeId: null,
    parentDiagramId: null,
    nodes,
    edges: [],
  });
  const node = (id, childDiagramId) => ({
    id,
    type: "softwareSystem",
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 176, height: 88 },
    ...(childDiagramId === undefined ? {} : { childDiagramId }),
  });

  // Root has two children; the second child has one of its own; `d-orphan` is
  // in the file but nothing points at it.
  const model = {
    id: "test",
    title: "Test",
    description: "",
    rootDiagramId: "d-ctx",
    diagrams: {
      "d-ctx": diagram("d-ctx", "context", [
        node("a", "d-cnt-a"),
        node("b", "d-cnt-b"),
      ]),
      "d-cnt-a": diagram("d-cnt-a", "container", []),
      "d-cnt-b": diagram("d-cnt-b", "container", [node("c", "d-cmp-c")]),
      "d-cmp-c": diagram("d-cmp-c", "component", []),
      "d-orphan": diagram("d-orphan", "container", []),
    },
    file: { version: "1.0", metadata: {}, unknownFields: {} },
  };

  const order = diagramsInDrillOrder(model)
    .map((d) => d.id)
    .join(" ");
  const expected = "d-ctx d-cnt-a d-cnt-b d-cmp-c d-orphan";
  if (order === expected) {
    ok("diagramsInDrillOrder walks depth-first and appends the orphan last");
  } else {
    fail(
      "diagramsInDrillOrder walks depth-first and appends the orphan last",
      `got "${order}", expected "${expected}"`,
    );
  }

  // A cycle must not hang the walk. The model format cannot express one, but
  // an imported or hand-edited file can, and an export that never returns is a
  // worse failure than one that skips a diagram.
  const cyclic = {
    ...model,
    diagrams: {
      "d-ctx": diagram("d-ctx", "context", [node("a", "d-cnt-a")]),
      "d-cnt-a": diagram("d-cnt-a", "container", [node("back", "d-ctx")]),
    },
  };
  const cyclicOrder = diagramsInDrillOrder(cyclic)
    .map((d) => d.id)
    .join(" ");
  if (cyclicOrder === "d-ctx d-cnt-a") {
    ok("a cyclic child pointer terminates instead of looping");
  } else {
    fail(
      "a cyclic child pointer terminates instead of looping",
      `got "${cyclicOrder}"`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 5. Archive naming                                                        */
/* ----------------------------------------------------------------------- */

{
  const used = new Set();
  const names = [
    archiveEntryName(
      { level: "context", title: "Shop — System Context" },
      0,
      "svg",
      used,
    ),
    archiveEntryName({ level: "component", title: "Orders" }, 1, "svg", used),
    archiveEntryName({ level: "component", title: "Orders" }, 2, "svg", used),
  ];
  const expected = [
    "01-context-shop-system-context.svg",
    "02-component-orders.svg",
    "03-component-orders.svg",
  ];
  if (names.join("|") === expected.join("|")) {
    ok("archive names sort in drill order and stay unique");
  } else {
    fail(
      "archive names sort in drill order and stay unique",
      `got ${JSON.stringify(names)}`,
    );
  }

  // Same index would collide; the suffix is what saves the second file.
  const collide = new Set();
  const first = archiveEntryName(
    { level: "code", title: "Same" },
    0,
    "png",
    collide,
  );
  const second = archiveEntryName(
    { level: "code", title: "Same" },
    0,
    "png",
    collide,
  );
  if (first !== second && second === "01-code-same-2.png") {
    ok("a duplicate name is suffixed rather than silently overwriting");
  } else {
    fail(
      "a duplicate name is suffixed rather than silently overwriting",
      `got "${first}" then "${second}"`,
    );
  }

  if (fileStem("") === "diagram")
    ok("an empty title still yields a usable stem");
  else
    fail("an empty title still yields a usable stem", `got "${fileStem("")}"`);
}

/* ----------------------------------------------------------------------- */

/* ------------------------------------------------------------------------ */
/* Copy-to-clipboard: the same bytes, and the gesture kept                   */
/* ------------------------------------------------------------------------ */

{
  const { readFileSync } = await import("node:fs");
  const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
  const download = src("src/features/viewer/export/download.ts");

  /* THE BLOB IS PASSED UNRESOLVED. Safari requires `clipboard.write` to be
     reached synchronously from the user gesture, so awaiting the rasterise
     first spends the gesture on canvas work and lands on NotAllowedError —
     a copy that fails only in Safari, only for diagrams big enough to take a
     frame, and silently everywhere else. `ClipboardItem` takes a promise for
     exactly this reason, and an `await` inside that call undoes it. */
  const body =
    /export async function copyPngToClipboard\([\s\S]*?\n}/.exec(
      download,
    )?.[0] ?? "";
  if (/"image\/png":\s*renderPngBlob\(/.test(body)) {
    ok(
      "the clipboard write is handed the blob as a PROMISE (Safari's gesture)",
    );
  } else {
    fail(
      "copyPngToClipboard must pass renderPngBlob(...) unresolved",
      "awaiting it first spends the user gesture and Safari refuses the write",
    );
  }
  /* A fallback MAY await — Firefox rejects the promise form and needs the
     resolved blob. What must not happen is the FIRST write awaiting, because
     that is the one still holding Safari's gesture. So the rule is ordering:
     any `await renderPngBlob` has to sit after a `catch`. */
  const firstWrite = body.indexOf("navigator.clipboard.write");
  const firstAwaitedRender = body.indexOf("await renderPngBlob");
  const catchAt = body.indexOf("} catch");
  if (firstAwaitedRender !== -1 && firstAwaitedRender < catchAt) {
    fail(
      "the first clipboard write awaits the rasterise",
      "that spends Safari's user gesture — await only in the fallback",
    );
  } else if (firstWrite !== -1 && catchAt !== -1 && firstWrite > catchAt) {
    fail("the promise form is not attempted first");
  } else {
    ok(
      "the gesture-preserving write is attempted first, awaiting only on retry",
    );
  }

  /* One rasteriser, so the clipboard and the download cannot disagree — the
     same argument `renderPngBlob` was split out for. */
  for (const [label, rel] of [
    ["C4", "src/features/viewer/export/export-button.tsx"],
    ["sequence", "src/features/sequence/export/export-button.tsx"],
  ]) {
    const button = src(rel);
    if (
      button.includes("copyPngToClipboard") &&
      button.includes("canCopyPng")
    ) {
      ok(
        `the ${label} exporter copies through the shared helper, feature-detected`,
      );
    } else {
      fail(`the ${label} exporter must use copyPngToClipboard + canCopyPng`);
    }
    if (/new ClipboardItem/.test(button)) {
      fail(
        `the ${label} exporter builds its own ClipboardItem`,
        "use the helper",
      );
    } else {
      ok(`the ${label} exporter does not reimplement the clipboard write`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} export-archive check(s) FAILED`);
  process.exit(1);
}
console.log(
  `\nexport-archive-check: all ${checks} checks passed` +
    (notes.length > 0 ? `, ${notes.length} skipped (see above).` : "."),
);
