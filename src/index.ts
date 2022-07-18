import path from 'path';
import { migrate, MigrateConfig } from 'ts-migrate-server';

import {
  addConversionsPlugin,
  declareMissingClassPropertiesPlugin,
  eslintFixPlugin,
  explicitAnyPlugin,
  hoistClassStaticsPlugin,
  // jsDocPlugin,
  memberAccessibilityPlugin,
  stripTSIgnorePlugin,
  tsIgnorePlugin
  // Plugin,
} from 'ts-migrate-plugins';

import noStrictPlugin from './no-strict-plugin-jscodeshift';
import cjsPlugin from './cjs-plugin-jscodeshift';
import exportsPlugin from './exports-plugin-jscodeshift';
import importCleanupPlugin from './import-cleanup-plugin-jscodeshift';
import letPlugin from './let-plugin-jscodeshift';
import namedExportGenerationPlugin from './named-export-generation-plugin-jscodeshift';
import adonisIocContainerPluginJscodeshift from './adonis-ioc-container-plugin-jscodeshift';
import adonisClassInjectPluginJscodeshift from './adonis-class-inject-plugin-jscodeshift';
import adonisServiceProviderPluginJscodeshift from './adonis-service-provider-plugin-jscodeshift';
import adonisRemoveIocPluginJscodeshift from './adonis-remove-ioc-plugin-jscodeshift';
import adonisCommandPluginJscodeshift from './adonis-command-plugin-jscodeshift';
import adonisFactoryPluginJscodeshift from './adonis-factory-plugin-jscodeshift';
import adonisModelPluginJscodeshift from './adonis-model-plugin-jscodeshift';
import adonisMigrationPluginJscodeshift from './adonis-migration-plugin-jscodeshift';
import adonisSeederPluginJscodeshift from './adonis-seeder-plugin-jscodeshift';
import adonisTestingPluginJscodeshift from './adonis-testing-plugin-jscodeshift';
import adonisChoresPluginJscodeshift from './adonis-chores-plugin-jscodeshift';

// it will change content of the files in the input folder
async function runMigration () {
  const inputDir = path.resolve(__dirname, 'input');

  const config = new MigrateConfig()
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

  const exitCode = await migrate({ rootDir: inputDir, config });

  process.exit(exitCode);
}

runMigration();
