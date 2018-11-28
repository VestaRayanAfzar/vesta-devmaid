import { execSync } from "child_process";
import { copySync, existsSync, readFileSync, writeFileSync } from "fs-extra";
import { join, relative } from "path";
const mkdir = require("mkdirp");
const rimraf = require("rimraf");

export type Transformer = (config: any, target: string, isProduction: boolean) => any;

export interface IPackagerConfig {
    root: string;
    src: string;
    targets: Array<string>;
    files?: Array<string>;
    publish: string;
    transform?: {
        package?: Transformer;
        tsconfig?: Transformer;
    }
}

export class Packager {
    private firstRun: any = {};
    private distBase = "vesta";
    private mainTarget = "";

    constructor(private config: IPackagerConfig) {
    }

    public createTasks() {
        // creating development tasks
        this.config.targets.forEach(target => {
            if (!this.mainTarget) {
                this.mainTarget = target;
            }
            // task(`dev[${target}]`, () => {
            // const { root, src } = this.config;
            this.compile(target, false);
            // const srcDirectory = `${root}/${src}/**/*`;
            // watch(srcDirectory, () => {
            //     this.compile(target, false);
            // });
            // });
        });
        // creating publish task
        // task("publish", () => {
        //     // this.config.targets.forEach(target => {
        //     this.publish(this.config.targets[0]);
        //     // });
        // });
    }

    private compile(target: string, isProduction: boolean) {
        this.log(`Starting compile[${target}]`);
        const isMain = target === this.mainTarget;
        const destDirectory = join(this.distBase, this.mainTarget, isMain ? "" : target);
        if (isProduction || this.firstRun[target]) {
            this.firstRun[target] = false;
            this.prepare(target, isProduction);
        }
        let tsc = `"${this.config.root}/${destDirectory}/node_modules/.bin/tsc"`;
        if(!existsSync(tsc)){
            tsc = `"${this.config.root}/node_modules/.bin/tsc"`
        }
        this.exec(tsc, destDirectory);
        this.log(`Finished compile[${target}]`);
    }

    private publish(target: string) {
        this.log(`Starting publish[${target}]`);
        // const destDirectory = join(this.config.root, this.distBase, target);
        const destDirectory = relative(__dirname, join(this.config.root, this.distBase, target));
        this.compile(target, true);
        const publishParams = this.config.publish ? ` ${this.config.publish}` : "";
        this.exec(`npm publish${publishParams}`, destDirectory);
        this.log(`Finished publish[${target}]`);
    }

    private prepare(target: string, isProduction: boolean) {
        this.log(`Starting prepare[${target}]`);
        const { root, files } = this.config;
        const isMain = target === this.mainTarget;
        const destDirectory = join(root, this.distBase, this.mainTarget, isMain ? "" : target);
        if (isProduction) {
            rimraf.sync(destDirectory);
        }
        mkdir.sync(destDirectory);
        // copying static files
        isMain && files && files.forEach(file => {
            copySync(join(root, file), `${destDirectory}/${file}`);
        });
        // package.json
        let packageJson = JSON.parse(readFileSync("package.json", "utf8"));
        let needUpdate = false;
        if (this.config.transform && this.config.transform.package) {
            needUpdate = this.config.transform.package(packageJson, target, isProduction);
        }
        writeFileSync(`${destDirectory}/package.json`, JSON.stringify(packageJson, null, 2));
        // tsconfig.json
        const tsConfFile = existsSync(`tsconfig.${target}.json`) ? `tsconfig.${target}.json` : "tsconfig.json";
        let tsconfigJson = JSON.parse(readFileSync(tsConfFile, "utf8"));
        if (this.config.transform && this.config.transform.tsconfig) {
            this.config.transform.tsconfig(tsconfigJson, target, isProduction);
        }
        // creating relative path for tsc
        // include directories
        let oldPath = tsconfigJson.include;
        tsconfigJson.include = [];
        for (let i = 0, il = oldPath.length; i < il; ++i) {
            tsconfigJson.include.push(relative(join(root, this.distBase, target), join(root, oldPath[i])));
        }
        // overriding default options
        // tsconfigJson.compilerOptions.target = target;
        tsconfigJson.compilerOptions.outDir = ".";
        delete tsconfigJson.compilerOptions.outFile;
        // saving to file
        writeFileSync(`${destDirectory}/tsconfig.json`, JSON.stringify(tsconfigJson, null, 2));
        // installing packages
        if (needUpdate) {
            this.exec("npm i", destDirectory);
        }
        this.log(`Finished prepare[${target}]`);
    }

    private exec(command: string, cwd: string) {
        try {
            console.log(`${cwd}> ${command}`);
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
