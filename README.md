# [Vesta](http://vestarayanafzar.com) Development Assistant
 

## List of Utils
* TranspileAid

```javascript
const vesta = require('@vesta/devmaid');

let aid = new vesta.TranspileAid({
    targets: ['es5', 'es6'],
    files:['.npmignore','LICENSE','README.md']
});

aid.createTasks();
```

## All config options

```typescript
const aid = new vesta.TypescriptTarget({
    genIndex: true,
    targets: ['es6'],
    files: ['.npmignore', 'LICENSE', 'README.md'],
    transform: {
        package: (json, target) => {
            delete json.devDependencies['@types/gulp'];
            delete json.devDependencies['@types/node'];
            delete json.devDependencies['@types/fs-extra'];
        },
        tsconfig: (json, target) => {
            json.compilerOptions.outDir = './';
            json.exclude = json.exclude = ["node_modules", "**/*.d.ts", "**/*.js"];
        }
    },
    publish: '--access=public'
});

aid.createTasks();
```