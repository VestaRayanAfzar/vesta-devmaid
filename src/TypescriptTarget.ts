import {execSync} from "child_process";
import * as fse from "fs-extra";
import * as fsPath from "path";
import * as gulp from "gulp";
import * as gts from "gulp-typescript";
import * as ts from "typescript";
import {Transform} from "stream";
export interface TransformFunction {
    (json: Object, target: string): void;
}

export interface TargetConfig {
    // regenerate index file
    genIndex?: boolean;
    // es5, es6, ...
    targets: Array<string>;
    // these files will be copied to destination
    files?: Array<string>;
    // source directory, where the index file will be generated
    src?: string;
    // modifying config files
    transform?: {
        package?: TransformFunction;
        module?: (target: string) => { [key: string]: string };
        tsconfig?: TransformFunction;
    },
    // npm publish arguments
    publish?: string;
}

interface ExportStatement {
    exports: Array<string>;
    file: string;
}

export class TypescriptTarget {
    private prefix = '\n >>>\t';
    private root;
    private tsconfig: gts.Settings;
    private redundantTsconfig = ['outFile', 'outDir'];

    constructor(private config: TargetConfig) {
        if (!config) {
            config = {targets: ['es6']};
        }
        if (!config.src) {
            config.src = 'src';
        }
        this.root = fsPath.dirname(config.src);
        let tsconfigPath = `${this.root}/tsconfig.json`;
        if (fse.existsSync(tsconfigPath)) {
            let tsc = JSON.parse(fse.readFileSync(tsconfigPath, {encoding: 'utf8'}));
            this.tsconfig = tsc.compilerOptions;
        } else {
            this.tsconfig = {
                module: 'commonjs',
                preserveConstEnums: true,
                declaration: true,
            };
        }
    }

    public createTasks() {
        const targets = this.config.targets;

        gulp.task('prepare', () => {
            this.createPrepareTask();
        });

        if (this.config.genIndex) {
            gulp.task('index', () => {
                this.createIndexTask();
            });
        }

        gulp.task('publish', () => {
            const publishArgs = this.config.publish || ' ';
            targets.forEach(target => {
                execSync(`npm publish ${publishArgs}`, {stdio: 'inherit', cwd: target});
            });
        });
        let watchSourceFiles = [`${this.config.src}/**`];
        let modifiedSourceFile = this.config.genIndex ? watchSourceFiles.concat([`!${this.config.src}/index.ts`]) : watchSourceFiles;
        targets.forEach(target => {
            gulp.task(`dev:${target}`, this.config.genIndex ? ['index'] : [], () => {
                require('child_process').execSync(`"node_modules/.bin/gulp" tsc:${target}`, {cwd: target, stdio: 'inherit'});
            });
            gulp.watch(modifiedSourceFile, {cwd: this.root}, [`dev:${target}`]);
        });
    }


    private module(module: { [key: string]: string }): Transform {
        return new Transform({
            objectMode: true,
            transform: function (file: any, encoding, callback) {
                if (file.contents) {
                    file.contents = new Buffer(file.contents.toString().replace(/((import)|(export))(\s*.*from\s*)(["'])([^"']*)(["'])/ig, function (match, $1, $2, $3, $4, $5, $6, $7) {
                        let replace = `${$1}${$4}${$5}${module[$6] ? module[$6] : $6}${$7}`;
                        // if (module[$6]) console.log(match, ' => ', replace);
                        return replace;
                    }));
                }
                this.push(file);
                callback();
            }
        });
    }

