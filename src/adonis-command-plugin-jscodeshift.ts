/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('tsx');

const adonisCommandPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-command',
  async run ({ text, options }) {
    const root = j(text);
    const argumentsRegex = /{(-*.[^}]+)}/g;
    const defaultValueRegex = /(.+)=(.+)/;
    const extractOptional = function (field) {
      const isOptional = field.endsWith('?');
      return isOptional ? [field.replace(/\?$/, ''), isOptional] : [field, isOptional];
    };
    const extractDefaultValue = function (field) {
      let defaultValue = null;
      field = field.replace(defaultValueRegex, function (_group, part1, part2) {
        defaultValue = part2.trim();
        return part1.trim();
      });
      return [field, defaultValue];
    };
    const parseField = function (field) {
      const [fieldWithOutDescription, description] = field.includes(':') ? field.split(':') : [field, ''];
      const [fieldWithOutDefaultValue, defaultValue] = extractDefaultValue(fieldWithOutDescription);
      const [name, optional] = extractOptional(fieldWithOutDefaultValue);
      const returnValue = {
        optional,
        defaultValue,
        name,
        description: description.trim()
      };

      return returnValue;
    };

    // find declaration for "@adonisjs/fold" import
    const importDeclaration = root.find(j.ImportDeclaration, {
      source: {
        type: 'StringLiteral',
        value: '@adonisjs/ace'
      }
    });
    // find specifier for "ioc" import
    const specifierDeclaration = importDeclaration.find(j.ImportSpecifier, {
      imported: {
        name: 'Command'
      }
    });
    // get the local name for the imported module
    if (specifierDeclaration.length) {
      const localName = specifierDeclaration // get the Node in the NodePath and grab its local "name"
        // get the first NodePath from the Collection
        .get(0).node.local.name;
      // main process
      root
        .find(j.ClassDeclaration, {
          superClass: {
            name: localName
          }
        })
        .replaceWith((path) => {
          const { node } = path;
          const classBody: any[] = [];
          const args: any[] = [];
          const flags: any[] = [];
          // remove "Command" imported
          if (specifierDeclaration.get(0).parentPath.parentPath.value.length > 1) {
            j(specifierDeclaration.get(0).parentPath).remove();
          } else {
            j(specifierDeclaration.get(0).parent).remove();
          }
          // add new "Command" declaration
          const newCommandDeclaration = j.importDeclaration(
            [
              j.importSpecifier(j.identifier('BaseCommand'), j.identifier('Command')),
              j.importSpecifier(j.identifier('args'), j.identifier('args')),
              j.importSpecifier(j.identifier('flags'), j.identifier('flags'))
            ],
            j.literal('@adonisjs/core/build/standalone')
          );
          j(path).insertBefore(newCommandDeclaration);
          // add command settings
          const settingsProperty = j.classProperty(j.identifier('settings'), j.objectExpression([j.property('init', j.identifier('loadApp'), j.booleanLiteral(true))]), null, true);
          settingsProperty.accessibility = 'public';
          classBody.push(settingsProperty);
          // get commandName
          node.body.body
            .filter((child) => child.type === 'ClassMethod')
            .forEach((method) => {
              if (method.key.name === 'signature') {
                // parse commandName and arguments
                const returnStatement = method.body.body.find((item) => item.type === 'ReturnStatement');
                let returnValue = returnStatement.argument.value;
                if (returnStatement.argument.quasis && returnStatement.argument.quasis.length) {
                  returnValue = returnStatement.argument.quasis[0].value.raw;
                }
                const [name, ...tokens] = returnValue.trim().split(' ');
                // add "commandName" property to command class
                const commandName = name.trim();
                const commandNameProperty = j.classProperty(j.identifier('commandName'), j.literal(commandName), null, true);
                commandNameProperty.accessibility = 'public';
                classBody.push(commandNameProperty);
                const parsedTokens: any = {
                  args: [],
                  options: []
                };
                /**
                 * Looping over the regex matches in a string and
                 * parsing them appropriately.
                 */
                let match;
                while ((match = argumentsRegex.exec(tokens.join(' ').replace(/\s*({|:|=|})\s*/g, '$1'))) !== null) {
                  const matchedValue = match[1];
                  const parsedValue = parseField(matchedValue);
                  matchedValue.startsWith('-') ? parsedTokens.options.push(parsedValue) : parsedTokens.args.push(parsedValue);
                }
                parsedTokens.args.concat(parsedTokens.options).forEach((arg: any) => {
                  const isFlag = arg.name.startsWith('-');
                  if (isFlag) {
                    flags.push(arg.name.replace('--', ''));
                  } else {
                    args.push(arg.name);
                  }
                  const argProperty = j.classProperty(j.identifier(arg.name.replace('--', '')), arg.defaultValue && arg.defaultValue !== '@value' ? j.literal(arg.defaultValue) : null, null, false);
                  argProperty.accessibility = 'public';
                  argProperty.typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
                  const decoratorArguments = [j.property('init', j.identifier('description'), j.literal(arg.description))];
                  if (!isFlag) {
                    decoratorArguments.push(j.property('init', j.identifier('required'), j.booleanLiteral(arg.optional)));
                  }
                  argProperty.decorators = [
                    j.decorator(j.callExpression(j.memberExpression(j.identifier(isFlag ? 'flags' : 'args'), j.identifier('string')), [j.objectExpression(decoratorArguments)]))
                  ];
                  classBody.push(argProperty);
                });
              } else if (method.key.name === 'description') {
                // parse command description
                const returnStatement = method.body.body.find((item) => item.type === 'ReturnStatement');
                let returnValue = returnStatement.argument.value;
                if (returnStatement.argument.quasis && returnStatement.argument.quasis.length) {
                  returnValue = returnStatement.argument.quasis[0].value.raw;
                }
                const descriptionProperty = j.classProperty(j.identifier('description'), j.literal(returnValue), null, true);
                descriptionProperty.accessibility = 'public';
                classBody.push(descriptionProperty);
              } else if (method.key.name === 'handle') {
                // change name of 'handle' to 'run'
                method.key = j.identifier('run');
                // declare new variables instead of params
                method.params.forEach((param, index) => {
                  if (param.type === 'Identifier') {
                    const newArgsDeclaration = j.variableDeclaration('let', [
                      j.variableDeclarator(
                        j.identifier(param.name),
                        j.objectExpression((index === 0 ? args : flags).map((name) => j.property('init', j.identifier(name), j.memberExpression(j.thisExpression(), j.identifier(name), false))))
                      )
                    ]);
                    method.body.body.splice(index, 0, newArgsDeclaration);
                  } else if (param.type === 'ObjectPattern') {
                    param.properties.forEach((prop, propIndex) => {
                      const newArgsDeclaration = j.variableDeclaration('let', [
                        j.variableDeclarator(
                          prop.key,
                          j.logicalExpression('||', j.memberExpression(j.thisExpression(), j.identifier(prop.key.name), false), prop.value.right ? prop.value.right : j.literal(''))
                        )
                      ]);
                      method.body.body.splice(index + propIndex, 0, newArgsDeclaration);
                    });
                  }
                });
                // remove old params
                method.params = [];
                // move other statements from root into 'run'
                root
                  .find(j.VariableDeclaration)
                  .filter((variableDeclarator) => {
                    return variableDeclarator.parent.node.type === 'Program';
                  })
                  .forEach((variableDeclarator, varIndex) => {
                    method.body.body.splice(varIndex, 0, variableDeclarator.node);
                    j(variableDeclarator).remove();
                  });
                // move class inject modules into 'run'
                if (node.decorators && node.decorators.length) {
                  const classInject = node.decorators.find((dec) => dec.expression.callee.name === 'inject');
                  if (classInject) {
                    const injectModules = classInject.expression.arguments[0].elements.map((arg) => arg.value);
                    // get construct method
                    const constructor = node.body.body.find((el) => el.kind === 'constructor');
                    if (constructor) {
                      const cparams = constructor.params.map((pr) => pr.name);
                      cparams.forEach((cparam, index) => {
                        j(constructor)
                          .find(j.ExpressionStatement, {
                            expression: {
                              right: {
                                name: cparam
                              }
                            }
                          })
                          .forEach((expressionStatement, esindex) => {
                            expressionStatement.value.expression.right = j.callExpression(
                              j.memberExpression(j.identifier('Application'), j.memberExpression(j.identifier('container'), j.identifier('resolveBinding'), false), false),
                              [j.literal(injectModules[index])]
                            );
                            method.body.body.splice(0 + esindex, 0, expressionStatement.value);
                          });
                      });
                    }
                  }
                  // remove inject
                  node.decorators = node.decorators.filter((dec) => dec.expression.callee.name !== 'inject');
                }
                // move Application imported into 'run' if exists
                const appImportedCollection = root.find(j.ImportDeclaration, {
                  source: {
                    value: '@ioc:Adonis/Core/Application'
                  },
                  specifiers: [
                    {
                      local: { name: 'Application' }
                    }
                  ]
                });
                if (appImportedCollection.length) {
                  // remove old 'Application' imported
                  appImportedCollection.remove();
                }
                const newAppImported = j.variableDeclaration('const', [
                  j.variableDeclarator(
                    j.objectPattern([j.property('init', j.identifier('default'), j.identifier('Application'))]),
                    j.awaitExpression(j.importExpression(j.literal('@ioc:Adonis/Core/Application')))
                  )
                ]);
                method.body.body.splice(0, 0, newAppImported);
                // push 'run' to class body
                classBody.push(method);
              }
            });
          // rewrite class body
          node.body.body = classBody;
          return node;
        });
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default adonisCommandPluginJscodeshift;
