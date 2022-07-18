#!/usr/bin/env node

/* eslint-disable no-await-in-loop, no-restricted-syntax */
import path from 'path';
import log from 'updatable-log';
import yargs from 'yargs';

import {
  addConversionsPlugin,
  declareMissingClassPropertiesPlugin,
  eslintFixPlugin,
  explicitAnyPlugin,
  hoistClassStaticsPlugin,
  jsDocPlugin,
  memberAccessibilityPlugin,
  stripTSIgnorePlugin,
  tsIgnorePlugin,
  Plugin
} from 'ts-migrate-plugins';
import { migrate, MigrateConfig } from 'ts-migrate-server';
import init from './src/commands/init';
import rename from './src/commands/rename';

import noStrictPlugin from './src/no-strict-plugin-jscodeshift';
import cjsPlugin from './src/cjs-plugin-jscodeshift';
import exportsPlugin from './src/exports-plugin-jscodeshift';
import importCleanupPlugin from './src/import-cleanup-plugin-jscodeshift';
import letPlugin from './src/let-plugin-jscodeshift';
import namedExportGenerationPlugin from './src/named-export-generation-plugin-jscodeshift';
import adonisIocContainerPluginJscodeshift from './src/adonis-ioc-container-plugin-jscodeshift';
import adonisClassInjectPluginJscodeshift from './src/adonis-class-inject-plugin-jscodeshift';
import adonisServiceProviderPluginJscodeshift from './src/adonis-service-provider-plugin-jscodeshift';
import adonisRemoveIocPluginJscodeshift from './src/adonis-remove-ioc-plugin-jscodeshift';
import adonisCommandPluginJscodeshift from './src/adonis-command-plugin-jscodeshift';
import adonisFactoryPluginJscodeshift from './src/adonis-factory-plugin-jscodeshift';
import adonisModelPluginJscodeshift from './src/adonis-model-plugin-jscodeshift';
import adonisMigrationPluginJscodeshift from './src/adonis-migration-plugin-jscodeshift';
import adonisSeederPluginJscodeshift from './src/adonis-seeder-plugin-jscodeshift';
import adonisTestingPluginJscodeshift from './src/adonis-testing-plugin-jscodeshift';
import adonisChoresPluginJscodeshift from './src/adonis-chores-plugin-jscodeshift';

