/**
 * The role textures as `<pattern>` defs inside an EXPORTED file — the fourth
 * rendition named in `lib/role-texture.ts`, and the exporters' counterpart of
 * `<RoleTextureDefs>`.
 *
 * WHY A REGISTRY RATHER THAN THE COMPONENT'S "EMIT ALL SEVEN". On screen the
 * seven inert patterns cost nothing and buy a fixed, server-renderable id set.
 * A downloaded file is different: it is a document a person keeps, opens in
 * Illustrator, diffs in a review. Six unreferenced `<pattern>` elements in it
 * are six things a reader has to decide are not a mistake — so this collects
 * the textures a diagram ACTUALLY wears while its nodes render and emits only
 * those, the arrangement `WashRegistry` already established one import away.
 *
 * THE ZERO-OPACITY CASE IS THE POINT. `--role-texture-opacity` is `0` in every
 * theme but `eink`, and `ref()` answers `null` there, so a non-texturing theme
 * emits no `<defs>`, no pattern and no overlay element — its exported bytes are
 * exactly what they were before this module existed. An "invisible overlay is
 * harmless" shortcut would silently rewrite eight themes' exports to paint
 * nothing, and every one of those files would have to be re-audited to prove it.
 *
 * IT LIVES UNDER `viewer/export/` and is imported cross-feature, which is where
 * `theme.ts` already sits for the same reason: this is export machinery keyed to
 * `ExportTheme`, not general library code, and the flowchart, use-case and C4
 * exporters all reach for that module today.
 */

import type { RoleTexture } from "@/lib/role-texture";
import {
  ROLE_TEXTURES,
  textureFill,
  texturePatternMarkup,
} from "@/lib/role-texture";

import type { ExportTheme } from "./theme";

export class TextureRegistry {
  private readonly used = new Set<RoleTexture>();
  private readonly ink: string;
  private readonly opacity: number;

  constructor(theme: ExportTheme) {
    /* A palette assembled before `roleTexture` existed — the stub the check
       scripts hand these exporters is exactly that — must degrade to "no
       texture" rather than throw. Same direction `resolveExportTheme` takes
       when the opacity fails to parse: a plainer diagram, never a diagram with
       an unintended lattice over it, and never a crashed export. */
    const paint = theme.roleTexture as ExportTheme["roleTexture"] | undefined;
    this.ink = paint?.ink ?? "";
    this.opacity = paint?.opacity ?? 0;
  }

  /**
   * The `fill` value a shape wears this texture with, or `null` when nothing
   * should be drawn at all — an untexturing theme, or the `plain` geometry that
   * `external` deliberately keeps. Callers must branch on the `null` and skip
   * the whole overlay element; a `fill="none"` rect is still a rect.
   */
  ref(texture: RoleTexture): string | null {
    if (this.opacity <= 0 || texture === "plain") return null;
    this.used.add(texture);
    return textureFill(texture);
  }

  /**
   * The collected patterns, or `""`. Ordered by `ROLE_TEXTURES` rather than by
   * first use, so two exports of the same diagram differ only where the diagram
   * does — a node reordering must not reshuffle the `<defs>` of a file someone
   * is diffing.
   */
  markup(): string {
    return ROLE_TEXTURES.filter((texture) => this.used.has(texture))
      .map((texture) => texturePatternMarkup(texture, this.ink, this.opacity))
      .join("");
  }
}
