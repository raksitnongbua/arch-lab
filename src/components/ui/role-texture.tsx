/**
 * The role textures as a shared `<pattern>` set, mounted once per diagram.
 *
 * ONE SET FOR THE WHOLE CANVAS, not one per node — the opposite of
 * `<WashGradient>`, and the difference is worth stating because the two sit
 * side by side inside a flowchart node. A wash folds a node's OWN border colour
 * into its OWN fill, so it must be per-instance; a texture is drawn in one ink
 * for every role, so a shared def is correct and a per-node copy would be seven
 * patterns per node for no difference on screen.
 *
 * THAT IS ALSO WHY THE INK IS ONE TOKEN. A custom property referenced inside a
 * `<pattern>` in `<defs>` resolves against the pattern's OWN inheritance — the
 * `<svg>` root — not against the shape that references it. So `var(--node-
 * stroke)` in here would silently paint every texture in the root's default
 * border colour rather than each node's. Rather than work around that with
 * per-node patterns, the design leans into it: identity is carried by GEOMETRY
 * and the ink is deliberately constant (`lib/role-texture.ts` has the argument).
 * It is the reason an author's `tagColors` node still wears its role's texture —
 * a colour the author chose does not cost them the role marker.
 *
 * Ids are FIXED, not `useId` — the `CanvasField` rule, for the same reason:
 * these render server-side on the bundled example pages, and a generated id
 * differs between the server pass and the client pass. Fixed ids also mean two
 * diagrams on one page share one definition, which is what `<defs>` is for.
 *
 * `--role-texture-opacity` is `0` in every theme but `eink`, so mounting this
 * costs the other eight themes seven inert `<pattern>` elements and changes
 * nothing they paint.
 */

import type { RoleTexture } from "@/lib/role-texture";
import {
  ROLE_TEXTURES,
  TEXTURE_STROKE,
  TEXTURE_TILE,
  textureId,
  textureTileDot,
  textureTilePaths,
} from "@/lib/role-texture";

/**
 * ONE tile, under a caller-chosen id.
 *
 * Exported for the ONE case the shared set cannot serve: C4's `database` and
 * `queue` silhouettes are per-node inline `<svg>` elements, each its own
 * document with its own `<defs>`, so they can reference nothing this file
 * mounts on a diagram's root. They take a per-instance id and this component
 * rather than a second copy of the tile markup — the fourth rendition of the
 * geometry would be one nobody remembers to update.
 */
export function RoleTexturePattern({
  texture,
  id,
}: {
  texture: RoleTexture;
  id: string;
}): React.JSX.Element | null {
  const dot = textureTileDot(texture);
  if (texture === "plain") return null;
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={TEXTURE_TILE}
      height={TEXTURE_TILE}
    >
      {dot !== null ? (
        <circle
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill="var(--role-texture-ink)"
          fillOpacity="var(--role-texture-opacity)"
        />
      ) : (
        textureTilePaths(texture).map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="var(--role-texture-ink)"
            strokeWidth={TEXTURE_STROKE}
            strokeOpacity="var(--role-texture-opacity)"
            strokeLinecap="butt"
          />
        ))
      )}
    </pattern>
  );
}

export function RoleTextureDefs(): React.JSX.Element {
  return (
    <defs>
      {ROLE_TEXTURES.filter((texture) => texture !== "plain").map((texture) => (
        <RoleTexturePattern
          key={texture}
          texture={texture}
          id={textureId(texture)}
        />
      ))}
    </defs>
  );
}
