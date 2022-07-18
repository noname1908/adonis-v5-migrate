/**
 * cjs - Fix use() calls
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {};

const j = jscodeshift.withParser('tsx');

const adonisChoresPluginJscodeshift: Plugin<Options> = {
  name: 'adonis-chores-jscodeshift',
  async run ({ text, options, fileName }) {
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

    if (fileName.endsWith('.spec.ts')) {
      // correct groupSetup.AuthHook(group, ...)
      root
        .find(j.CallExpression, {
          callee: {
            object: {
              name: 'groupSetup'
            },
            property: {
              name: 'AuthHook'
            }
          }
        })
        .replaceWith((callExpression) => {
          const callExpressionNode = callExpression.node;
          callExpressionNode.arguments[0] = j.identifier('group');
          return callExpressionNode;
        });
    }

    // rename modelInstance.reload() to modelInstance.refresh()
    const calleeNames = [
      'result',
      'salon',
      'booking',
      'bookingOfTargetSystem',
      'notification',
      'customer',
      'bookingReport',
      'saleReport',
      'staffReport',
      'item',
      'thirdPartyStaff',
      'salonSchedule',
      'service',
      'connection',
      'staff',
      'schedule',
      'schedule1',
      'schedule2',
      'scheduleDaily',
      'thirdParty',
      'otherThirdParty'
    ];
    root
      .find(j.ExpressionStatement, {
        expression: {
          type: 'AwaitExpression',
          argument: {
            callee: {
              object: {
                name: (name) => calleeNames.indexOf(name) !== -1
              },
              property: {
                name: 'reload'
              }
            }
          }
        }
      })
      .replaceWith((expression) => {
        const expressionNode = expression.node;
        expressionNode.expression.argument.callee.property = j.identifier('refresh');
        return expressionNode;
      });
    // remove '@provider:' in importDeclaration
    root
      .find(j.ImportDeclaration, {
        source: {
          value: (value) => value.startsWith('@provider:')
        }
      })
      .replaceWith((importDeclaration) => {
        const { node } = importDeclaration;
        node.source = j.literal(node.source.value.replace('@provider:', ''));
        return node;
      });
    // rename model.dirty to model.$dirty
    if (
      fileName.endsWith(`/Models/${fileName.split('/').pop()!.split('.')[0]}.ts`) ||
      fileName.endsWith(`/Hooks/${fileName.split('/').pop()!.split('.')[0]}.ts`)
    ) {
      root
        .find(j.MemberExpression, {
          property: {
            name: 'dirty'
          }
        })
        .replaceWith((path) => {
          const { node } = path;
          node.property = j.identifier('$dirty');
          return node;
        });
    }
    // rewrite repositories
    if (fileName.endsWith(`/Repositories/${fileName.split('/').pop()!.split('.')[0]}.ts`)) {
      root
        .find(j.ClassDeclaration, {
          superClass: {
            name: 'RepositoriesAbstract'
          }
        })
        .replaceWith((repoDeclaration) => {
          const { node } = repoDeclaration;
          const inject = node.decorators.find(
            (decorator) => decorator.expression.callee.name === 'inject'
          );
          const injectArgument = inject.expression.arguments[0];
          const constructor = node.body.body.find(
            (definition) => definition.kind === 'constructor'
          );
          if (injectArgument.type === 'ArrayExpression' && injectArgument.elements.length) {
            if (constructor && injectArgument.elements.length <= constructor.params.length) {
              injectArgument.elements.forEach((element, index) => {
                insertImport(
                  j.importDeclaration(
                    [j.importDefaultSpecifier(constructor.params[index])],
                    element
                  )
                );
                delete constructor.params[index];
              });
            } else if (!constructor) {
              const newConstructorBody = [] as any[];
              injectArgument.elements.forEach((element, index) => {
                insertImport(
                  j.importDeclaration(
                    [j.importDefaultSpecifier(j.identifier(element.value.split('/').join('')))],
                    element
                  )
                );
                if (index === 0) {
                  newConstructorBody.push(
                    j.expressionStatement(
                      j.callExpression(j.identifier('super'), [
                        j.identifier(element.value.split('/').join(''))
                      ])
                    )
                  );
                } else {
                  newConstructorBody.push(
                    j.expressionStatement(
                      j.assignmentExpression(
                        '=',
                        j.memberExpression(
                          j.thisExpression(),
                          j.identifier(element.value.split('/').join('')),
                          false
                        ),
                        j.identifier(element.value.split('/').join(''))
                      )
                    )
                  );
                }
              });
              const newConstructor = j.methodDefinition(
                'constructor',
                j.identifier('constructor'),
                j.functionExpression(null, [], j.blockStatement([...newConstructorBody])),
                false
              );
              node.body.body.splice(0, 0, newConstructor);
            }
          }
          return node;
        });
    }
    // remove '@provider:' in event listeners
    if (fileName.endsWith(`/start/events/${fileName.split('/').pop()!.split('.')[0]}.ts`)) {
      root
        .find(j.StringLiteral, {
          value: value => value.startsWith('@provider:')
        })
        .replaceWith(path => {
          const { node } = path;
          // start with '/' to move to root
          return j.literal(node.value.replace('@provider:', '/'));
        });
    }
    // remove '@provider:' in start folders
    if (fileName.endsWith(`/start/${fileName.split('/').pop()!.split('.')[0]}.ts`)) {
      root
        .find(j.StringLiteral, {
          value: value => value.startsWith('@provider:')
        })
        .replaceWith(path => {
          const { node } = path;
          return j.literal(node.value.replace('@provider:', ''));
        });
    }
    // request.params... -> request.param('...')
    if (fileName.endsWith(`/Controllers/Http/${fileName.split('/').pop()!.split('.')[0]}.ts`)) {
      root
        .find(j.VariableDeclarator, {
          init: {
            object: {
              object: {
                name: 'request'
              },
              property: {
                name: 'params'
              }
            }
          }
        })
        .replaceWith(path => {
          const { node } = path;
          node.init = j.callExpression(
            j.memberExpression(
              j.identifier('request'),
              j.identifier('param'),
              false
            ),
            [j.literal(node.init.property.name)]
          );
          return node;
        });
    }
    // request.params -> request.params()
    if (fileName.endsWith(`/Controllers/Http/${fileName.split('/').pop()!.split('.')[0]}.ts`)) {
      root
        .find(j.VariableDeclarator, {
          init: {
            object: {
              name: 'request'
            },
            property: {
              name: 'params'
            }
          }
        })
        .replaceWith(path => {
          const { node } = path;
          node.init = j.callExpression(
            j.memberExpression(
              j.identifier('request'),
              j.identifier('params'),
              false
            ),
            []
          );
          return node;
        });
    }
    // Event.fire -> Event.emit
    root
      .find(j.CallExpression, {
        callee: {
          object: {
            name: 'Event'
          },
          property: {
            name: 'fire'
          }
        }
      })
      .replaceWith(path => {
        const { node } = path;
        node.callee.property = j.identifier('emit');
        return node;
      });

    // replace statements in all files
    let newText = root.toSource(util.getRecastConfig(options));
    const replaces = {
      // relationship calls
      'await thirdParty.sourceStaffs().fetch();': 'await thirdParty.related(\'sourceStaffs\').query();',
      // moment-range
      "import MomentRange from 'moment-range';": "import { extendMoment } from 'moment-range';",
      'const moment = MomentRange.extendMoment(Moment);': 'const moment = extendMoment(Moment);'

    };
    newText = replace(newText, replaces);

    // only 'Services/TargetSystemService.ts' file
    if (fileName.endsWith('Services/TargetSystemService.ts')) {
      const replaces = {
        'links.rows.forEach(async (item) => {': 'links.forEach(async (item) => {',
        'for (const item of links.rows) {': 'for (const item of links) {'
      };
      newText = replace(newText, replaces);
    }

    // only factory file
    if (fileName.endsWith('database/factory.ts') || fileName.endsWith('factories/index.ts')) {
      const replaces = {
        'faker.username()': 'faker.internet.userName()',
        'faker.fbid()': 'faker.datatype.uuid()',
        'faker.name()': 'faker.name.findName()',
        'faker.paragraph()': 'faker.lorem.paragraph()',
        "faker.url({ extensions: ['gif', 'jpg', 'png'] })": 'faker.image.avatar()',
        'faker.phone({ formatted: false })': 'faker.phone.phoneNumber(\'##########\')',
        'faker.birthday({ string: true })': 'faker.date.past()',
        'faker.pickone([0, 1])': 'faker.helpers.arrayElement([0, 1])',
        'faker.email()': 'faker.internet.email()',
        'faker.sentence()': 'faker.lorem.sentence()',
        'faker.sentence({ words: 15 })': 'faker.lorem.sentence(15)',
        'faker.url()': 'faker.image.avatar()',
        'faker.natural()': 'faker.random.number()',
        'faker.integer({ min: 0, max: 6 })': 'faker.random.number({ min: 0, max: 6 })',
        'faker.integer({ min: 1, max: 54 })': 'faker.random.number({ min: 1, max: 54 })',
        'faker.integer({ min: 0, max: 1 })': 'faker.random.number({ min: 0, max: 1 })',
        "faker.pickone(['KIDS', 'CLEAN_MARK'])": 'faker.helpers.arrayElement([\'KIDS\', \'CLEAN_MARK\'])',
        'faker.word()': 'faker.word.noun()',
        "faker.pickone(['CORONA_NAILIST'])": 'faker.helpers.arrayElement([\'CORONA_NAILIST\'])',
        'faker.integer({ min: 0, max: 100 })': 'faker.random.number({ min: 0, max: 100 })',
        'faker.floating({ min: 1000, max: 10000, fixed: 2 })': 'faker.datatype.float({ min: 1000, max: 10000, precision: 0.01 })',
        'faker.floating({ min: 0, max: 5000, fixed: 2 })': 'faker.datatype.float({ min: 0, max: 5000, precision: 0.01 })',
        'faker.floating({ min: 500, max: 5000, fixed: 2 })': 'faker.datatype.float({ min: 500, max: 5000, precision: 0.01 })'

      };
      newText = replace(newText, replaces);
    }

    return j(newText).toSource(util.getRecastConfig(options));
  }
};

function replace (text: string, replaces: { [key: string]: string }) {
  for (const [key] of Object.entries(replaces)) {
    let statementIndex = text.indexOf(key);
    while (statementIndex > -1) {
      text =
        text.substring(0, statementIndex) +
        replaces[key] +
        text.substr(statementIndex + key.length);
      statementIndex = text.indexOf(key);
    }
  }
  return text;
}

export default adonisChoresPluginJscodeshift;
