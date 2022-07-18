/**
 * no-strict - Remove "use strict" statements from files.
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('babel');

const noStrictPluginJscodeshift: Plugin<Options> = {
  name: 'no-strict',
  async run ({ text, options }) {
    const root = j(text);
    const leadingComment = root.find(j.Program).get('body', 0).node.leadingComments;
    let replaceLeadingComment = false;

    // remove all "use strict" statements
    root.find(j.ExpressionStatement).forEach(function (item) {
      if (item.value.expression.value === 'use strict') {
        replaceLeadingComment = replaceLeadingComment || item.parent.value.type === 'Program';
        j(item).remove();
      }
    });

    // re-add comment to to the top if it was removed
    if (replaceLeadingComment) {
      root.get().node.comments = leadingComment;
    }

    return root.toSource(util.getRecastConfig(options));
  }
};

export default noStrictPluginJscodeshift;
