const { Deepstream } = require('@deepstream/server')

const server = new Deepstream({logLevel: "INFO"});

server.start();
