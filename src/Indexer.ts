import { readdirSync, readFileSync, statSync, writeFileSync } from "fs-extra";
import { createSourceFile, ScriptTarget, SyntaxKind, isLabeledStatement } from "typescript";

interface IExportItem {
    name: string;
    isDefault: boolean;
}

export class Indexer {

    constructor(private dir: string) {
    }

    generate() {
        const contents = this.getAllExports(this.dir);
        const codes: string[] = [];
        contents.forEach(({ exports, file }) => {
            file = file.replace(this.dir, '.').replace(/\.[\w\d]+$/, '');
            if (exports.length) {
                codes.push(`export { ${exports.join(", ")} } from "${file}";`);
            }
        });
        writeFileSync(`${this.dir}/index.ts`, codes.join('\n'));
    }

    private getAllExports(path: string) {
        let files = readdirSync(path);
        let contents: any[] = [];
        files.forEach(file => {
            if (file == 'index.ts') return;
            let filePath = `${path}/${file}`;
            let stat = statSync(filePath);
            if (stat.isDirectory()) {
                contents = contents.concat(this.getAllExports(filePath));
            } else {
                contents.push(this.getExportsOfSingleFile(filePath));
            }
        });
        return contents;
    }

    private getExportsOfSingleFile(file: string) {
        let exports: string[] = [];
        let sourceCode = readFileSync(file, { encoding: 'utf8' }).toString();
        let srcFile = createSourceFile(file, sourceCode, ScriptTarget.ES2015, false);
        srcFile.forEachChild((node: any) => {
            let modifierKind = node.modifiers && node.modifiers[0].kind;
            if (modifierKind && modifierKind === SyntaxKind.ExportKeyword) {
                let name = "";
                switch (node.kind) {
                    case SyntaxKind.InterfaceDeclaration:
                    case SyntaxKind.ClassDeclaration:
                    case SyntaxKind.FunctionDeclaration:
                    case SyntaxKind.VariableDeclaration:
                    case SyntaxKind.EnumDeclaration:
                    case SyntaxKind.TypeAliasDeclaration:
                        name = node.name.text;
                        break;
                    case SyntaxKind.VariableStatement:
                        name = node.declarationList.declarations[0].name.text;
                        break;
                }
                if (name) {
                    let isDefault = false;
                    if (node.modifiers) {
                        for (let i = 0, il = node.modifiers.length; i < il; ++i) {
                            if (node.modifiers[i].kind === SyntaxKind.DefaultKeyword) {
                                name = `default as ${name}`;
                            }
                        }
                    }
                    exports.push(name);
                }
            }
        });
        return { exports, file };
    }
}
