/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ConfigurableModuleBuilder } from '@nestjs/common';
import { NestScrambleOptions } from './NestScrambleModule';

/**
 * Modern NestJS 10+ ConfigurableModuleBuilder approach
 * This provides type-safe module configuration with better DX
 */
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<NestScrambleOptions>({
    moduleName: 'NestScramble',
  })
    .setClassMethodName('forRoot')
    .setFactoryMethodName('createNestScrambleOptions')
    .build();

export type NestScrambleModuleOptions = typeof OPTIONS_TYPE;
export type NestScrambleModuleAsyncOptions = typeof ASYNC_OPTIONS_TYPE;
