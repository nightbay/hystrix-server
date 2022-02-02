const sqlite3 = require('sqlite3');
const ipc = require('node-ipc');
const schedule = require('node-schedule');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process'); 

const config = {
  collector: "/usr/bin/hystrix-collect.bash",
  cutoff: 3,
  collectSchedule : '*/10 * * * * *',
  database : "/opt/hystrix-db"
};

let Hystrix = {
  db : setupDb(),
  ipc : null,
  app : express(),
  snapshot : null,
  reading : {}
};

Hystrix.ipc = createIpcServer(Hystrix);
Hystrix.ipc.server.start();

//Hystrix.reading = setupReading();

const captureJob = schedule.scheduleJob(config.collectSchedule, () => {
   Hystrix.reading = setupReading();
   const collector = spawn(config.collector, [`${Hystrix.ipc.config.socketRoot}${Hystrix.ipc.config.appspace}${Hystrix.ipc.config.id}`], 
   {
     stdio: 'ignore'
   });

   collector.on("close", () => {
     //console.log("current reading: ", Hystrix.reading);
     Hystrix.reading = Hystrix.reading.map( r => {
       if( r.status ){
         r.hum = formatHumidity(r.hum);
         r.temp = formatTemp(r.temp);  
       }
       return r;
     });
     let data = JSON.stringify(Hystrix.reading);
     let statement = `INSERT INTO Readings (timestamp, reading) VALUES (strftime('%s','now'), '${data}'); `;
     Hystrix.db.exec(statement);
   })  
 });

const cleanupJob = schedule.scheduleJob('* 1 * * * *', () => {
    let cutoff = new Date();
    cutoff = cutoff.setDate(cutoff.getDate() - config.cutoff);
    let statement = `DELETE FROM Readings WHERE timestamp <= ${Math.floor(cutoff/1000)}`
    Hystrix.db.exec(statement);
});

Hystrix.app.use(cors());

Hystrix.app.use(bodyParser.urlencoded({ extended: false }));
Hystrix.app.use(bodyParser.json());

Hystrix.app.use(express.static(__dirname + '/dist-prod'));

Hystrix.app.get('/api/readings', async (req, res, next) => {  
  let sql = `SELECT * FROM Readings
           ORDER BY timestamp DESC
           LIMIT 1`;

  let dbPromise = new Promise((resolve, reject) => {
    Hystrix.db.all(sql, [], (err, rows) => {
      if (err) {
        Hystrix.snapshot = {
          timestamp: new Date().toISOString(),
          status : "KO"
        };
      }
      else{
        rows.forEach((row) => {
          let rd = new Date( row.timestamp * 1000);
          let reading = row.reading;          
          Hystrix.snapshot = {
            reading : JSON.parse(row.reading),
            timestamp: rd.toISOString(),
            status : "OK"
          };
        });      
      }
      resolve(Hystrix.snapshot);      
    });    
  });

  res.json(await dbPromise);
});

Hystrix.app.post('/api/readings', async (req, res) => {
  let sql = `SELECT * FROM Readings `;
  let clause = "WHERE";

  const params = req.body;

  if( params.fromDate !== undefined ){
    let cutoff = Date.parse(params.fromDate);
    sql = `${sql} WHERE timestamp >= ${Math.floor(cutoff/1000)}`;
    clause = ' AND';
  }

  if( params.toDate !== undefined ){
    let cutoff = Date.parse(params.toDate);
    sql = `${sql} ${clause} timestamp <= ${Math.floor(cutoff/1000)}`;
  }

  let dbPromise = new Promise((resolve, reject) => {
    let result = {
      readings: [],
      status : "KO"
    };

    Hystrix.db.all(sql, [], (err, rows) => {
      if (err) {
      }
      else{
        result.status = "OK";
        rows.forEach((row) => {
          let rd = new Date( row.timestamp * 1000);
          
          result.readings.push({
            reading : JSON.parse(row.reading),
            timestamp: rd.toISOString(),
          });
        });      
      }
      resolve(result);
    });
  });


  res.json(await dbPromise);
});

Hystrix.app.listen(8080, function () {
  console.log('CORS-enabled web server listening on port 80')
});

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
          Object.assign( state, msg);
          Hystrix.reading = Hystrix.reading.map( obj => obj.chan == msg.chan ? state : obj);
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

function formatTemp( rawdata ){
  return rawdata/1000.0;
}

function formatHumidity( rawdata ){
  return rawdata/1000.0;
}

function setupReading(){
  let i = 0;
  let result = [];
  for ( i =0; i<9;i++){
    let channel = {};
    Object.assign( channel, {
      "chan" : i,
      "type": i < 4 ? "EC" : i < 8 ? "VOC" : "PM",
      "val" : 0,
      "temp" : 0,
      "hum" : 0,
      "status" : false
    });
    result.push(channel);
  }
  return result;
}

function setupDb() {
  let db = new sqlite3.Database(config.database, (err) => {
    if (err) {
      return null;
    }
    db.exec("CREATE TABLE IF NOT EXISTS Readings(timestamp INTEGER PRIMARY KEY AUTOINCREMENT, reading TEXT);");

  });

  return db;

}
