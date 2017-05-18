import * as gulp from "gulp";
import * as fse from "fs-extra";
import * as ts from "typescript";
import {execSync} from "child_process";
import * as fsPath from "path";

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

    constructor(private config: TargetConfig) {
        if (!config.src) {
            config.src = 'src';
        }
        this.root = fsPath.dirname(config.src);
    }

    public createTasks() {
        const sourceFiles = [`${this.config.src}/**`];
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

        targets.forEach(target => {
            gulp.task(`copy:${target}`, this.config.genIndex ? ['index'] : [], () => gulp.src(sourceFiles).pipe(gulp.dest(target)));
            gulp.task(`watch:${target}`, () => {
                gulp.watch(sourceFiles, [`copy:${target}`]);
            });
            gulp.task(`dev:${target}`, [`copy:${target}`, `watch:${target}`], () => {
                execSync('node node_modules/typescript/bin/tsc -w -p .', {stdio: 'inherit', cwd: target});
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

    private transformTsc(target: string) {
        let json = JSON.parse(fse.readFileSync('./tsconfig.json', {encoding: 'utf8'}));
        json.compilerOptions.target = target;
        let transformers = this.config.transform;
        if (transformers && transformers.tsconfig) {
            transformers.tsconfig(json, target);
        }
        json.include = json.include.map(inc => inc.replace(`${this.config.src}/`, ''));
        fse.writeFileSync(`./${target}/tsconfig.json`, JSON.stringify(json, null, 2));
    }

    private transformPkg(target: string) {
        let json = JSON.parse(fse.readFileSync('./package.json', {encoding: 'utf8'}));
        if (target === 'es5') {
            json.name += '-es5';
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
        if (this.config.genIndex) {
            fse.removeSync(`${src}/index.ts`);
        }
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
    }
}
