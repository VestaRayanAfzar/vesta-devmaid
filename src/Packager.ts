import { execSync } from "child_process";
import { copySync, existsSync, readFileSync, writeFileSync } from "fs-extra";
import { series, watch } from "gulp";
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
    private hasRan: any = {};
    private tasks: any = {};
    private distBase = "vesta";
    private mainTarget = "";

    constructor(private config: IPackagerConfig) {
    }

    public createTasks() {
        const { targets, root, src } = this.config;
        // creating development tasks
        for (const target of targets) {
            // conside first target as main
            if (!this.mainTarget) {
                this.mainTarget = target;
            }
            // dev[es6]
            this.tasks[`dev[${target}]`] = () => this.compile(target, false);
            // watch[es6]
            this.tasks[`watch[${target}]`] = () => {
                const srcDirectory = `${root}/${src}/**/*`;
                watch(srcDirectory, () => this.compile(target, false));
                return Promise.resolve();
            }
        }
        // creating publish task
        const publish = () => {
            this.log(`Starting publish`);
            for (const target of targets) {
                this.compile(target, true);
            }
            const destDirectory = join(this.distBase, this.mainTarget);
            const publishParams = this.config.publish ? ` ${this.config.publish}` : "";
            this.exec(`npm publish${publishParams}`, destDirectory);
            this.log(`Finished publish`);
            return Promise.resolve();
        }
        // exporting task list
        const exportedTasks: any = {};
        for (const target of targets) {
            let taskName = `dev[${target}]`;
            if (target === this.mainTarget) {
                taskName = "default";
            }
            exportedTasks[taskName] = series(this.tasks[`dev[${target}]`], this.tasks[`watch[${target}]`]);
        }
        exportedTasks.publish = publish;
        return exportedTasks;
    }

    private compile(target: string, isProduction: boolean) {
        this.log(`Starting compile[${target}]`);
        const isMain = target === this.mainTarget;
        const destDirectory = join(this.distBase, this.mainTarget, isMain ? "" : target);
        if (isProduction || !this.hasRan[target]) {
            this.hasRan[target] = true;
            this.prepare(target, isProduction);
        }
        let tsc = `"${this.config.root}/${destDirectory}/node_modules/.bin/tsc"`;
        if (!existsSync(tsc)) {
            tsc = `"${this.config.root}/node_modules/.bin/tsc"`
        }
        const result = this.exec(tsc, destDirectory);
        this.log(`Finished compile[${target}]`);
        return Promise.resolve(result);
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
        if (isMain && files) {
            for (let i = 0, il = files.length; i < il; ++i) {
                copySync(join(root, files[i]), `${destDirectory}/${files[i]}`);
            }
        }
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
            tsconfigJson.include.push(relative(destDirectory, join(root, oldPath[i])));
        }
        // overriding default options
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
