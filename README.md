# [Vesta](https://vestarayanafzar.com) npm module development assistant

This package will help you to create multi-targeted npm package with the same code base.

Let's consider a situation in which we want to generate module for both es5 and es6 named `awesome-module`.

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
    // for the following targets, these gulp tasks will be created: dev[es6], dev[es5], watch[es6], watch[es5], publish
    targets: ['es6', 'es5'],
    // these files will be copied directly to the target folders
    files: ['.npmignore', 'LICENSE', 'README.md'],
    transform: {
        // if you need to modify `package.json` for each target 
        package: (json, target) => {
            // modify package.json file based on your target
            if(target === 'es5'){
                json.dependencies['es6-promise'] = '^4.1.0';
            }
            // return true if the devmaid should execute npm install on new package.json file
            return true;
       },
       // modify tsconfig.json file based on your target
       tsconfig: (json, target) => {
            // if you need to modify `compilerOptions` of `tsconfig.json` for each target
            if(process.env.mode === 'development'){
                json.compilerOptions.sourceMap = true;
            }
        }
    }
});
// creating development & publish tasks
module.exports = pkgr.createTasks();
```

use `gulp --tasks` to see list of generated tasks.

At this point based on your targets, multiple tasks will be added:
* **dev:[target]**: starts development process for specific target
* **publish**: publishes the project
The published project is only specific for the first target, a sub directory will be generated
for any of other targets. You may use alias naming in your bundler to choose the appropriate directory.


For `tsconfig` the following options will be override: `outFile`, `outDir`