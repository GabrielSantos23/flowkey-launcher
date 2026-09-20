export { aliasService, AliasService } from './aliasService';
export { aliasStore, type ItemAlias } from './aliasStore';
export { default as AliasCapture } from './AliasCapture';
export {
  validateAlias,
  normalizeAlias,
  ALIAS_REGEX,
  ALIAS_MAX_LEN,
  type ValidateResult,
} from './aliasValidation';
