// http://skookum.com/blog/converting-a-project-from-amd-to-cjs-with-recast

const j = require('jscodeshift');
const recast = require('recast');
const sortBy = require('lodash/sortBy');
const pluralize = require('pluralize');

const util = {
  // wraps each VariableDeclarator in a VariableDeclaration so it includes the 'var' and semicolon
  // unrollSingleVar
  //
  /**
   * Returns an array of var declarations
   *
   */
  singleVarToExpressions: function (ast) {
    // if ast.value, use that... Sometimes you need that to access the node that we care about directly.
    ast = ast.value || ast;

    const expressions: any = [];
    const declarations = ast.declarations;
    // safety checks
    // am I a single var statement?
    if (ast.type === 'VariableDeclaration' && ast.declarations.length > 1) {
      for (let i = 0; i < declarations.length; i++) {
        const varStatement = j.variableDeclaration('var', [
          ast.declarations[i]
        ]);
        expressions.push(varStatement);
      }

      // console.log('expressions', expressions);
      return expressions;
      // console.log('inside');
      // console.log('varStatement', varStatement);
    } else {
      console.warn(
        "ERROR: Expected a single var statement. THat's NOT what I got:"
      );
      console.log('ast', ast);
    }
  },

  /**
   * Pass in params, creates and returns import statement AST
   * @param moduleName {string} - Also called the source
   * @param variableName {string} - Also called a specifier
   * @param propName {string} - `b` in `require('a').b`
   * @param comments {obj} - Comments AST object
   * @return {obj} - An AST object.
   * TODO: Add destructuring use cases...
   */
  createImportStatement: function (
    moduleName,
    variableName,
    propName,
    comments
  ) {
    let declaration;
    let variable;
    let idIdentifier;
    let nameIdentifier;
    // console.log('variableName', variableName);
    // console.log('moduleName', moduleName);

    // if no variable name, return `import 'jquery'`
    if (!variableName) {
      declaration = j.importDeclaration([], j.literal(moduleName));
      declaration.comments = comments;
      return declaration;
    }

    // multiple variable names indicates a destructured import
    if (Array.isArray(variableName)) {
      const variableIds = variableName.map(function (v, i) {
        const prop = Array.isArray(propName) && propName[i] ? propName[i] : v;
        return j.importSpecifier(j.identifier(v), j.identifier(prop));
      });

      declaration = j.importDeclaration(variableIds, j.literal(moduleName));
    } else {
      // else returns `import $ from 'jquery'`
      nameIdentifier = j.identifier(variableName); // import var name
      variable = j.importDefaultSpecifier(nameIdentifier);

      // if propName, use destructuring `import {pluck} from 'underscore'`
      if (propName && propName !== 'default') {
        idIdentifier = j.identifier(propName);
        variable = j.importSpecifier(idIdentifier, nameIdentifier); // if both are same, one is dropped...
      }

      declaration = j.importDeclaration([variable], j.literal(moduleName));
    }

    declaration.comments = comments;

    return declaration;
  },

  /**
   * Converts the AST obj/tree and turns it into readable code.
   * Returns a string.
   */
  toString: function (ast) {
    // force single quotes in the output...
    return recast.print(ast, { quote: 'single' }).code;
  },

  /**
   * Pass in a require statement, returns the important parts.
   * @param ast {VariableDeclaration|ExpressionStatement} - Not the full AST.
   */
  getPropsFromRequire: function (ast) {
    let variableName;
    let moduleName;
    let propName;
    let declarator;
    // safety checks
    // if ast.value, use that... Sometimes you need that to access the node that we care about directly.
    ast = ast.value || ast;

    // require('jquery');
    if (ast.type === 'ExpressionStatement') {
      moduleName = ast.expression.arguments[0].value;

      // `var prop = require('jquery').prop;`
    } else if (
      ast.type === 'VariableDeclaration' &&
      ast.declarations[0].init.type === 'MemberExpression'
    ) {
      declarator = ast.declarations[0];
      propName = declarator.init.property.name;
      moduleName = declarator.init.object.arguments[0].value;
      variableName = declarator.id.name;

      // var $ = require('jquery');  and check that it isn't a single var statement
    } else if (
      ast.type === 'VariableDeclaration' &&
      ast.declarations.length === 1
    ) {
      // get the var declaration
      declarator = ast.declarations[0];

      if (!declarator.init.arguments) {
        console.log('getPropsFromRequire: wrong type: ', declarator);
      }

      moduleName = declarator.init.arguments[0].value;
      variableName = declarator.id.name;

      // var $ = require('jquery');

      if (declarator.id.type === 'Identifier') {
        variableName = declarator.id.name;

        // var { includes, pick } = require('lodash');
      } else if (declarator.id.type === 'ObjectPattern') {
        const modules: any = [];
        propName = [];

        declarator.id.properties.forEach(function (p) {
          modules.push(p.key.name);
          propName.push(p.value.name);
        });

        variableName = modules;
      }
    } else {
      // console.log('ELSE');
      // moduleName = ast.arguments[0].value;
    }

    const obj: any = {
      moduleName
    };

    // these are set sometimes
    if (propName) {
      obj.propName = propName;
    }
    if (variableName) {
      obj.variableName = variableName;
    }

    return obj;
  },

  getValidRecastArgs: function () {
    return [
      'esprima',
      'inputSourceMap',
      'lineTerminator',
      'quote',
      'range',
      'reuseWhitespace',
      'sourceFileName',
      'sourceMapName',
      'sourceRoot',
      'tabWidth',
      'tolerant',
      'trailingComma',
      'useTabs',
      'wrapColumn'
    ];
  },

  isRecastArg: function (item) {
    return util.getValidRecastArgs().indexOf(item) >= 0;
  },

  getDefaultTransformConfig: function () {
    return {};
  },

  getDefaultRecastConfig: function () {
    return {
      quote: 'single',
      trailingComma: true,
      tabWidth: 2
    };
  },

  getConfig (options, defaultConfig, keyFilterFunction) {
    if (keyFilterFunction === undefined) {
      keyFilterFunction = function () {
        return true;
      };
    }
    const out = {};
    const keys1 = Object.keys(defaultConfig);
    for (let i = 0; i < keys1.length; i++) {
      const key1 = keys1[i];
      if (keyFilterFunction(key1)) {
        out[key1] = defaultConfig[key1];
      }
    }
    // WAT: typeof null === 'object' === true
    if (
      options !== null &&
      typeof options === 'object' &&
      !Array.isArray(options)
    ) {
      const keys2 = Object.keys(options);
      for (let j = 0; j < keys2.length; j++) {
        const key2 = keys2[j];
        if (keyFilterFunction(key2)) {
          out[key2] = options[key2];
        }
      }
    }
    return out;
  },

  getTransformConfig: function (options) {
    return util.getConfig(
      options,
      util.getDefaultTransformConfig(),
      function (key) {
        return !util.isRecastArg(key);
      }
    );
  },

  getRecastConfig: function (options) {
    return util.getConfig(
      options,
      util.getDefaultRecastConfig(),
      function (key) {
        return util.isRecastArg(key);
      }
    );
  },

  findParentOfType: function (node, type) {
    // traverse up the tree until end, or you find a matching type
    while (node.parentPath) {
      node = node.parentPath;
      if (node.value.type === type) {
        return node;
      }
    }

    return false;
  },

  findLastParentOfTypeCallExpression: function (node) {
    const type = 'CallExpression';
    // traverse up the tree until end, or you find a matching type
    while (node.parentPath) {
      node = node.parentPath;
      if (node.value.type === type) {
        const last = util.findLastParentOfTypeCallExpression(node);
        if (last && last.node.callee.property) {
          return last;
        } else {
          return node;
        }
      }
    }

    return false;
  },

  hasParentOfType: function (node, type) {
    return util.findParentOfType(node, type) !== false;
  },

  getDefaultImportDeclarators (j, rootAst) {
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
  },

  getNamedImportDeclarators (j, rootAst) {
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
  },

  getCalledImportDeclarators (j, rootAst) {
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
        return (
          'arguments' in callExpression &&
          Array.isArray(callExpression.arguments)
        );
      });
  },

  getImportDeclaratorPaths (j, variableDeclaration) {
    // var ... = require('y')
    const defaultImports = util.getDefaultImportDeclarators(
      j,
      variableDeclaration
    );

    // var ... = require('y').x
    const namedImports = util.getNamedImportDeclarators(j, variableDeclaration);

    // var x = require("y")( ... )
    const calledImports = util.getCalledImportDeclarators(
      j,
      variableDeclaration
    );

    const sortedImports = sortBy(
      defaultImports
        .paths()
        .concat(namedImports.paths())
        .concat(calledImports.paths()),
      ['value.loc.start.line', 'value.loc.start.column']
    );
    return sortedImports;
  },

  findLastImportIndex (j, root) {
    const bodyNodes = root.find(j.Program).get('body').value;
    const imports = bodyNodes.filter(function (node) {
      if (node.type === 'ImportDeclaration') {
        return true;
      } else if (node.type === 'VariableDeclaration') {
        return (
          util
            .getImportDeclaratorPaths(j, j(node))
            .filter(function (declarator) {
              return (
                util.hasParentOfType(declarator, 'BlockStatement') === false &&
                util.hasParentOfType(declarator, 'FunctionDeclaration') ===
                  false
              );
            }).length > 0
        );
      } else {
        return false;
      }
    });
    const lastImport = imports[imports.length - 1];
    return bodyNodes.indexOf(lastImport);
  },

  camelToSnake (str) {
    return str
      .split(/(?=[A-Z])/)
      .join('_')
      .toLowerCase();
  },

  pluralize (str) {
    return pluralize(str);
  },

  capitalizeFirstLetter (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
};

// DO NOT COPY THIS
module.exports = util;

/****************************************
 * PRIVATE HELPERS
 ***************************************/
