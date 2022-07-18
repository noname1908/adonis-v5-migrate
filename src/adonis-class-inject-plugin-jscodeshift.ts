/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const classInjectPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-class-inject',
  async run ({ text, options }) {
    const root = j(text);
    let isUpdated = false;

    root
      .find(j.ClassDeclaration, {
        body: {
          body: [
            {
              type: 'ClassMethod',
              kind: 'get',
              static: true,
              key: {
                name: 'inject'
              }
            }
          ]
        }
      })
      .filter((path) => path.value)
      .forEach((path) => {
        path.node.decorators = path.node.decorators ? path.node.decorators : [];

        j(path)
          .find(j.ClassMethod, {
            kind: 'get',
            static: true,
            key: {
              name: 'inject'
            }
          })
          .forEach((method) => {
            const returnStatement = method
              .get('body', 'body')
              .value.find((i) => i.type === 'ReturnStatement');
            // add decorator
            path.node.decorators.push(
              j.decorator(j.callExpression(j.identifier('inject'), [returnStatement.argument]))
            );
            j(method).remove();
            if (!isUpdated) isUpdated = true;
          });
      });

    if (isUpdated) {
      const newAppDeclaration = j.importDeclaration(
        [j.importSpecifier(j.identifier('inject'))],
        j.literal('@adonisjs/fold')
      );
      j(root.find(j.Program).get('body', 0)).insertBefore(newAppDeclaration);
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default classInjectPluginJscodeshift;
