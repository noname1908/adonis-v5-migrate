/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
import glob from 'glob';
import path from 'path';
import fs from 'fs';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisModelPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-model',
  async run ({ text, options }) {
    const root = j(text);
    const files = glob.sync(path.join(__dirname, 'input/database/migrations/*.ts'));

    const oldTypes = ['string', 'integer', 'boolean', 'text', 'json', 'jsonb', 'float', 'decimal', 'decimal', 'increments', 'timestamp', 'timestamps', 'renameColumn', 'dropColumn'];
    const newTypes = ['string', 'number', 'boolean', 'string', 'object', 'object', 'number', 'number', 'number', 'increments', 'DateTime', 'timestamps', 'renameColumn', 'dropColumn'];

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

    const getStringValue = (node) => {
      if (node.type === 'StringLiteral') {
        return node.value;
      }
      if (node.type === 'TemplateLiteral') {
        let value = '';
        node.quasis.forEach((item, index) => {
          if (index >= node.expressions.length) {
            value += item.value.raw;
          } else {
            value = `${value + item.value.raw}\${${node.expressions[index].name}}`;
          }
        });
        return value;
      }
      return 'unknown';
    };
    const getStringValueFromReturn = (node) => {
      const returnStatement = node.body.body.find((i) => i.type === 'ReturnStatement');
      let returnValue = returnStatement.argument.value;
      if (returnStatement.argument.quasis && returnStatement.argument.quasis.length) {
        let value = '';
        returnStatement.argument.quasis.forEach((item, index) => {
          if (index >= returnStatement.argument.expressions.length) {
            value += item.value.raw;
          } else {
            value = `${value + item.value.raw}\${${
              returnStatement.argument.expressions[index].name
            }}`;
          }
        });
        returnValue = value;
      }
      return returnValue;
    };
    const snakeToCamel = (str) => {
      if (!/[_-]/.test(str)) return str;
      return str.toLowerCase().replace(/[-_][a-z]/g, (group) => group.slice(-1).toUpperCase());
    };
    const modelNameToTable = (name) => {
      return util.pluralize(util.camelToSnake(name));
    };

    root
      .find(j.ClassDeclaration, {
        superClass: {
          name: 'Model'
        }
      })
      .replaceWith((modelClass) => {
        const { node } = modelClass;
        const modelClassNode = node;
        const classBody: any = [];
        // change model super class
        modelClassNode.superClass = j.identifier('BaseModel');
        // remove old super class imported
        root
          .find(j.VariableDeclaration, {
            declarations: [
              {
                init: {
                  callee: {
                    object: {
                      object: {
                        name: 'Application'
                      },
                      property: {
                        name: 'container'
                      }
                    },
                    property: {
                      name: 'use'
                    }
                  },
                  arguments: [
                    {
                      value: 'Model'
                    }
                  ]
                }
              }
            ]
          })
          .remove();
        // add 'BaseModel' to orm import specifier
        const ormImportSpecifier: any = { BaseModel: 1 };

        // custom primary key
        let primaryKeyDefined = false;
        j(modelClass)
          .find(j.ClassBody)
          .find(j.ClassMethod, {
            kind: 'get',
            key: {
              name: 'primaryKey'
            }
          })
          .forEach((primaryKeyMethod) => {
            if (primaryKeyDefined) return;
            const primaryKeyName = getStringValueFromReturn(primaryKeyMethod.node);
            const primaryKeyProp = j.classProperty(
              j.identifier('primaryKey'),
              j.literal(primaryKeyName),
              null,
              true
            );
            primaryKeyProp.accessibility = 'public';
            classBody.push(primaryKeyProp);
            primaryKeyDefined = true;
          });

        // custom table name
        const tableMethods = j(modelClass)
          .find(j.ClassBody)
          .find(j.ClassMethod, {
            kind: 'get',
            key: {
              name: 'table'
            }
          });
        let tableName = modelNameToTable(modelClassNode.id.name);
        if (tableMethods.length) {
          tableName = getStringValueFromReturn(tableMethods.at(0).get().node);
        }
        // add prop to custom table name
        const modelTableName = j.classProperty(
          j.identifier('table'),
          j.literal(tableName),
          null,
          true
        );
        modelTableName.accessibility = 'public';
        classBody.unshift(modelTableName);
        // get columns from the respective migration files, then add to the model
        const modelProps: any = {};
        for (const file of files) {
          const fileContent = fs.readFileSync(file, 'utf8');
          const fileRoot = j(fileContent);

          fileRoot
            .find(j.ClassDeclaration, {
              superClass: {
                name: 'Schema'
              }
            })
            .forEach((schemaClass) => {
              j(schemaClass)
                .find(j.ClassBody)
                // file 'up' method
                .find(j.ClassMethod, {
                  key: {
                    name: 'up'
                  }
                })
                // find modify table statement
                .find(j.CallExpression, {
                  callee: {
                    object: {
                      type: 'ThisExpression'
                    }
                  },
                  arguments: [
                    {
                      value: tableName
                    }
                  ]
                })
                .forEach((modifyTableStatement) => {
                  const paramName = modifyTableStatement.node.arguments[1].params[0].name;
                  // find modify rows
                  j(modifyTableStatement)
                    .find(j.CallExpression, {
                      callee: {
                        object: {
                          name: paramName
                        },
                        property: {
                          name: (name) => oldTypes.indexOf(name) > -1
                        }
                      }
                    })
                    // get column name and type
                    .forEach((modifyRow) => {
                      const modifyRowNode = modifyRow.node;
                      const columnType =
                        newTypes[oldTypes.indexOf(modifyRowNode.callee.property.name)];
                      if (columnType === 'timestamps') {
                        modelProps.created_at = 'DateTime';
                        modelProps.updated_at = 'DateTime';
                      } else if (columnType === 'renameColumn') {
                        const oldColumnName = modifyRowNode.arguments[0].value;
                        const newColumnName = modifyRowNode.arguments[1].value;
                        if (modelProps[oldColumnName]) {
                          // assign old column type to new column
                          modelProps[newColumnName] = modelProps[oldColumnName];
                          // remove old column
                          delete modelProps[oldColumnName];
                        }
                      } else if (columnType === 'dropColumn') {
                        const oldColumnName = modifyRowNode.arguments[0].value;
                        // remove old column
                        delete modelProps[oldColumnName];
                      } else if (columnType === 'increments') {
                        const columnName = modifyRowNode.arguments[0]
                          ? modifyRowNode.arguments[0].value
                          : 'id';
                        modelProps[columnName] = 'number';
                      } else {
                        const columnName = modifyRowNode.arguments[0].value;
                        modelProps[columnName] = columnType;
                      }
                    });
                });
            });
        }
        if (Object.keys(modelProps).length) {
          // add 'column' to orm import specifier
          ormImportSpecifier.column = 1;
          // add columns to the model
          for (const [key] of Object.entries(modelProps)) {
            let decoratorExpressionCallee = j.identifier('column');
            const modelProp = j.classProperty(j.identifier(key), null, null, false);
            modelProp.accessibility = 'public';
            modelProp.typeAnnotation = j.typeAnnotation(
              j.genericTypeAnnotation(j.identifier(modelProps[key]), null)
            );
            // default with overwrite column name inline
            const decoratorArguments = [
              j.property('init', j.identifier('columnName'), j.literal(key)),
              j.property('init', j.identifier('serializeAs'), j.literal(key))
            ];
            // define timestamp colums
            const camelKey = snakeToCamel(key);
            if (camelKey === 'createdAt' || camelKey === 'updatedAt') {
              decoratorArguments.push(
                j.property('init', j.identifier('autoCreate'), j.literal(true))
              );
              if (camelKey === 'updatedAt') {
                decoratorArguments.push(
                  j.property('init', j.identifier('autoUpdate'), j.literal(true))
                );
              }
            }
            if (modelProps[key] === 'object') {
              // convert object to string before save
              const prepareParam = j.identifier('value');
              prepareParam.typeAnnotation = j.tsTypeAnnotation(j.tsObjectKeyword());
              decoratorArguments.push(
                j.property(
                  'init',
                  j.identifier('prepare'),
                  j.arrowFunctionExpression([prepareParam], j.callExpression(j.memberExpression(j.identifier('JSON'), j.identifier('stringify')), [j.identifier('value')]))
                )
              );
              const consumeParam = j.identifier('value');
              consumeParam.typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
              decoratorArguments.push(
                j.property(
                  'init',
                  j.identifier('consume'),
                  j.arrowFunctionExpression([consumeParam], j.conditionalExpression(
                    j.binaryExpression(
                      '===',
                      j.unaryExpression(
                        'typeof',
                        j.identifier('value'),
                        true
                      ),
                      j.literal('string')
                    ),
                    j.callExpression(j.memberExpression(j.identifier('JSON'), j.identifier('parse')), [j.identifier('value')]),
                    j.identifier('value')
                  ))
                )
              );
            } else if (modelProps[key] === 'DateTime') {
              decoratorExpressionCallee = j.memberExpression(
                j.identifier('column'),
                j.identifier('dateTime')
              );
              // add serialize to the decorator
              const serializeParam = j.identifier('value');
              serializeParam.typeAnnotation = j.tsTypeAnnotation(j.tsUnionType([
                j.tsTypeReference(j.identifier('DateTime')),
                j.tsNullKeyword()
              ]));
              decoratorArguments.push(
                j.property(
                  'init',
                  j.identifier('serialize'),
                  j.arrowFunctionExpression(
                    [serializeParam],
                    j.conditionalExpression(
                      j.identifier('value'),
                      j.callExpression(
                        j.memberExpression(
                          j.callExpression(
                            j.memberExpression(
                              j.identifier('value'),
                              j.identifier('setZone'),
                              false
                            ),
                            [j.literal('utc')]
                          ),
                          j.identifier('toISO'),
                          false
                        ),
                        []
                      ),
                      j.identifier('value')
                    )
                  )
                )
              );
            }
            modelProp.decorators = [
              j.decorator(
                j.callExpression(decoratorExpressionCallee, [
                  j.objectExpression(decoratorArguments)
                ])
              )
            ];
            // add props to the class
            classBody.push(modelProp);
          }
        }
        // define hooks
        let bootProceed = false;
        j(modelClass)
          .find(j.ClassMethod, {
            kind: 'method',
            static: true,
            key: {
              name: 'boot'
            }
          })
          .forEach((bootMethod) => {
            if (bootProceed) return;
            // process 'addHook'
            const hooks: any[] = [];
            j(bootMethod)
              .find(j.CallExpression, {
                callee: {
                  type: 'MemberExpression',
                  object: {
                    type: 'ThisExpression'
                  },
                  property: {
                    name: 'addHook'
                  }
                }
              })
              .forEach((statement) => {
                const statementNode = statement.node;
                const hookName = getStringValue(statementNode.arguments[0]);
                const hookHandle = statementNode.arguments[1];
                if (hookHandle.type === 'ArrayExpression') {
                  hookHandle.elements.forEach((el) => {
                    hooks.push({
                      name: hookName,
                      handle: el
                    });
                  });
                } else {
                  hooks.push({
                    name: hookName,
                    handle: hookHandle
                  });
                }
              });
            // add hooks to model
            if (hooks.length) {
              // declare resolver
              insertImport(
                j.variableDeclaration('const', [
                  j.variableDeclarator(
                    j.identifier('resolver'),
                    j.callExpression(
                      j.memberExpression(
                        j.memberExpression(
                          j.identifier('Application'),
                          j.identifier('container'),
                          false
                        ),
                        j.identifier('getResolver')
                      ),
                      []
                    )
                  )
                ])
              );
              hooks.forEach((hook: any) => {
                let hookParameter;
                let hookFunc;
                let hookFuncName;
                if (hook.handle.type === 'StringLiteral') {
                  hookParameter = j.tsParameterProperty(j.identifier('model'));
                  hookParameter.parameter.typeAnnotation = j.tsTypeAnnotation(
                    j.tsTypeReference(j.identifier(modelClassNode.id.name))
                  );
                  hookFunc = j.functionExpression(
                    null,
                    [hookParameter],
                    j.blockStatement([
                      j.expressionStatement(
                        j.awaitExpression(
                          j.callExpression(
                            j.memberExpression(
                              j.identifier('resolver'),
                              j.identifier('call'),
                              false
                            ),
                            [
                              j.literal(hook.handle.value.split('@provider:').pop()),
                              j.identifier('undefined'),
                              j.arrayExpression([j.identifier('model')])
                            ]
                          )
                        )
                      )
                    ])
                  );
                  hookFunc.async = true;
                  hookFuncName = j.identifier(hook.handle.value.split('.').pop());
                } else {
                  hookParameter = j.tsParameterProperty(hook.handle.params[0]);
                  hookParameter.parameter.typeAnnotation = j.tsTypeAnnotation(
                    j.tsTypeReference(j.identifier(modelClassNode.id.name))
                  );
                  hookFunc = j.functionExpression(
                    null,
                    [hookParameter],
                    j.blockStatement([...hook.handle.body.body])
                  );
                  hookFunc.async = true;
                  hookFuncName = j.identifier('hook' + Math.random().toString(16).slice(2));
                }
                // correct parameter typeAnnotation
                if (hook.name === 'afterFetch') {
                  hookParameter.parameter.typeAnnotation = j.tsTypeAnnotation(j.tsArrayType(j.tsTypeReference(j.identifier(modelClassNode.id.name))));
                } else if (hook.name === 'afterPaginate') {
                  ormImportSpecifier.ModelPaginatorContract = 1;
                  hookParameter.parameter.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier('ModelPaginatorContract'), j.tsTypeParameterInstantiation([j.tsTypeReference(j.identifier(modelClassNode.id.name))])));
                }
                const hookDefinition = j.methodDefinition('method', hookFuncName, hookFunc, true);
                hookDefinition.accessibility = 'public';
                hookDefinition.decorators = [
                  j.decorator(j.callExpression(j.identifier(hook.name), []))
                ];
                classBody.push(hookDefinition);
                // add hook name to orm import specifier
                ormImportSpecifier[hook.name] = 1;
              });
            }

            // process 'addTrait'
            const traits: any[] = [];
            j(bootMethod)
              .find(j.CallExpression, {
                callee: {
                  type: 'MemberExpression',
                  object: {
                    type: 'ThisExpression'
                  },
                  property: {
                    name: 'addTrait'
                  }
                }
              })
              .forEach((statement) => {
                const statementNode = statement.node;
                const namespace = getStringValue(statementNode.arguments[0]);
                traits.push({
                  name: namespace.split('@provider:').pop().split('/').join(''),
                  namespace
                });
              });
            // add traits to model
            if (traits.length) {
              // import compose
              insertImport(
                j.importDeclaration(
                  [j.importSpecifier(j.identifier('compose'))],
                  j.literal('@ioc:Adonis/Core/Helpers')
                )
              );
              const modelSuperClass = modelClassNode.superClass;
              const newSuperClass = j.callExpression(j.identifier('compose'), [modelSuperClass]);
              traits.forEach((trait: any) => {
                // import trait
                insertImport(
                  j.importDeclaration(
                    [j.importDefaultSpecifier(j.identifier(trait.name))],
                    j.literal(trait.namespace)
                  )
                );
                // add trait
                newSuperClass.arguments.push(j.identifier(trait.name));
              });
              // assign new super class
              node.superClass = newSuperClass;
            }
            bootProceed = true;
          });

        // process relationships
        const relModels = {};
        const relationships = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany', 'manyThrough'];
        j(modelClass)
          .find(j.CallExpression, {
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'ThisExpression'
              },
              property: {
                name: name => relationships.indexOf(name) > -1
              }
            }
          }).forEach(rel => {
            const relNode = rel.node;
            const relNodeParentClassMethod = util.findParentOfType(rel, 'ClassMethod');

            const relObject = { options: {} } as any;
            relObject.relPropName = relNodeParentClassMethod ? relNodeParentClassMethod.node.key.name : undefined;
            if (relObject.relPropName) {
              relObject.relName = relNode.callee.property.name;
              relObject.modelName = modelClassNode.id.name;
              relObject.relModelNamespace = relNode.arguments[0].value;
              relObject.relModelName = relObject.relModelNamespace.split('/').join('');
              if (!relModels[relObject.relModelName]) {
                relModels[relObject.relModelName] = relObject.relModelNamespace;
              }
              relObject.relCallback = j.arrowFunctionExpression(
                [],
                j.identifier(relObject.relModelName)
              );
              // custom relationship keys
              if (relObject.relName === 'belongsToMany') {
                relObject.relName = 'manyToMany';
                relObject.options.localKey = relNode.arguments[3];
                relObject.options.relatedKey = relNode.arguments[4];
                relObject.options.pivotForeignKey = relNode.arguments[1];
                relObject.options.pivotRelatedForeignKey = relNode.arguments[2];
              } else if (relObject.relName === 'manyThrough') {
                relObject.relName = 'hasManyThrough';
                relObject.options.localKey = relNode.arguments[2];
                relObject.options.foreignKey = relNode.arguments[3];
                const relatedMethod = relNode.arguments[1].value;
                relObject.relCallback = j.arrayExpression([
                  j.arrowFunctionExpression(
                    [],
                    j.identifier(relatedMethod)
                  ),
                  relObject.relCallback
                ]);
                relObject.relModelNamespace = relatedMethod;
                relObject.relModelName = relatedMethod;
                if (!relModels[relObject.relModelName]) {
                  relModels[relObject.relModelName] = relObject.relModelNamespace;
                }
                // relObject.relThroughModelNamespace = relNode.arguments[0].value
                // relObject.relThroughModelName = relObject.relThroughModelNamespace.split('/').join('')
              } else if (relObject.relName === 'belongsTo') {
                relObject.options.localKey = relNode.arguments[2];
                relObject.options.foreignKey = relNode.arguments[1];
              } else {
                relObject.options.localKey = relNode.arguments[1];
                relObject.options.foreignKey = relNode.arguments[2];
              }
              relObject.relType = util.capitalizeFirstLetter(relObject.relName);
              let relNodeParentCallExpression = util.findParentOfType(rel, 'CallExpression');
              while (relNodeParentCallExpression !== false) {
                const additionalCallMember = relNodeParentCallExpression.node.callee.property.name;
                if (additionalCallMember === 'withPivot') {
                  relObject.options.pivotColumns = relNodeParentCallExpression.node.arguments[0];
                } else if (additionalCallMember === 'pivotTable') {
                  relObject.options.pivotTable = relNodeParentCallExpression.node.arguments[0];
                } else if (additionalCallMember === 'pivotModel') {
                  relObject.options.pivotModel = relNodeParentCallExpression.node.arguments[0];
                } else if (additionalCallMember === 'withTimestamps') {
                  relObject.options.pivotTimestamps = j.literal(true);
                } else {
                  if (!relObject.options.onQuery) relObject.options.onQuery = j.identifier('query');
                  const property = relNodeParentCallExpression.node.callee.property;
                  if (property.name === 'with') {
                    property.name = 'preload';
                  }
                  relObject.options.onQuery = j.callExpression(
                    j.memberExpression(relObject.options.onQuery, relNodeParentCallExpression.node.callee.property, false),
                    relNodeParentCallExpression.node.arguments
                  );
                }
                relNodeParentCallExpression = util.findParentOfType(relNodeParentCallExpression, 'CallExpression');
              }
              if (relObject.options.onQuery) {
                relObject.options.onQuery = j.arrowFunctionExpression(
                  [j.identifier('query')],
                  j.blockStatement([j.expressionStatement(relObject.options.onQuery)])
                );
              }
            }
            // add relationship to model
            const relProperty = j.classProperty(j.identifier(relObject.relPropName), null, null, false);
            relProperty.accessibility = 'public';
            relProperty.typeAnnotation = j.tsTypeAnnotation(
              j.tsTypeReference(
                j.identifier(relObject.relType),
                j.tsTypeParameterInstantiation([
                  j.tsTypeQuery(j.identifier(relObject.relModelName))
                ])
              )
            );
            const decoratorArguments: any[] = [];
            for (const [key] of Object.entries(relObject.options)) {
              if (relObject.options[key] !== undefined) {
                decoratorArguments.push(
                  j.property('init', j.identifier(key), relObject.options[key])
                );
              }
            }
            relProperty.decorators = [
              j.decorator(j.callExpression(j.identifier(relObject.relName), [relObject.relCallback, j.objectExpression(decoratorArguments)]))
            ];
            classBody.push(relProperty);
            // add rel name and rel type to orm
            ormImportSpecifier[relObject.relName] = 1;
            ormImportSpecifier[relObject.relType] = 1;
          });

        // process model scope
        j(modelClass)
          .find(j.ClassMethod, {
            static: true,
            key: {
              name: (name) => name.startsWith('scope')
            }
          })
          .forEach((scope) => {
            if (!ormImportSpecifier.scope) ormImportSpecifier.scope = 1;
            const scopeNode = scope.node;
            const scopeName = scopeNode.key.name.slice(5).charAt(0).toLowerCase() + scopeNode.key.name.slice(6);
            const scopeParams = scopeNode.params;
            const scopeBody = scopeNode.body;
            // add scope to model
            const scopeProperty = j.classProperty(j.identifier(scopeName), j.callExpression(j.identifier('scope'), [j.arrowFunctionExpression(scopeParams, scopeBody)]), null, true);
            scopeProperty.accessibility = 'public';
            classBody.push(scopeProperty);
          });

        // import relationship model
        for (const [key] of Object.entries(relModels)) {
          insertImport(j.importDeclaration([j.importDefaultSpecifier(j.identifier(key))], j.literal(relModels[key])));
        }
        // import orm
        const ormDeclaration = j.importDeclaration([], j.literal('@ioc:Adonis/Lucid/Orm'));
        for (const [key] of Object.entries(ormImportSpecifier)) {
          ormDeclaration.specifiers.push(j.importSpecifier(j.identifier(key)));
        }
        insertImport(ormDeclaration);
        // import 'DateTime'
        insertImport(
          j.importDeclaration([j.importSpecifier(j.identifier('DateTime'))], j.literal('luxon'))
        );

        node.body.body = classBody;
        return node;
      });

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisModelPluginJscodeshift;
