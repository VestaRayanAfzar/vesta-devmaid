import { execSync } from "child_process";
import { copySync, existsSync, mkdirpSync, readFileSync, rmdirSync, writeFileSync } from "fs-extra";
import * as gulp from "gulp";
import { join } from "path";

export type Transformer = (config: any, isProduction: boolean) => any;

export interface IPackagerConfig {
  root: string;
  src: string;
  files?: string[];
  publish: string;
  transform?: {
    package?: Transformer;
  };
}

export class Packager {
  private hasRan: boolean = false;
  // private tasks: any = {};
  private distBase = "vesta";

  constructor(private config: IPackagerConfig) {
    let tsconfigJson = JSON.parse(readFileSync("tsconfig.json", "utf8"));
    if (tsconfigJson.compilerOptions.outDir) {
      this.distBase = tsconfigJson.compilerOptions.outDir;
    } else {
      // tsconfigJson.compilerOptions.outDir = this.distBase;
      // writeFileSync("tsconfig.json", JSON.stringify(tsconfigJson, null, 2));
      throw new Error("tsconfig.json does not include the outDir option");
    }
  }

  public createTasks() {
    const exportedTasks: any = {};
    const { root, src } = this.config;
    // creating development tasks
    const dev = () => this.compile(false);
    // watch[es6]
    const watch = () => {
      const srcDirectory = `${root}/${src}/**/*`;
      gulp.watch(srcDirectory, () => this.compile(false));
      return Promise.resolve();
    };

    // creating production tasks
    const deploy = () => {
      this.log(`Starting production`);
      this.compile(true);
      this.log(`Finished production`);
      return Promise.resolve();
    };
    exportedTasks.deploy = deploy;
    // creating publish task
    const publish = () => {
      this.log(`Starting publish`);
      const publishParams = this.config.publish ? ` ${this.config.publish}` : "";
      this.exec(`npm publish${publishParams}`, this.distBase);
      this.log(`Finished publish`);
      return Promise.resolve();
    };
    exportedTasks.publish = gulp.series(deploy, publish);
    // exportedTasks.deplyAndPublish = gulp.series(deploy, publish);
    // exporting task list

    exportedTasks.default = gulp.series(dev, watch);

    exportedTasks.publish = publish;
    return exportedTasks;
  }

  private compile(isProduction: boolean) {
    this.log(`Starting compile...`);
    const destDirectory = join(this.distBase);
    if (isProduction || !this.hasRan) {
      this.hasRan = true;
      this.prepare(isProduction);
    }
    let tsc = `"${this.config.root}/${destDirectory}/node_modules/.bin/tsc"`;
    if (!existsSync(tsc)) {
      tsc = `"${this.config.root}/node_modules/.bin/tsc"`;
    }
    const result = this.exec(tsc, destDirectory);
    this.log(`Finished compile`);
    return Promise.resolve(result);
  }

  private prepare(isProduction: boolean) {
    this.log(`Starting prepare...`);
    const { root, files } = this.config;
    try {
      rmdirSync(this.distBase);
    } catch (e) {}
    try {
      mkdirpSync(this.distBase);
    } catch (e) {}
    // copying static files
    if (files) {
      for (let i = 0, il = files.length; i < il; ++i) {
        copySync(join(root, files[i]), `${this.distBase}/${files[i]}`);
      }
    }
    // package.json
    let packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    let needUpdate = false;
    if (this.config.transform && this.config.transform.package) {
      needUpdate = this.config.transform.package(packageJson, isProduction);
    }
    writeFileSync(`${this.distBase}/package.json`, JSON.stringify(packageJson, null, 2));
    // tsconfig.json
    // let tsconfigJson = JSON.parse(readFileSync("tsconfig.json", "utf8"));
    // if (this.config.transform && this.config.transform.tsconfig) {
    //     this.config.transform.tsconfig(tsconfigJson, isProduction);
    // }
    // creating relative path for tsc
    // include directories
    // let oldPath = tsconfigJson.include;
    // tsconfigJson.include = [];
    // for (let i = 0, il = oldPath.length; i < il; ++i) {
    //     tsconfigJson.include.push(relative(this.distBase, join(root, oldPath[i])));
    // }
    // overriding default options
    // tsconfigJson.compilerOptions.outDir = ".";
    // delete tsconfigJson.compilerOptions.outFile;
    // saving to file
    // writeFileSync(`${this.distBase}/tsconfig.json`, JSON.stringify(tsconfigJson, null, 2));
    // installing packages
    if (needUpdate) {
      this.exec("npm i", this.distBase);
    }
    this.log(`Finished prepare`);
  }

  private exec(command: string, cwd: string) {
    try {
      this.log(`${cwd}> ${command}`);
      execSync(command, { cwd, stdio: "inherit" });
      return true;
    } catch (e) {
      this.error("Error executing", e.message);
    }
    return false;
  }

  private log(message: string) {
    console.log(`[${this.getTime()}] ${message}`);
  }

  private error(message: string, error: string) {
    console.error(`[${this.getTime()}] ${message} (${error})`);
  }

  private getTime() {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  }
}
