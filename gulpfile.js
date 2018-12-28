const gulp = require("gulp");
const { genIndex } = require("./build/Indexer");
const { Packager } = require("./build/Packager");

// creating packages
const pkgr = new Packager({
    root: __dirname,
    src: "src",
    files: [".npmignore", "LICENSE", "README.md"],
    publish: "--access=public",
    transform: {
        package: (json) => {
            delete json.private;
            return false;
        },
        tsconfig: function(tsconfig, isProduction) {
            // tsconfig.compilerOptions.module = "umd";
        }
    }
});
const tasks = pkgr.createTasks();

// creating index file
function indexer() {
    genIndex("src");
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