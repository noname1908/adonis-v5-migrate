import fs from 'fs';
import path from 'path';
import log from 'updatable-log';

interface InitParams {
  rootDir: string;
}

const defaultConfig = `{
  "extends": "./node_modules/adonis-preset-ts/tsconfig",
  "include": ["**/*"],
  "exclude": ["node_modules", "build"],
  "compilerOptions": {
    "outDir": "build",
    "rootDir": "./",
    "sourceMap": true,
    "paths": {
      "App/*": ["./app/*"],
      "Config/*": ["./config/*"],
      "Contracts/*": ["./contracts/*"],
      "Database/*": ["./database/*"]
    },
    "types": [
      "@adonisjs/core",
      "@adonisjs/repl"
    ]
  }
}
`;

export default function init ({ rootDir }: InitParams) {
  if (!fs.existsSync(rootDir)) {
    log.error(`${rootDir} does not exist`);
    return;
  }

  const configFile = path.resolve(rootDir, 'tsconfig.json');
  if (fs.existsSync(configFile)) {
    log.info(`Config file already exists at ${configFile}`);
    return;
  }

  fs.writeFileSync(configFile, defaultConfig);

  log.info(`Config file created at ${configFile}`);
}
