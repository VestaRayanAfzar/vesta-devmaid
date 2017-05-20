import {execSync} from "child_process";
import * as fse from "fs-extra";
import * as fsPath from "path";
import * as gulp from "gulp";
import * as gts from "gulp-typescript";
import * as ts from "typescript";
import * as map from "gulp-sourcemaps";

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
    src: string;
    // modifying config files
    transform?: {
        package?: TransformFunction;
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

    constructor(private config: TargetConfig) {
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
        const sourceFiles = [`${this.config.src}/**`];
        targets.forEach(target => {
            const tsconfig = this.transformTsc(target);
            const genIndex = this.config.genIndex;
            const genSourceMap = tsconfig.sourceMap;
            gulp.task(`tsc:${target}`, genIndex ? ['index'] : [], () => {
                let src = gulp.src(sourceFiles);
                if (genSourceMap) src = src.pipe(map.init(src));
                let result: gts.CompileStream = src.pipe(gts(tsconfig));
                result.dts.pipe(gulp.dest(target));
                return (genSourceMap ? result.js.pipe(map.write()) : result.js).pipe(gulp.dest(target));
            });
            let modifiedSourceFile = genIndex ? sourceFiles.concat([`!${this.config.src}/index.ts`]) : sourceFiles;
            gulp.task(`dev:${target}`, [`tsc:${target}`], () => {
                gulp.watch(modifiedSourceFile, [`tsc:${target}`]);
            });
        });
    }

    private createPrepareTask() {
        this.config.targets.forEach(target => {
            this.message(`Preparing ${target}...`);
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
            // modifying package.json based on target
            this.transformTsc(target);
            this.transformPkg(target);
        });
        // installing packages
        this.config.targets.forEach(target => {
            this.message(`Installing packages for ${target}`);
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
        return json;
    }

    private transformPkg(target: string) {
        let json = JSON.parse(fse.readFileSync('./package.json', {encoding: 'utf8'}));
        if (target === 'es5') {
            // only append `-es5` if there is an es6 target
            if (this.config.targets.length > 1) {
                json.name += '-es5';
            }
            json.devDependencies.typescript = '2.0';
            json.devDependencies['@types/es6-promise'] = '^0.0.32';
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

    private message(message: string) {
        process.stdout.write(`${this.prefix}${message}\n`);
    }

    private error(message: string) {
        process.stderr.write(`${this.prefix}${message}\n`);
        console.error(message);
    }
}
