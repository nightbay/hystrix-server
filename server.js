const ipc = require('node-ipc');

let Hystrix = {
    ipc: null,
    reading: {}
};

Hystrix.ipc = createIpcServer(Hystrix);
Hystrix.ipc.server.start();

Hystrix.reading = setupReading();

function setupReading() {
    let i = 0;
    let result = [];
    for (i = 0; i < 9; i++) {
        let channel = {};
        Object.assign(channel, {
            "chan": i,
            "type": i < 4 ? "EC" : i < 8 ? "VOC" : "PM",
            "val": 0,
            "temp": 0,
            "hum": 0,
            "status": false
        });
        result.push(channel);
    }
    return result;
}

function createIpcServer() {
    ipc.config.id = 'hystrix';
    ipc.config.retry = 1500;
    ipc.config.rawBuffer = true;

    ipc.serve(
        () => {
            ipc.server.on(
                'data',
                // function (data, socket) {
                //   ipc.log('got a message : '.debug, data);
                //   var statement = `INSERT INTO Readings (timestamp, reading) VALUES (strftime('%s','now'), '${data.toString().trim()}'); `;
                //   database.exec(statement);
                // }
                (data, socket) => {
                    //ipc.log('got a message : '.debug, data);
                    let msg = JSON.parse(data.toString().trim());
                    //console.log("before assign: ", Hystrix.reading[msg.chan])
                    let state = Hystrix.reading[msg.chan];
                    Object.assign(state, msg);
                    Hystrix.reading = Hystrix.reading.map(obj => obj.chan == msg.chan ? state : obj);
                    console.log("after assign: ", Hystrix.reading[msg.chan]);
                }
            );
            // ipc.server.on(
            //   'socket.disconnected',
            //    (socket, destroyedSocketID) => {
            //     ipc.log('client ' + destroyedSocketID + ' has disconnected!');
            //   }
            // );
        }
    );
    return ipc;

}