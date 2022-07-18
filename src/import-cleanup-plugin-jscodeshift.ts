/**
 * import-cleanup - Combines and dedupes duplicate imports
 */
import jscodeshift from 'jscodeshift';
import { Plugin } from 'ts-migrate-server';
const util = require('./utils');

type Options = {}

const j = jscodeshift.withParser('babel');

const importCleanupPluginJscodeshift: Plugin<Options> = {
  name: 'import-cleanup',
  async run ({ text, options }) {
    const root = j(text);
    const sourceLookup = {};
    return (
      root
        .find(j.ImportDeclaration)
        // ignore import * as ...
        .filter((p) => {
          return (
            p.parent.node.type === 'Program' &&
            p.get('specifiers', 0, 'type').value !== 'ImportNamespaceSpecifier'
          );
        })
        .forEach((p) => {
          const source = p.get('source', 'value').value;
          const existingImport = sourceLookup[source];

          if (!existingImport) {
            sourceLookup[source] = p;
            return;
          }

          const specifiers = dedupe(normalize(existingImport, j).concat(normalize(p, j)));
          const updatedImport = j.importDeclaration(specifiers, p.value.source);
          j(existingImport).replaceWith(updatedImport);
          j(p).remove();
        })
        .toSource(util.getRecastConfig(options))
    );
  }
};

function normalize (importDecl, j) {
  return importDecl.value.specifiers.map((specifier) => {
    const localName = specifier.local.name;
    const importedName = specifier.imported ? specifier.imported.name : 'default';
    return j.importSpecifier(j.identifier(importedName), j.identifier(localName));
  });
}

function dedupe (specifiers) {
  const added = {};
  const output: any = [];

  specifiers.forEach((specifier) => {
    const localName = specifier.local.name;
    if (added[localName]) return;
    output.push(specifier);
    added[localName] = true;
  });

  return output;
}

export default importCleanupPluginJscodeshift;
