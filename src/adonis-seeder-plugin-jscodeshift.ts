/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisSeederPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-seeder',
  async run ({ text, options, fileName, rootDir }) {
    const root = j(text);

    let lastImportIndex = util.findLastImportIndex(j, root); // TODO: check if this is undefined
    const insertImport = (importDeclaration) => {
      if (lastImportIndex >= 0) {
        j(root.find(j.Program).get('body', lastImportIndex)).insertAfter(importDeclaration);
        lastImportIndex += 1;
      } else {
        lastImportIndex = 0;
        j(root.find(j.Program).get('body', lastImportIndex)).insertBefore(importDeclaration);
      }
    };

    if (fileName.startsWith(`${rootDir}/database/seeds`)) {
      // import 'BaseSchema'
      const baseSeederName = 'BaseSeeder';
      insertImport(
        j.importDeclaration(
          [j.importDefaultSpecifier(j.identifier(baseSeederName))],
          j.literal('@ioc:Adonis/Lucid/Seeder')
        )
      );

      root.find(j.ClassDeclaration).replaceWith((schemaClass) => {
        const schemaClassNode = schemaClass.node;

        schemaClassNode.superClass = j.identifier(baseSeederName);
        return schemaClassNode;
      });
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisSeederPluginJscodeshift;
