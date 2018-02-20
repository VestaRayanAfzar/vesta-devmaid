const Indexer = require('./build/Indexer').Indexer;
const Packager = require('./build/Packager').Packager;

// creating index file
const indexer = new Indexer(`${__dirname}/src`);
indexer.generate();

// creating packages
const pkgr = new Packager({
    root: __dirname,
    src: "src",
    targets: ['es6'],
    files: ['.npmignore', 'LICENSE', 'README.md'],
    publish: "--access=public",
    transform: {
        package: (json, target) => {
            json.devDependencies = {};
            delete json.private;
        },
        tsconfig: function (tsconfig, target, isProduction) {
            tsconfig.compilerOptions.outDir = ".";
        }
    }
});

pkgr.createTasks();