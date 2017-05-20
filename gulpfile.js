const vesta = require('./build/TypescriptTarget');

const aid = new vesta.TypescriptTarget({
    genIndex: true,
    targets: ['es6'],
    files: ['.npmignore', 'LICENSE', 'README.md'],
    transform: {
        package: (json, target) => {
            json.devDependencies = {};
        }
    },
    publish: '--access=public'
});

aid.createTasks();