// Superfície pública de "@orakel/content-model/v1". Quem consome importa a versão
// explicitamente; o backoffice importa /v1 e /v2 lado a lado quando houver duas.

export { SCHEMA_VERSION } from './version.ts';
export * from './resources.ts';
export * from './common.ts';
export * from './blocks/index.ts';
export * from './entities/index.ts';
export * from './snapshot.ts';
export * from './semantic/index.ts';
