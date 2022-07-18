/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisFactoryPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-factory',
  async run ({ text, options }) {
    const root = j(text);
    let isUpdated = false;
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
    // convert factories creating
    root
      .find(j.ExpressionStatement, {
        expression: {
          type: 'CallExpression',
          callee: {
            object: {
              name: 'Factory'
            },
            property: {
              name: 'blueprint'
            }
          }
        }
      })
      .replaceWith((expressionStatement, index) => {
        const { node } = expressionStatement;
        const model = node.expression.arguments[0].value;
        const callback = node.expression.arguments[1];
        // use a builder to create the ObjectExpression
        const argumentsAsObject = j.objectExpression(
          // map the params to an Array of Property Nodes
          callback.params.map((param) => {
            const prop = j.property('init', j.identifier(param.name), j.identifier(param.name));
            prop.shorthand = true;
            return prop;
          })
        );
        // replace the callback params with our new ObjectExpression
        callback.params = [argumentsAsObject];
        const modelName = model.split('/').slice(-1).pop();
        const newExpression = j.exportNamedDeclaration(
          j.variableDeclaration('const', [
            j.variableDeclarator(
              j.identifier(`${modelName}Factory`),
              j.callExpression(
                j.memberExpression(
                  j.callExpression(j.memberExpression(j.identifier('Factory'), j.identifier('define'), false), [
                    j.identifier(modelName),
                    callback
                  ]),
                  j.identifier('build'),
                  false
                ),
                []
              )
            )
          ]),
          [],
          null
        );
        // import lucid model
        const modelDeclaration = j.importDeclaration([j.importDefaultSpecifier(j.identifier(modelName))], j.literal(model));
        j(root.find(j.Program).get('body', index)).insertBefore(modelDeclaration);
        if (!isUpdated) isUpdated = true;
        return newExpression;
      });
    // convert factories used 'factory(...).create()'
    const modelImportSpecifiers = {};
    const convertFactory = (st) => {
      const model = st.node.callee.object.arguments[0].value;
      const modelName = model.split('/').slice(-1).pop();
      const modelNameFactory = `${modelName}Factory`;
      modelImportSpecifiers[modelNameFactory] = 1;
      let mergeData = j.objectExpression([]);
      if (st.node.arguments && st.node.arguments.length) {
        const oldMergeData = st.node.arguments.find((arg) => ['ObjectExpression', 'ArrayExpression'].indexOf(arg.type) > -1);
        if (oldMergeData) {
          mergeData = oldMergeData;
          st.node.arguments = st.node.arguments.filter((arg) => ['ObjectExpression', 'ArrayExpression'].indexOf(arg.type) === -1);
        }
      }
      const newExpression = j.callExpression(
        j.memberExpression(
          j.callExpression(j.memberExpression(j.identifier(modelNameFactory), j.identifier('merge'), false), [mergeData]),
          st.node.callee.property,
          false
        ),
        st.node.arguments
      );
      return newExpression;
    };
    root
      .find(j.CallExpression, {
        callee: {
          object: {
            callee: {
              name: 'factory'
            }
          }
        }
      })
      .replaceWith((st) => {
        const newExpression = convertFactory(st);
        return newExpression;
      });
    // convert factories used 'Factory.model(...).create()'
    root
      .find(j.CallExpression, {
        callee: {
          object: {
            callee: {
              object: {
                name: 'Factory'
              },
              property: {
                name: 'model'
              }
            }
          }
        }
      })
      .replaceWith((st) => {
        const newExpression = convertFactory(st);
        return newExpression;
      });
    // import 'modelFactory'
    if (Object.keys(modelImportSpecifiers).length) {
      const modelImportSpecifiersArr: any = [];
      for (const [key] of Object.entries(modelImportSpecifiers)) {
        modelImportSpecifiersArr.push(key);
      }
      const factoryDeclaration = j.importDeclaration(
        modelImportSpecifiersArr.map((spec) => j.importSpecifier(j.identifier(spec))),
        j.literal('Database/factories')
      );
      insertImport(factoryDeclaration);
    }
    // import 'Factory'
    if (isUpdated) {
      root
        .find(j.VariableDeclaration, {
          declarations: [{
            id: {
              name: 'Factory'
            }
          }]
        })
        .replaceWith(() => {
          const factoryDeclaration = j.importDeclaration(
            [j.importDefaultSpecifier(j.identifier('Factory'))],
            j.literal('@ioc:Adonis/Lucid/Factory')
          );
          return factoryDeclaration;
        });
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisFactoryPluginJscodeshift;
