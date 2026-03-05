/**
 * @agni/services — Type declarations for the top-down API.
 * Interface types are in types.d.ts (import via '@agni/services/types' or from subpaths).
 */
import type {
  AccountsService,
  AuthorService,
  GovernanceService,
  LMSService,
  LessonChainService,
  CompilerService,
  LessonSchemaService,
  LessonAssemblyService
} from './types';

declare const services: {
  accounts: AccountsService;
  author: AuthorService;
  governance: GovernanceService;
  lms: LMSService;
  lessonChain: LessonChainService;
  lessonAssembly: LessonAssemblyService;
  compiler: CompilerService;
  lessonSchema: LessonSchemaService;
};

export = services;
