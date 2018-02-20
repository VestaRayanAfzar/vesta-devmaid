# [Vesta](https://vestarayanafzar.com) npm module development assistant

This package will help you to create multi-targeted npm package with the same code base.

Let's conside a situation in which we want to generate module for both es5 and es6 names `awesome-module`.

* add `@vesta/devmaid` to your `devDependencies`
* inside your `gulpfile.js`:

```javascript
const vesta = require('@vesta/devmaid');

// In case of multiple classes, an index file will be generated which exports all you exported classes, functions, and variables
const indexer = new vesta.Indexer(`${__dirname}/src`);
indexer.generate();

// creating packages
const pkgr = new vesta.Packager({
    // root directory of project
    root: __dirname,
    // source directory path - relative from root directory
    src: 'src',
    // this will transpile typescript into both targets, each one in their own directory
    targets: ['es5', 'es6'],
    // these files will be copied directly to the target folders
    files: ['.npmignore', 'LICENSE', 'README.md'],
    transform: {
        // if you need to modify `package.json` for each target 
        package: (json, target) => {
            // modify package.json file based on your target
            if(target === 'es5'){
                json.dependencies.push('es6-promise', '^4.1.0');
                json.name = 'awesome-module-es5';
            }
       },
       // modify tsconfig.json file based on your target
       tsconfig: (json, target) => {
            // if you need to modify `compilerOptions` of `tsconfig.json` for each target
            if(process.env.mode === 'development'){
                json.sourceMap = true;
            }
        }
    }
});
// creating development & publish tasks
pkgr.createTasks();
```

At this point based on your targets, multiple tasks will be added:
* **dev:[target]**: starts development process for specific target
* **publish**: publishes the project inside each target folder

For `tsconfig` the following options will be override: `outFile`, `outDir`, and `target`