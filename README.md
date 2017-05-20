# [Vesta](http://vestarayanafzar.com) Development Assistant
 

`gulpfile.js`:

```javascript
const vesta = require('@vesta/devmaid');

const config = {
    // source directory address - gulp.src(`${config.src}/**`)
    src: 'src',
   // In case of multiple classes, an index file will be generated which exports all exports
   genIndex: true,
   // this will transpile typescript into both targets, each one in their own directory
   // for es5, it appends the `-es5` to the end of your package name - Only if you have more than one target 
   targets: ['es5', 'es6'],
   // these files will be copied directly to the target folders
   files: ['.npmignore', 'LICENSE', 'README.md'],
   transform: {
       // if you need to modify `package.json` for each target 
       package: (json, target) => {
           if(target === 'es5'){
               json.dependencies.push('es6-promise', '^4.1.0');
           }
       },
       // if you need to modify `compilerOptions` of `tsconfig.json` for each target
       tsconfig: (json, target) => {
           if(process.env.mode === 'development'){
               json.sourceMap = true;
           }
       }
   },
   // `npm publish` arguments
   publish: '--access=public'
};

const aid = new vesta.TypescriptTarget();
aid.createTasks();
```

At this point based on your targets, multiple gulp tasks will be added to your gulp tasks:
   * **prepare**: creates folders for each target, copy files into it, and run `yarn install`
   * **dev:[target]**: starts development process for specific target
   * **publish**: publishes the project inside each target folder