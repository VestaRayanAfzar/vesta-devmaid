const gulp = require("gulp");
const { Indexer } = require("./build/Indexer");
const { Packager } = require("./build/Packager");

console.log(Packager);

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
const tasks = pkgr.createTasks();

// creating index file
function indexer() {
    const indexer = new Indexer("src");
    indexer.generate();
    return Promise.resolve();
}

function watch() {
    gulp.watch(["src/**/*", "!src/index.ts"], indexer);
    return Promise.resolve();
}

module.exports = {
    default: gulp.series(indexer, tasks.default, watch),
    publish: gulp.series(indexer, tasks.deploy, tasks.publish)
}