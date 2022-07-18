/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const iocContainerPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-ioc-container',
  async run ({ text, options }) {
    const root = j(text);
    let isUpdated = false;
    const newAppDeclaration = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('Application'))],
      j.literal('@ioc:Adonis/Core/Application')
    );

    root
      .find(j.CallExpression, {
        callee: {
          name: (value) => ['use', 'make'].indexOf(value) > -1
        }
      })
      .filter(function (variableDeclarator) {
        return variableDeclarator.value;
      })
      .forEach((path) => {
        const newExpression = j.expressionStatement(
          j.memberExpression(
            j.identifier(newAppDeclaration.specifiers[0].local.name),
            j.memberExpression(j.identifier('container'), path.value, false),
            false
          )
        );
        j(path).replaceWith(newExpression.expression);
        if (!isUpdated) isUpdated = true;
      });

    if (isUpdated) {
      j(root.find(j.Program).get('body', 0)).insertBefore(newAppDeclaration);
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default iocContainerPluginJscodeshift;
