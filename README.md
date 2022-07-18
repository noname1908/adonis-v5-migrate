# adonis-v5-migrate

*adonis-v5-migrate is a tool for migrating AdonisJs application to v5.*
Run `npx adonis-v5-migrate <folder>` to convert your AdonisJs application to v5.

*adonis-v5-migrate* is designed around AdonisJs projects. Use at your own risk.


# Install

Install [*adonis-v5-migrate*](https://www.npmjs.com/package/adonis-v5-migrate) using [npm](https://www.npmjs.com):

`npm install --save-dev adonis-v5-migrate`

Or [yarn](https://yarnpkg.com):

`yarn add --dev adonis-v5-migrate`

# Usage

Migrate an entire project like this:

```sh
npx -p adonis-v5-migrate -c "adonis-migrate-full <folder>"
```

Please note that it may take a long time to do a full migration.
You can also migrate individual parts of a project by specifying a subset of sources:

```sh
npx adonis-v5-migrate-full <folder> /                # specify the project root, and
  --sources="relative/path/to/subset/**/*" /  # list the subset to migrate,
  --sources="node_modules/**/*.d.ts"          # including any global types that the
                                              # migrator may need to know about.
```

Or, you can run individual CLI commands:

```
$ npx adonis-v5-migrate -- --help

npm run adonis-v5-migrate -- <command> [options]

Commands:
  npm run adonis-v5-migrate -- init <folder>       Initialize tsconfig.json file in <folder>
  npm run adonis-v5-migrate -- rename <folder>     *Rename files in folder from JS/JSX to TS/TSX
  npm run adonis-v5-migrate -- migrate <folder>    *Fix TypeScript errors, using codemods
  npm run adonis-v5-migrate -- reignore <folder>   Re-run ts-ignore on a project

* These commands can be passed a --sources (or -s) flag. This flag accepts a relative
path to a subset of your project as a string (glob patterns are allowed). When this flag
is used, ts-migrate ignores your project's default source files in favor of the ones
you've listed. It is effectively the same as replacing your tsconfig.json's `include`
property with the provided sources. The flag can be passed multiple times.


Options:
  -h,  -- help      Show help
  -i,  -- init      Initialize TypeScript (tsconfig.json) in <folder>
  -m,  -- migrate   Fix TypeScript errors, using codemods
  -rn, -- rename    Rename files in <folder> from JS/JSX to TS/TSX
  -ri, -- reignore  Re-run ts-ignore on a project

Examples:
  npm run adonis-v5-migrate -- --help                Show help
  npm run adonis-v5-migrate -- init foo     Create tsconfig.json file at foo/tsconfig.json
  npm run adonis-v5-migrate -- rename foo   Rename files in foo from JS/JSX to TS/TSX

```

# Reignore

If you are in a situation where you made some big project-wise changes, update of the common library like TypeScript, React or Redux or improve types for the large codebase. As a result of these operations, you might get quite a few TypeScript compilation errors. There are two ways to proceed:

 1) Fix all the errors (ideal, but time-consuming).
 2) Make the project compilable and fix errors gradually.

For the second option we created a re-ignore script, which will fully automate this step. It will add `any` or `@ts-expect-error` (`@ts-ignores`) comments for all problematic places and will make your project compilable.

Usage: `npx adonis-v5-migrate -- reignore`.

# Using `--sources` for partial migrations

There are times in which migrating an entire project is too large a change. The `--sources` flag (or `-s` for short) allows you to run `adonis-v5-migrate` on a subset of your project by providing a set of sources to override the defaults specified in your tsconfig. `--sources` takes a relative path from the root of your project. It accepts globs, but remember to wrap any globs with quotes.

```sh
# Run everything on a sub-directory
npx adonis-v5-migrate-full /path/to/your/project --sources "some/components/**/*"

# Or run just one sub-command
npx adonis-v5-migrate -- rename /path/to/your/project -s "some/components/**/*"
```

Because your project's default sources are ignored when `--sources` is used, it's a good idea to specify any ambient type files your project uses as well. Otherwise, `adonis-v5-migrate` might mark unidentifiable globals as type errors, even when they aren't. For example, re-including ambient types from your node_modules folder looks like this:

```sh
npx adonis-v5-migrate-full /path/to/your/project \
  --sources "some/components/**/*" \
  --sources "node_modules/**/*.d.ts"
```

# FAQ

> Can it magically figure out all the types?

Unfortunately, no, it is only so smart. It does figure out types from propTypes, but it will fall back to `any` (`$TSFixMe`) for things it can't figure it out.


> I ran ts-migrate on my code and see lots of `@ts-expect-error` (`@ts-ignores`) and `any`. Is that expected?

The ts-migrate codemods are only so smart. So, follow up is required to refine the types and remove the `any` (`$TSFixMe`) and `@ts-expect-error` (`@ts-ignores`). The hope is that it's a nicer starting point than from scratch and that it helps accelerate the TypeScript migration process.


> Um... adonis-v5-migrate broke my code! D:

Please file the [issue here](https://github.com/airbnb/ts-migrate/issues/new).


> What is `$TSFixMe`?

It's just an alias to `any`: `type $TSFixMe = any;`. We use it at Airbnb for simplifying the migration experience.
We also have the same alias for functions: `type $TSFixMeFunction = (...args: any[]) => any;`.


> How did you use adonis-v5-migrate?

With the help of the adonis-v5-migrate we were able to migrate the main part of the entire codebase to the AdonisJs v5. We were able to provide much better starting points in the migration for the huge applications (50k+ lines of codes) and they were migrated in one day!



# Contributing

See the [Contributors Guide](https://github.com/noname1908/adonis-v5-migrate/blob/main/CONTRIBUTING.md).