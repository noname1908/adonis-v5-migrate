/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const serviceProviderPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-service-provider',
  async run ({ text, options }) {
    const root = j(text);
    const appParameterName = 'app';

    // find declaration for "@adonisjs/fold" import
    const importDeclaration = root.find(j.ImportDeclaration, {
      source: {
        type: 'StringLiteral',
        value: '@adonisjs/fold'
      }
    });
    // find specifier for "ServiceProvider" import
    const specifierDeclaration = importDeclaration.find(j.ImportSpecifier, {
      imported: {
        name: 'ServiceProvider'
      }
    });
    // get the local name for the imported module
    if (specifierDeclaration.length) {
      const localName =
        specifierDeclaration
        // get the first NodePath from the Collection
          .get(0)
        // get the Node in the NodePath and grab its local "name"
          .node.local.name;

      root
        .find(j.ClassDeclaration, {
          superClass: {
            name: localName
          }
        })
        .replaceWith(path => {
          const { node } = path;
          node.superClass = null;
          // add "needsApplication" property to service provider
          const property = j.classProperty(j.identifier('needsApplication'), j.booleanLiteral(true), null, true);
          property.accessibility = 'public';
          node.body.body.splice(0, 0, property);
          // add constructor to service provider
          const appParameter = j.tsParameterProperty(j.identifier(appParameterName));
          appParameter.accessibility = 'protected';
          appParameter.parameter.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier('ApplicationContract')));
          const constructor = j.methodDefinition(
            'constructor',
            j.identifier('constructor'),
            j.functionExpression(null, [appParameter], j.blockStatement([])),
            false
          );
          node.body.body.splice(1, 0, constructor);
          // fix ioc container of service provider
          j(path).find(j.MemberExpression, {
            object: {
              object: {
                type: 'ThisExpression'
              },
              property: {
                name: appParameterName
              }
            },
            property: {
              name: (value) => ['use', 'make', 'bind', 'alias', 'singleton', 'autoload'].indexOf(value) > -1
            }
          }).filter(path => path.value)
            .forEach(child => {
              const { node } = child;
              if (node.property.name === 'autoload') {
                const alias = child.parent.node.arguments[1];
                const path = child.parent.node.arguments[0];
                const newExpression = j.expressionStatement(
                  j.assignmentExpression(
                    '=',
                    j.memberExpression(
                      j.thisExpression(),
                      j.memberExpression(
                        j.identifier(appParameterName),
                        j.memberExpression(j.identifier('container'), j.memberExpression(j.identifier('importAliases'), alias, true), false),
                        false
                      ),
                      false
                    ),
                    path
                  )
                );
                // replace with new expression
                j(child.parent).replaceWith(newExpression.expression);
              } else {
                // modify node
                node.object.property = j.memberExpression(j.identifier(appParameterName), j.identifier('container'), false);
              }
            });
          return node;
        });
      // remove "ServiceProvider" imported
      if (specifierDeclaration.get(0).parentPath.parentPath.value.length > 1) {
        j(specifierDeclaration.get(0).parentPath).remove();
      } else {
        j(specifierDeclaration.get(0).parent).remove();
      }
      // add application declaration
      const newAppDeclaration = j.importDeclaration(
        [j.importSpecifier(j.identifier('ApplicationContract'))],
        j.literal('@ioc:Adonis/Core/Application')
      );
      j(root.find(j.Program).get('body', 0)).insertBefore(newAppDeclaration);
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default serviceProviderPluginJscodeshift;
