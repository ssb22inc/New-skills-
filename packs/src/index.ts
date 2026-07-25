export const WORKSPACE = '@sycamore/packs';

export { ContextPackSchema, type ContextPack } from './context.js';
export {
  VerticalPackSchema,
  CompletionProofSchema,
  type VerticalPack,
  type CompletionProof,
} from './vertical.js';
export {
  PackLoadError,
  packsRoot,
  loadContextPack,
  loadContextPackFrom,
  loadAllContextPacks,
  listContextPackIds,
  loadVerticalPack,
  parseContextPack,
  parseVerticalPack,
} from './loader.js';
export { formatAmount, unitLabel } from './format.js';
export {
  loadCopy,
  translator,
  t,
  clearCopyCache,
  catalogueKeys,
  baseLanguageOf,
  CopyError,
  type CopyCatalogue,
  type Translator,
} from './copy.js';
