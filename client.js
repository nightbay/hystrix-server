const ipc = require('node-ipc');

ipc.config.id = 'hystrix';
ipc.config.retry = 1500;
//ipc.config.rawBuffer = true;

ipc.connectTo(
    'hystrix',
    function () {
        ipc.of.hystrix.on(
            'connect',
            function () {
                ipc.log('## connected to world ##'.rainbow, ipc.config.delay);
                ipc.of.hystrix.emit(
                    'message',  //any event or message type your server listens for
                    JSON.stringify(generateTmpl())
                )
            }
        );
        ipc.of.hystrix.on(
            'disconnect',
            function () {
                ipc.log('disconnected from world'.notice);
            }
        );
        ipc.of.hystrix.on(
            'message',  //any event or message type your server listens for
            function (data) {
                ipc.log('got a message from world : '.debug, data);
            }
        );
    }
);

const chan_type = [
    "EC",
    "EC",
    "EC",
    "EC",
    "VOC",
    "VOC",
    "VOC",
    "VOC",
    "PM"
];

const chan_code = [
    0,
    0,
    0,
    0,
    4,
    3,
    6,
    2,
    0
];

function generateTmpl() {
    let res = [];
    let i = 0;
    for( i = 0; i < 9; i++){
        res.push(
            {
                chan: i,
                type: chan_type[i],
                code: chan_code[i],
                val: Math.random(),
                temp: Math.random() * 22,
                hum: Math.random() * 60,
                status: i % 2 ? true : false
            }
        );
    }
    return  res;
}