const availablePlugins = [
  noStrictPlugin,
  cjsPlugin,
  exportsPlugin,
  importCleanupPlugin,
  letPlugin,
  jsDocPlugin,
  namedExportGenerationPlugin,
  adonisIocContainerPluginJscodeshift,
  adonisClassInjectPluginJscodeshift,
  adonisServiceProviderPluginJscodeshift,
  adonisRemoveIocPluginJscodeshift,
  adonisCommandPluginJscodeshift,
  adonisFactoryPluginJscodeshift,
  adonisModelPluginJscodeshift,
  adonisMigrationPluginJscodeshift,
  adonisSeederPluginJscodeshift,
  adonisTestingPluginJscodeshift,
  adonisChoresPluginJscodeshift
];

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('npm run adonis-migrate --')
  .version(false)
  .usage('Usage: $0 <command> [options]')
  .command(
    'init <folder>',
    'Initialize tsconfig.json file in <folder>',
    (cmd) => cmd.positional('folder', { type: 'string' }).require(['folder']),
    (args) => {
      const rootDir = path.resolve(process.cwd(), args.folder);
      init({ rootDir });
    }
  )
  .command(
    'rename [options] <folder>',
    'Rename files in folder from JS/JSX to TS/TSX',
    (cmd) =>
      cmd
        .positional('folder', { type: 'string' })
        .string('sources')
        .alias('sources', 's')
        .describe('sources', 'Path to a subset of your project to rename.')
        .example('$0 rename /foo', 'Rename all the files in /foo')
        .example(
          '$0 rename /foo -s "bar/**/*"',
          'Rename all the files in /foo/bar'
        )
        .require(['folder']),
    (args) => {
      const rootDir = path.resolve(process.cwd(), args.folder);
      const { sources } = args;
      const renamedFiles = rename({ rootDir, sources });
      if (renamedFiles === null) {
        process.exit(-1);
      }
    }
  )
  .command(
    'migrate [options] <folder>',
    'Fix TypeScript errors, using codemods',
    (cmd) =>
      cmd
        .positional('folder', { type: 'string' })
        .choices('defaultAccessibility', ['private', 'protected', 'public'] as const)
        .string('plugin')
        .choices(
          'plugin',
          availablePlugins.map((p) => p.name)
        )
        .describe('plugin', 'Run a specific plugin')
        .string('privateRegex')
        .string('protectedRegex')
        .string('publicRegex')
        .string('sources')
        .alias('sources', 's')
        .describe('sources', 'Path to a subset of your project to rename (globs are ok).')
        .example('migrate /foo', 'Migrate all the files in /foo')
        .example(
          '$0 migrate /foo -s "bar/**/*" -s "node_modules/**/*.d.ts"',
          'Migrate all the files in /foo/bar, accounting for ambient types from node_modules.'
        )
        .example(
          '$0 migrate /foo --plugin jsdoc',
          'Migrate JSDoc comments for all the files in /foo'
        )
        .require(['folder']),
    async (args) => {
      const rootDir = path.resolve(process.cwd(), args.folder);
      const { sources } = args;
      let config: MigrateConfig;

      if (args.plugin) {
        const plugin = availablePlugins.find((cur) => cur.name === args.plugin);
        if (!plugin) {
          log.error(`Could not find a plugin named ${args.plugin}.`);
          process.exit(1);
          return;
        }
        if (plugin === jsDocPlugin) {
          const anyAlias = args.aliases === 'tsfixme' ? '$TSFixMe' : undefined;
          const typeMap = typeof args.typeMap === 'string' ? JSON.parse(args.typeMap) : undefined;
          config = new MigrateConfig().addPlugin(jsDocPlugin, { anyAlias, typeMap });
        } else {
          config = new MigrateConfig().addPlugin(plugin, {});
        }
      } else {
        config = new MigrateConfig()
          .addPlugin(noStrictPlugin, {})
          .addPlugin(cjsPlugin, { hoist: false })
          .addPlugin(importCleanupPlugin, {})
          .addPlugin(letPlugin, {})
          .addPlugin(exportsPlugin, {})
          .addPlugin(namedExportGenerationPlugin, {})
          .addPlugin(adonisIocContainerPluginJscodeshift, {})
          .addPlugin(adonisClassInjectPluginJscodeshift, {})
          .addPlugin(adonisServiceProviderPluginJscodeshift, {})
          .addPlugin(adonisRemoveIocPluginJscodeshift, {})
          .addPlugin(adonisCommandPluginJscodeshift, {})
          .addPlugin(adonisFactoryPluginJscodeshift, {})
          .addPlugin(adonisModelPluginJscodeshift, {})
          .addPlugin(adonisMigrationPluginJscodeshift, {})
          .addPlugin(adonisSeederPluginJscodeshift, {})
          .addPlugin(adonisTestingPluginJscodeshift, {})
        // We need to run eslint-fix before ts-ignore because formatting may affect where
        // the errors are that need to get ignored.
          .addPlugin(eslintFixPlugin, {})
          .addPlugin(adonisChoresPluginJscodeshift, {})
        // ts-migrate original plugins
          .addPlugin(stripTSIgnorePlugin, {})
          .addPlugin(hoistClassStaticsPlugin, {})
          .addPlugin(declareMissingClassPropertiesPlugin, {})
          .addPlugin(memberAccessibilityPlugin, {
            defaultAccessibility: 'public'
          })
          .addPlugin(explicitAnyPlugin, {})
          .addPlugin(addConversionsPlugin, {})
        // We need to run eslint-fix before ts-ignore because formatting may affect where
        // the errors are that need to get ignored.
          .addPlugin(eslintFixPlugin, {})
          .addPlugin(tsIgnorePlugin, {})
        // We need to run eslint-fix again after ts-ignore to fix up formatting.
          .addPlugin(eslintFixPlugin, {});
      }

      const exitCode = await migrate({ rootDir, config, sources });

      process.exit(exitCode);
    }
  )
  .command(
    'reignore <folder>',
    'Re-run ts-ignore on a project',
    (cmd) =>
      cmd
        .option('p', {
          alias: 'messagePrefix',
          default: 'FIXME',
          type: 'string',
          describe:
            'A message to add to the ts-expect-error or ts-ignore comments that are inserted.'
        })
        .positional('folder', { type: 'string' })
        .require(['folder']),
    async (args) => {
      const rootDir = path.resolve(process.cwd(), args.folder);

      const changedFiles = new Map<string, string>();
      function withChangeTracking (plugin: Plugin<unknown>): Plugin<unknown> {
        return {
          name: plugin.name,
          async run (params) {
            const prevText = params.text;
            const nextText = await plugin.run(params);
            const seen = changedFiles.has(params.fileName);
            if (!seen && nextText != null && nextText !== prevText) {
              changedFiles.set(params.fileName, prevText);
            }
            return nextText;
          }
        };
      }
      const eslintFixChangedPlugin: Plugin = {
        name: 'eslint-fix-changed',
        async run (params) {
          if (!changedFiles.has(params.fileName)) return undefined;
          if (changedFiles.get(params.fileName) === params.text) return undefined;
          return eslintFixPlugin.run(params);
        }
      };

      const config = new MigrateConfig()
        .addPlugin(withChangeTracking(stripTSIgnorePlugin), {})
        .addPlugin(withChangeTracking(tsIgnorePlugin), {
          messagePrefix: args.messagePrefix
        })
        .addPlugin(eslintFixChangedPlugin, {});

      const exitCode = await migrate({ rootDir, config });

      process.exit(exitCode);
    }
  )
  .example('$0 --help', 'Show help')
  .example('$0 migrate --help', 'Show help for the migrate command')
  .example('$0 init foo', 'Create tsconfig.json file at foo/tsconfig.json')
  .example('$0 rename foo', 'Rename files in foo from JS/JSX to TS/TSX')
  .example(
    '$0 rename foo --s "bar/baz"',
    'Rename files in foo/bar/baz from JS/JSX to TS/TSX'
  )
  .demandCommand(1, 'Must provide a command.')
  .help('h')
  .alias('h', 'help')
  .alias('i', 'init')
  .alias('m', 'migrate')
  .alias('rn', 'rename')
  .alias('ri', 'reignore')
  .wrap(Math.min(yargs.terminalWidth(), 100)).argv;
