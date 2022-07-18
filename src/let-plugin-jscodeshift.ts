/**
 * let - Convert `var` statements to `let`
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('babel');

const cjsPluginJscodeshift: Plugin<Options> = {
  name: 'let',
  async run ({ text, options }) {
    const root = j(text);
    // remove all "use strict" statements
    root.find(j.VariableDeclaration, { kind: 'var' }).forEach(function (p) {
      const letStatement = j.variableDeclaration('let', p.value.declarations);
      letStatement.comments = p.value.comments;
      return j(p).replaceWith(letStatement);
    });

    return root.toSource(util.getRecastConfig(options));
  }
};

export default cjsPluginJscodeshift;
