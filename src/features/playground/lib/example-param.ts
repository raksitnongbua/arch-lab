import {
  serializeArchText,
  serializeDictText,
  serializeErText,
  serializeFlowchartText,
  serializeSequenceText,
  serializeUseCaseText,
} from "@/features/archtext";
import { loadDictExample } from "@/features/dict/service/example-service";
import { loadErExample } from "@/features/er/service/example-service";
import { loadFlowchartExample } from "@/features/flowchart/service/example-service";
import { loadSequenceExample } from "@/features/sequence/service/example-service";
import { loadUseCaseExample } from "@/features/usecase/service/example-service";
import { archLabFileFrom } from "@/features/viewer/lib/model";
import { loadViewerModel } from "@/features/viewer/service/model-service";

/**
 * `?e=` — open a BUNDLED EXAMPLE in the playground, by id.
 *
 * WHY A QUERY PARAM AND NOT THE FRAGMENT. `#m=` was the obvious-looking
 * choice and is already taken: it carries a COMPRESSED DOCUMENT, so
 * `#m=demo.atlas-shop` would be handed to the share decoder and refused. More
 * importantly a fragment never reaches the server, so the example could only
 * be fetched after hydration — the reader would watch the default seed appear
 * and be replaced. A query param is visible to the route, which renders the
 * example in the first byte.
 *
 * ONE FLAT NAMESPACE across all SIX registries: `?e=shopflow` is a C4 model,
 * `?e=checkout` a sequence flow, `?e=intake` a flowchart, `?e=food-delivery` a
 * use-case diagram, `?e=shop-orders` an ER diagram and `?e=customer-api` a data
 * dictionary — and the reader does not have to know which. The ids are unique
 * across the six; `check:view-input` asserts that, because the day they
 * collide this param silently resolves the wrong one.
 *
 * EVERY REGISTRY MUST BE LISTED BELOW, and forgetting one is invisible in a
 * specific way. THE BUG THIS COMMENT EXISTS FOR: the ER and dictionary
 * registries were added and this function was not, so every "Open in the
 * playground" link from a `/demo` ER or dictionary card returned `null` here —
 * and `null` is the same answer an unknown id gives, which is the deliberate
 * fall-back-to-the-seed path. So the playground opened on the C4 seed and
 * nothing anywhere reported a problem: no error, no 404, just the wrong
 * document. `check:view-input` now asserts every registered example id
 * resolves, in both directions.
 *
 * An UNKNOWN id falls back to the ordinary seed rather than erroring: the
 * param names content, not a route, and a link with a stale id should still
 * open a working playground. Same reasoning as an unknown icon slug drawing
 * nothing rather than throwing.
 */
export const VIEW_EXAMPLE_PARAM = "e";

/** Canonical `.alab` text for a bundled example, or null if there is no such id. */
export function exampleTextFor(
  value: string | string[] | undefined,
): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  if (id === undefined || id === "") return null;

  const model = loadViewerModel(id);
  if (model.status === "ok") {
    return serializeArchText(archLabFileFrom(model.model));
  }
  const sequence = loadSequenceExample(id);
  if (sequence.status === "ok") {
    return serializeSequenceText(sequence.file);
  }
  const flowchart = loadFlowchartExample(id);
  if (flowchart.status === "ok") {
    return serializeFlowchartText(flowchart.file);
  }
  const usecase = loadUseCaseExample(id);
  if (usecase.status === "ok") {
    return serializeUseCaseText(usecase.file);
  }
  const er = loadErExample(id);
  if (er.status === "ok") {
    return serializeErText(er.file);
  }
  const dict = loadDictExample(id);
  if (dict.status === "ok") {
    return serializeDictText(dict.file);
  }
  return null;
}
