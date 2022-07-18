/**
 * cjs - Replace require() calls with es6 imports statements
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const sortBy = require('lodash/sortBy');
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('babel');

const cjsPluginJscodeshift: Plugin<Options> = {
  name: 'cjs',
  async run ({ text, options }) {
    const root = j(text);
    const config = util.getTransformConfig(options);

    //
    // Handle import hoisting
    //
    if (config.hoist === true) {
      let lastImportIndex = findLastImportIndex(j, root);
      let lastImport =
        lastImportIndex >= 0 ? root.find(j.Program).get('body', lastImportIndex) : undefined;

      // Hoist require('a');
      getImportExpressionStatements(j, root)
        .filter(function (expressionStatement) {
          return !isParentRoot(expressionStatement);
        })
        .forEach(function (expressionStatement) {
          const newExpression = j.expressionStatement(expressionStatement.value.expression);
          if (lastImport === undefined) {
            lastImportIndex = 0;
            j(root.find(j.Program).get('body', 0)).insertBefore(newExpression);
          } else {
            lastImportIndex += 1;
            j(lastImport).insertAfter(newExpression);
          }
          j(expressionStatement).remove();

          lastImport = root.find(j.Program).get('body', lastImportIndex);
        });

      // Hoist var ... = require(...);
      getImportDeclaratorPaths(j, root)
        .filter(function (variableDeclarator) {
          const variableDeclaration = variableDeclarator.parent;
          return !isParentRoot(variableDeclaration);
        })
        .forEach(function (declarator) {
          const newDeclaration = j.variableDeclaration('const', [declarator.value]);
          if (lastImport === undefined) {
            lastImportIndex = 0;
            j(root.find(j.Program).get('body', 0)).insertBefore(newDeclaration);
          } else {
            j(lastImport).insertAfter(newDeclaration);
            lastImportIndex += 1;
          }
          lastImport = root.find(j.Program).get('body', lastImportIndex);
          j(declarator).remove();
        });
    }

    //
    // Convert require -> import
    //

    // require('a')
    getImportExpressionStatements(j, root)
      .filter(function (expressionStatement) {
        return isParentRoot(expressionStatement);
      })
      .forEach(function (expressionStatement) {
        j(expressionStatement).replaceWith(
          convertRequire(expressionStatement, expressionStatement.node.comments)
        );
      });

    // var ... = require('y')
    // var ... = require('y').x
    // var x = require("y")( ... )
    root.find(j.VariableDeclaration).forEach(function (variableDeclaration) {
      getImportDeclaratorPaths(j, j(variableDeclaration))
        .filter(function (variableDeclarator) {
          const variableDeclaration = variableDeclarator.parent;
          return isParentRoot(variableDeclaration);
        })
        .forEach(replaceDeclarator.bind(undefined, j));
    });

    // var x = { x: require('...'), y: require('...'), ... }
    root
      .find(j.VariableDeclaration, { declarations: [{ init: { type: 'ObjectExpression' } }] })
      .forEach(function (variableDeclaration) {
        if (!isParentRoot(variableDeclaration)) return;

        // only look at properties with require('...')
        j(variableDeclaration)
          .find(j.Property, { value: { callee: { name: 'require' } } })
          .forEach(function (property) {
            // generate import statement
            const variableName = property.get('key', 'name').value;
            const moduleName = property.get('value', 'arguments', 0, 'value').value;
            const importStatement = util.createImportStatement(
              moduleName,
              variableName,
              undefined,
              property.node.comments
            );

            // modify property
            const newProp = j.property(property.node.kind, property.node.key, property.node.key);
            newProp.shorthand = true;

            j(variableDeclaration).insertBefore(importStatement);
            j(property).replaceWith(newProp);
          });
      });

    return root.toSource(util.getRecastConfig(options));
  }
};

function isParentRoot (path) {
  return path.parent.node.type === 'Program';
}

function getImportExpressionStatements (j, rootAst) {
  // require('a')
  return rootAst.find(j.ExpressionStatement, {
    expression: {
      callee: {
        name: 'require'
      }
    }
  });
}

function getDefaultImportDeclarators (j, rootAst) {
  // var ... = require('y')
  return rootAst
    .find(j.VariableDeclarator, {
      init: {
        callee: {
          name: 'require'
        },
        arguments: [
          {
            type: 'Literal'
          }
        ]
      }
    })
    .filter(function (variableDeclarator) {
      return variableDeclarator.value;
    });
}

function getNamedImportDeclarators (j, rootAst) {
  // var ... = require('y').x
  return rootAst.find(j.VariableDeclarator, {
    init: {
      object: {
        callee: {
          name: 'require'
        },
        arguments: [
          {
            type: 'Literal'
          }
        ]
      }
    }
  });
}

function getCalledImportDeclarators (j, rootAst) {
  // var x = require("y")( ... )
  return rootAst
    .find(j.VariableDeclarator, {
      init: {
        type: 'CallExpression',
        callee: {
          callee: {
            name: 'require'
          },
          arguments: [
            {
              type: 'Literal'
            }
          ]
        }
      }
    })
    .filter(function (vdRef) {
      const callExpression = vdRef.value.init;
      return 'arguments' in callExpression && Array.isArray(callExpression.arguments);
    });
}

function getImportDeclaratorPaths (j, variableDeclaration) {
  // var ... = require('y')
  const defaultImports = getDefaultImportDeclarators(j, variableDeclaration);

  // var ... = require('y').x
  const namedImports = getNamedImportDeclarators(j, variableDeclaration);

  // var x = require("y")( ... )
  const calledImports = getCalledImportDeclarators(j, variableDeclaration);

  const sortedImports = sortBy(
    defaultImports.paths().concat(namedImports.paths()).concat(calledImports.paths()),
    ['value.loc.start.line', 'value.loc.start.column']
  );
  return sortedImports;
}

function convertRequire (ast, comments) {
  const props = util.getPropsFromRequire(ast);
  return util.createImportStatement(props.moduleName, props.variableName, props.propName, comments);
}

function createRequire (j, ast, comments) {
  if (
    'declarations' in ast &&
    Array.isArray(ast.declarations) &&
    'init' in ast.declarations[0] &&
    'callee' in ast.declarations[0].init &&
    ast.declarations[0].init.callee.type === 'CallExpression' &&
    'arguments' in ast.declarations[0].init &&
    Array.isArray(ast.declarations[0].init.arguments)
  ) {
    return [
      createIntermediateImport(j, ast.declarations[0], comments),
      createDeclaredCallExpression(j, ast.declarations[0], comments)
    ];
  } else {
    return [convertRequire(ast, comments)];
  }
}

function replaceDeclarator (j, variableDeclarator, index) {
  const variableDeclaration = variableDeclarator.parent;
  const variableDeclarationComments = Array.isArray(variableDeclaration.node.comments)
    ? variableDeclaration.node.comments
    : [];

  // create unique variableDeclaration for each declarator (for more consistent prop extraction)
  const varStatement = j.variableDeclaration('var', [variableDeclarator.node]);
  const isLastDeclarator = variableDeclaration.node.declarations.length === 1;
  const isFirstDeclarator = index === 0;
  let comments = variableDeclarationComments.filter(function (comment) {
    return (isFirstDeclarator && comment.leading) || (isLastDeclarator && comment.trailing);
  });
  if (Array.isArray(variableDeclarator.value.comments)) {
    comments = comments.concat(variableDeclarator.value.comments);
  }

  if (isLastDeclarator) {
    j(variableDeclaration).replaceWith(createRequire(j, varStatement, comments));
  } else {
    // HACK: Using before for now, to avoid it mangling the whitespace after the var statement.
    // This will cause problems if the single var statement contains deps that the other els depend on
    j(variableDeclaration).insertBefore(createRequire(j, varStatement, comments));
    j(variableDeclarator).remove();
  }
}

function createIntermediateImport (_j, variableDeclarator, comments) {
  comments = Array.isArray(comments) ? comments : [];
  const id = variableDeclarator.id;
  let factoryName;
  if (id.type === 'Identifier') {
    factoryName = id.name + 'Factory';
  } else if (id.type === 'ObjectPattern') {
    factoryName =
      id.properties
        .map(function (property) {
          return property.key.name;
        })
        .join('') + 'Factory';
  }
  const importSource = variableDeclarator.init.callee.arguments[0].value;
  const newImport = util.createImportStatement(importSource, factoryName);

  const leadingComments = comments.filter(function (c) {
    return c.leading;
  });
  if (leadingComments.length) {
    newImport.comments = leadingComments;
  }

  return newImport;
}

function createDeclaredCallExpression (j, variableDeclarator, comments) {
  comments = Array.isArray(comments) ? comments : [];
  const id = variableDeclarator.id;
  let factoryName;
  if (id.type === 'Identifier') {
    factoryName = id.name + 'Factory';
  } else if (id.type === 'ObjectPattern') {
    factoryName =
      id.properties
        .map(function (property) {
          return property.key.name;
        })
        .join('') + 'Factory';
  }
  const calledArgs = variableDeclarator.init.arguments;
  const newDeclaration = j.variableDeclaration('const', [
    j.variableDeclarator(id, j.callExpression(j.identifier(factoryName), calledArgs))
  ]);
  const trailingComments = comments.filter(function (c) {
    return c.trailing;
  });
  if (trailingComments.length) {
    newDeclaration.comments = trailingComments;
  }
  return newDeclaration;
}

function findLastImportIndex (j, root) {
  const bodyNodes = root.find(j.Program).get('body').value;
  const imports = bodyNodes.filter(function (node) {
    if (node.type === 'ImportDeclaration') {
      return true;
    } else if (node.type === 'VariableDeclaration') {
      return (
        getImportDeclaratorPaths(j, j(node)).filter(function (declarator) {
          return (
            util.hasParentOfType(declarator, 'BlockStatement') === false &&
            util.hasParentOfType(declarator, 'FunctionDeclaration') === false
          );
        }).length > 0
      );
    } else {
      return false;
    }
  });
  const lastImport = imports[imports.length - 1];
  return bodyNodes.indexOf(lastImport);
}

export default cjsPluginJscodeshift;
