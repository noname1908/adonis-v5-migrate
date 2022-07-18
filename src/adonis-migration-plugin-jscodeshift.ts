/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisMigrationPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-migration',
  async run ({ text, options }) {
    const root = j(text);
    let isUpdated = false;

    const replaceMethods = {
      create: 'createTable',
      rename: 'renameTable',
      drop: 'dropTable',
      dropIfExists: 'dropTableIfExists',
      alter: 'alterTable',
      raw: 'raw',
      createIfNotExists: 'createTable',
      hasTable: 'hasTable',
      table: 'table'
    };
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

    const baseSchemaName = 'BaseSchema';
    const nowMethodName = 'now';
    root
      .find(j.ClassDeclaration, {
        superClass: {
          name: 'Schema'
        }
      })
      .replaceWith((schemaClass) => {
        if (!isUpdated) isUpdated = true;
        const schemaClassNode = schemaClass.node;
        // rename 'this.schedule' to 'this.defer' (execute arbitrary database commands)
        j(schemaClass)
          .find(j.CallExpression, {
            callee: {
              object: {
                type: 'ThisExpression'
              },
              property: {
                name: 'schedule'
              }
            }
          })
          .replaceWith((nowCallExp) => {
            const nowCallExpNode = nowCallExp.node;

            nowCallExpNode.callee.property = j.identifier('defer');

            return nowCallExpNode;
          });
        // rename 'this.fn.now' to 'this.now'
        j(schemaClass)
          .find(j.CallExpression, {
            callee: {
              object: {
                object: {
                  type: 'ThisExpression'
                },
                property: {
                  name: 'fn'
                }
              },
              property: {
                name: nowMethodName
              }
            }
          })
          .replaceWith((_nowCallExp) => {
            return j.callExpression(
              j.memberExpression(j.thisExpression(), j.identifier(nowMethodName)),
              []
            );
          });
        // correct 'timestamp' options
        j(schemaClass)
          .find(j.CallExpression, {
            callee: {
              property: {
                name: 'timestamp'
              }
            }
          })
          .replaceWith((callExp) => {
            const callExpNode = callExp.node;
            const column = callExpNode.arguments[0];
            const useTz = callExpNode.arguments[1];
            const precision = callExpNode.arguments[2];

            const optionProps: any[] = [];
            if (useTz) {
              optionProps.push(j.property('init', j.identifier('useTz'), useTz));
            }
            if (precision) {
              optionProps.push(j.property('init', j.identifier('precision'), precision));
            }
            const options = j.objectExpression(optionProps);
            callExpNode.arguments = [column, options];

            return callExpNode;
          });
        // rename schema methods
        j(schemaClass)
          .find(j.ExpressionStatement, {
            expression: {
              callee: {
                object: {
                  type: 'ThisExpression'
                },
                property: {
                  name: (name) => Object.keys(replaceMethods).indexOf(name) !== -1
                }
              }
            }
          })
          .replaceWith((expression) => {
            const expressionNode = expression.node;
            const expressionMethodOldName = expressionNode.expression.callee.property.name;
            const expressionArguments = expressionNode.expression.arguments;
            const expressionMethod = j.identifier(replaceMethods[expressionMethodOldName]);

            const newExpression = j.expressionStatement(
              j.callExpression(
                j.memberExpression(
                  j.thisExpression(),
                  j.memberExpression(j.identifier('schema'), expressionMethod, false),
                  false
                ),
                expressionArguments
              )
            );

            return newExpression;
          });

        schemaClassNode.superClass = j.identifier(baseSchemaName);
        return schemaClassNode;
      });

    if (isUpdated) {
      // import 'BaseSchema'
      insertImport(
        j.importDeclaration(
          [j.importDefaultSpecifier(j.identifier(baseSchemaName))],
          j.literal('@ioc:Adonis/Lucid/Schema')
        )
      );
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisMigrationPluginJscodeshift;
