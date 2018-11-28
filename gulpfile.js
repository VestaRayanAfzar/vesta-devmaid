const Indexer = require("./build/Indexer").Indexer;
const Packager = require("./build/Packager").Packager;

// creating index file
const indexer = new Indexer(`${__dirname}/src`);
indexer.generate();

// creating packages
const pkgr = new Packager({
    root: __dirname,
    src: "src",
    targets: ["es6"],
    files: [".npmignore", "LICENSE", "README.md"],
    publish: "--access=public",
    transform: {
        package: (json, target) => {
            json.devDependencies = {};
            delete json.private;
            return false;
        },
        tsconfig: function(tsconfig, target, isProduction) {
            tsconfig.target = target;
            // tsconfig.module = "umd";
        }
    }
});

module.exports = pkgr.createTasks();