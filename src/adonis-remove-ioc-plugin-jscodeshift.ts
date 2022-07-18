/**
 * cjs - Fix ioc imported from '@adonisjs/fold'
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const serviceProviderPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-remove-ioc-imported',
  async run ({ text, options }) {
    const root = j(text);
    const newAppDeclaration = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('Application'))],
      j.literal('@ioc:Adonis/Core/Application')
    );
    // find declaration for "@adonisjs/fold" import
    const importDeclaration = root.find(j.ImportDeclaration, {
      source: {
        type: 'StringLiteral',
        value: '@adonisjs/fold'
      }
    });
    // find specifier for "ioc" import
    const specifierDeclaration = importDeclaration.find(j.ImportSpecifier, {
      imported: {
        name: 'ioc'
      }
    });
    // get the local name for the imported module
    if (specifierDeclaration.length) {
      const localName = specifierDeclaration // get the Node in the NodePath and grab its local "name"
        // get the first NodePath from the Collection
        .get(0).node.local.name;
      // main process
      root
        .find(j.MemberExpression, {
          object: {
            name: localName
          }
        })
        .replaceWith((path) => {
          const { node } = path;
          return j.memberExpression(
            j.identifier(newAppDeclaration.specifiers[0].local.name),
            j.memberExpression(j.identifier('container'), node.property, false),
            false
          );
        });
      // remove "ioc" imported
      if (specifierDeclaration.get(0).parentPath.parentPath.value.length > 1) {
        j(specifierDeclaration.get(0).parentPath).remove();
      } else {
        j(specifierDeclaration.get(0).parent).remove();
      }
      // add application declaration
      const appDeclaration = root.find(j.ImportDeclaration, {
        source: {
          type: 'StringLiteral',
          value: newAppDeclaration.source.value
        },
        specifiers: [
          {
            type: newAppDeclaration.specifiers[0].type,
            local: {
              name: newAppDeclaration.specifiers[0].local.name
            }
          }
        ]
      });
      if (!appDeclaration.length) {
        j(root.find(j.Program).get('body', 0)).insertBefore(newAppDeclaration);
      }
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default serviceProviderPluginJscodeshift;