    private createPrepareTask() {
        this.config.targets.forEach(target => {
            this.log(`Preparing ${target}...`);
            try {
                // delete old directories
                fse.removeSync(target);
                fse.mkdirpSync(`${this.root}/${target}`);
            } catch (e) {
                this.error(e.message);
                process.exit();
            }
            // copy common files
            if (this.config.files) {
                this.config.files.forEach(file => fse.copySync(file, `${target}/${file}`));
            }
            if (fse.existsSync(`resource/${target}/gulpfile.js`)) {
                fse.copySync(`resource/${target}/gulpfile.js`, `${target}/gulpfile.js`);
            } else {
                fse.copySync(`resource/gulpfile.js`, `${target}/gulpfile.js`);
            }

            if (fse.existsSync(`resource/${target}/options.json`)) {
                fse.copySync(`resource/${target}/options.json`, `${target}/options.json`);
            } else {
                let compilerOptions: gts.Settings = JSON.parse(JSON.stringify(this.tsconfig));
                compilerOptions.target = target;
                let json = {
                    modules: this.config.transform.module ? this.config.transform.module(target) : {},
                    compilerOptions: compilerOptions,
                    src: [`../${this.config.src}/**`]
                };
                fse.writeFileSync(`${target}/options.json`, JSON.stringify(json), {encoding: 'utf8'});
            }


            // modifying package.json based on target
            this.transformTsc(target);
            this.transformPkg(target);
        });
        // installing packages
        this.config.targets.forEach(target => {
            this.log(`Installing packages for ${target}`);
            execSync('yarn install', {stdio: 'inherit', cwd: target});
        });
    }

    private transformTsc(target: string): gts.Settings {
        let json: gts.Settings = JSON.parse(JSON.stringify(this.tsconfig));
        let transformers = this.config.transform;
        if (transformers && transformers.tsconfig) {
            transformers.tsconfig(json, target);
        }
        json.target = target;
        this.redundantTsconfig.forEach(config => delete json[config]);
        return json;
    }

    private transformPkg(target: string) {
        let json = JSON.parse(fse.readFileSync('./package.json', {encoding: 'utf8'}));
        if (target === 'es5') {
            // only append `-es5` if there is an es6 target
            if (this.config.targets.length > 1) {
                json.name += '-es5';
            }
        }
        delete json.scripts;
        let transformers = this.config.transform;
        if (transformers && transformers.package) {
            transformers.package(json, target);
        }
        fse.writeFileSync(`./${target}/package.json`, JSON.stringify(json, null, 2));
    }

    private createIndexTask() {
        const src = this.config.src;
        let contents = this.getAllExports(src);
        let codes = [];
        contents.forEach(({exports, file}) => {
            file = file.replace(src, '.').replace(/\.[\w\d]+$/, '');
            codes.push(`export {${exports.join(', ')}} from "${file}";`);
        });
        fse.writeFileSync(`${src}/index.ts`, codes.join('\n'));
    }

    private getAllExports(path: string): Array<ExportStatement> {
        let files = fse.readdirSync(path);
        let contents = [];
        files.forEach(file => {
            if (this.config.genIndex && file == 'index.ts') return;
            let filePath = `${path}/${file}`;
            let stat = fse.statSync(filePath);
            if (stat.isDirectory()) {
                contents = contents.concat(this.getAllExports(filePath));
            } else {
                contents.push(this.getExports(filePath));
            }
        });
        return contents;
    }

    private getExports(file: string): ExportStatement {
        let exports = [];
        let sourceCode = fse.readFileSync(file, {encoding: 'utf8'}).toString();
        let srcFile: ts.SourceFile = ts.createSourceFile(file, sourceCode, ts.ScriptTarget.ES2015, false);
        srcFile.forEachChild((node: ts.Node) => {
            let modifierKind = node.modifiers && node.modifiers[0].kind;
            if (modifierKind && modifierKind === ts.SyntaxKind.ExportKeyword) {
                switch (node.kind) {
                    case ts.SyntaxKind.InterfaceDeclaration:
                    case ts.SyntaxKind.ClassDeclaration:
                    case ts.SyntaxKind.FunctionDeclaration:
                    case ts.SyntaxKind.VariableDeclaration:
                    case ts.SyntaxKind.EnumDeclaration:
                        exports.push((<ts.Declaration>node).name['text']);
                        break;
                    case ts.SyntaxKind.VariableStatement:
                        exports.push((<ts.VariableStatement>node).declarationList.declarations[0].name['text']);
                }
            }
        });
        return {exports, file};
    }

    private log(message: string) {
        process.stdout.write(`${this.prefix}${message}\n`);
    }

    private error(message: string) {
        process.stderr.write(`${this.prefix}${message}\n`);
    }
}
