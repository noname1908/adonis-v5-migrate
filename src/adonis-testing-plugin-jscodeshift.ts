/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisTestingPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-testing',
  async run ({ text, options }) {
    const root = j(text);

    const testIds = ['before', 'beforeEach', 'afterEach', 'after', 'test', 'trait'];
    const setupHook = j.identifier('setup');
    const teardownHook = j.identifier('teardown');
    const replaceHooks = {
      before: setupHook,
      beforeEach: j.memberExpression(j.identifier('each'), setupHook, false),
      after: teardownHook,
      afterEach: j.memberExpression(j.identifier('each'), teardownHook, false)
    };

    root.find(j.Program).forEach((program) => {
      const testSuiteImported = j(program).find(j.VariableDeclarator, {
        init: {
          callee: {
            callee: {
              property: {
                name: 'use'
              }
            },
            arguments: [
              {
                value: 'Test/Suite'
              }
            ]
          }
        }
      });
      if (testSuiteImported.length) {
        // replace client some methods
        const replaceClientMethods = {
          get: 'get',
          post: 'post',
          put: 'put',
          patch: 'patch',
          delete: 'delete',
          header: 'header',
          send: 'json',
          query: 'qs',
          type: 'type',
          accept: 'accept',
          cookie: 'cookie',
          plainCookie: 'cookie',
          field: 'field',
          attach: 'file',
          loginVia: 'loginAs'
        };
        const replaceResponseMethods = {
          assertJSON: 'assertBody',
          assertJSONSubset: 'assertBodyContains',
          assertText: 'assertTextIncludes',
          assertError: 'assertBody',
          assertPlainCookie: 'assertCookie',
          assertCookieExists: 'assertCookie',
          assertPlainCookieExists: 'assertCookie',
          assertRedirect: 'assertRedirectsTo'
        };
        j(program).find(j.CallExpression, {
          callee: {
            object: {
              name: 'client'
            }
          }
        }).forEach(clientCall => {
          let newClientCall;
          let relNodeParentCallExpression = clientCall;
          while (relNodeParentCallExpression !== false && relNodeParentCallExpression.node.callee.property) {
            const additionalCallMember = relNodeParentCallExpression.node.callee.property.name;
            if (replaceClientMethods[additionalCallMember]) {
              if (!newClientCall) newClientCall = j.identifier('client');
              newClientCall = j.callExpression(
                j.memberExpression(newClientCall, j.identifier(replaceClientMethods[additionalCallMember]), false),
                relNodeParentCallExpression.node.arguments
              );
            }
            relNodeParentCallExpression = util.findParentOfType(relNodeParentCallExpression, 'CallExpression');
          }
          j(util.findLastParentOfTypeCallExpression(clientCall)).replaceWith(newClientCall);
          // rename client response methods
          const responseVar = util.findParentOfType(clientCall, 'VariableDeclarator');
          if (responseVar) {
            const responseVarName = responseVar.node.id.name;
            j(program).find(j.CallExpression, {
              callee: {
                object: {
                  name: responseVarName
                },
                property: {
                  name: name => Object.keys(replaceResponseMethods).indexOf(name) !== -1
                }
              }
            }).replaceWith(responseCall => {
              const responseCallNode = responseCall.node;
              responseCallNode.callee.property = j.identifier(replaceResponseMethods[responseCallNode.callee.property.name]);
              return responseCallNode;
            });
          }
        });
        // replace assert containSubset to containsSubset
        const replaceAssertMethods = {
          containSubset: 'containsSubset'
        };
        j(program).find(j.CallExpression, {
          callee: {
            object: {
              name: 'assert'
            },
            property: {
              name: name => Object.keys(replaceAssertMethods).indexOf(name) !== -1
            }
          }
        }).replaceWith(assertCall => {
          const assertCallNode = assertCall.node;
          assertCallNode.callee.property = j.identifier(replaceAssertMethods[assertCallNode.callee.property.name]);
          return assertCallNode;
        });
        // transform tests
        const testSuiteImportedLocal = testSuiteImported.get(0).node.id.name;
        const testSuite = testSuiteImported.get(0).node.init.arguments[0];
        testSuiteImported.remove();
        // remove old test define
        j(program)
          .find(j.VariableDeclaration, {
            declarations: [
              {
                init: {
                  name: testSuiteImportedLocal
                }
              }
            ]
          })
          .remove();
        // import test specifier
        j(root.find(j.Program).get('body', 0)).insertBefore(
          j.importDeclaration(
            [j.importSpecifier(j.identifier('test'), j.identifier('test'))],
            j.literal('@japa/runner')
          )
        );
        // process test statement first
        const testSt: any = [];
        j(program)
          .find(j.ExpressionStatement, {
            expression: {
              callee: {
                name: (name) => testIds.indexOf(name) !== -1
              }
            }
          })
          .forEach((expressionStatement) => {
            const expressionStatementNode = expressionStatement.node;
            const callee = expressionStatementNode.expression.callee;
            const args = expressionStatementNode.expression.arguments;
            const calleeName = callee.name;
            let newExpression;
            if (Object.keys(replaceHooks).indexOf(calleeName) !== -1) {
              newExpression = j.expressionStatement(
                j.callExpression(
                  j.memberExpression(j.identifier('group'), replaceHooks[calleeName], false),
                  args
                )
              );
            } else if (calleeName === 'trait' && args[0].value === 'DatabaseTransactions') {
              const func = j.arrowFunctionExpression(
                [],
                j.blockStatement([
                  j.variableDeclaration('const', [
                    j.variableDeclarator(
                      j.objectPattern([
                        j.property('init', j.identifier('default'), j.identifier('Database'))
                      ]),
                      j.awaitExpression(j.importExpression(j.literal('@ioc:Adonis/Lucid/Database')))
                    )
                  ]),
                  j.expressionStatement(
                    j.awaitExpression(
                      j.callExpression(
                        j.memberExpression(
                          j.identifier('Database'),
                          j.identifier('beginGlobalTransaction'),
                          false
                        ),
                        []
                      )
                    )
                  ),
                  j.returnStatement(
                    j.arrowFunctionExpression(
                      [],
                      j.callExpression(
                        j.memberExpression(
                          j.identifier('Database'),
                          j.identifier('rollbackGlobalTransaction'),
                          false
                        ),
                        []
                      ),
                      true
                    )
                  )
                ])
              );
              func.async = true;
              newExpression = j.expressionStatement(
                j.callExpression(
                  j.memberExpression(j.identifier('group'), replaceHooks.beforeEach, false),
                  [func]
                )
              );
            } else if (calleeName === 'test') {
              newExpression = expressionStatement.node;
            }
            if (newExpression) {
              testSt.push(newExpression);
            }
            j(expressionStatement).remove();
          });

        // process other statement remain
        const otherSt = program.node.body.filter((node) => {
          return node.type !== 'ImportDeclaration';
        });
        program.node.body = program.node.body.filter((node) => {
          return node.type === 'ImportDeclaration';
        });

        const testGroup = j.expressionStatement(
          j.callExpression(j.memberExpression(j.identifier('test'), j.identifier('group')), [
            testSuite,
            j.arrowFunctionExpression(
              [j.identifier('group')],
              j.blockStatement(otherSt.concat(testSt))
            )
          ])
        );

        program.node.body.push(testGroup);
      }
    });

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisTestingPluginJscodeshift;
