import { readdirSync, readFileSync, statSync, writeFileSync } from "fs-extra";
import { createSourceFile, ScriptTarget, SyntaxKind } from "typescript";

interface IExp {
    isDefault?: boolean;
    isType?: boolean;
    name: string;
    typeGenerators: string;
}

interface IExpResult {
    expItems: IExp[];
    file: string;
}

export class Indexer {

    constructor(private dir: string) {
    }

    generate() {
        const items = this.parseFiles(this.dir);
        const codes: string[] = [];
        for (const item of items) {
            let { expItems, file } = item;
            file = file.replace(this.dir, '.').replace(/\.[\w\d]+$/, '');
            if (expItems.length) {
                const importables = expItems.filter(item => item.isType);
                const exportables = expItems.filter(item => !item.isType);
                if (importables.length) {
                    codes.push(`import { ${importables.map(imp => imp.name).join(", ")} } from "${file}";`);
                    for (const imp of importables) {
                        codes.push(`export type ${imp.name}${imp.typeGenerators} = ${imp.name}${imp.typeGenerators};`);
                    }
                }
                if (exportables.length) {
                    const names = exportables.map(item => `${item.isDefault ? "default as " : ""}${item.name}`);
                    codes.push(`export { ${names.join(", ")} } from "${file}";`);
                }
            }
        }


        writeFileSync(`${this.dir}/index.ts`, codes.join('\n'));
    }

    private parseFiles(path: string): IExpResult[] {
        let files = readdirSync(path);
        let exp: IExpResult[] = [];
        files.forEach(file => {
            if (file == 'index.ts') return;
            let filePath = `${path}/${file}`;
            let stat = statSync(filePath);
            if (stat.isDirectory()) {
                exp = exp.concat(this.parseFiles(filePath));
            } else {
                exp.push(this.parseFile(filePath));
            }
        });
        return exp;
    }

    private parseFile(file: string): IExpResult {
        let exports: IExp[] = [];
        let sourceCode = readFileSync(file, { encoding: 'utf8' }).toString();
        let srcFile = createSourceFile(file, sourceCode, ScriptTarget.ES2015, false);
        srcFile.forEachChild((node: any) => {
            let modifierKind = node.modifiers && node.modifiers[0].kind;
            let isType = false;
            if (modifierKind && modifierKind === SyntaxKind.ExportKeyword) {
                let name = "";
                switch (node.kind) {
                    case SyntaxKind.InterfaceDeclaration:
                    case SyntaxKind.TypeAliasDeclaration:
                        isType = true;
                    case SyntaxKind.ClassDeclaration:
                    case SyntaxKind.FunctionDeclaration:
                    case SyntaxKind.VariableDeclaration:
                    case SyntaxKind.EnumDeclaration:
                        name = node.name.text;
                        break;
                    case SyntaxKind.VariableStatement:
                        name = node.declarationList.declarations[0].name.text;
                        break;
                }
                // if (name === "IPackagerConfig") {
                //     const keys = ["modifiers", "typeParameters"];
                //     keys.forEach((key) => {
                //         console.log(`\n\t${key}\n`);
                //         console.log(node[key]);
                //         console.log(`\n`);
                //     })
                // }
                if (name) {
                    const item: IExp = { name, isType, typeGenerators: "" };
                    if (node.modifiers) {
                        for (let i = 0, il = node.modifiers.length; i < il; ++i) {
                            if (node.modifiers[i].kind === SyntaxKind.DefaultKeyword) {
                                item.isDefault = true;
                            }
                        }
                    }
                    if (node.typeParameters) {
                        const typeGenerators = [];
                        for (const param of node.typeParameters) {
                            typeGenerators.push(param.name.escapedText);
                        }
                        item.typeGenerators = `<${typeGenerators.join(", ")}>`;
                    }
                    exports.push(item);
                }
            }
        });
        return { expItems: exports, file };
    }
}
