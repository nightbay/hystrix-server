const sqlite3 = require('sqlite3').verbose();
const ipc = require('node-ipc');
const schedule = require('node-schedule');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
 
let Hystrix = {
  db : setupDb(),
  ipc : null,
  app : express(),
  snapshot : null
};

//Hystrix.;
Hystrix.ipc = createIpcServer(Hystrix.db);
Hystrix.ipc.server.start();


// const job = schedule.scheduleJob('*/10 * * * * *', () => {  
//   let sql = `SELECT * FROM Readings
//            ORDER BY timestamp DESC
//            LIMIT 1`;

//   Hystrix.db.all(sql, [], (err, rows) => {
//     if (err) {
//       throw err;
//     }
//     rows.forEach((row) => {
//       let rd = new Date( row.timestamp * 1000);
//       let reading = row.reading;
//       console.log(`${rd.toISOString()}: ${reading}`);
//     });
//   });
// });

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
    sql = `${sql} WHERE timestamp >= ${cutoff/1000}`;
    clause = ' AND';
  }

  if( params.toDate !== undefined ){
    let cutoff = Date.parse(params.toDate);
    sql = `${sql} ${clause} timestamp <= ${cutoff/1000}`;
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

function createIpcServer(database) {
  ipc.config.id = 'hystrix';
  ipc.config.retry = 1500;
  //ipc.config.rawBuffer = true;

  ipc.serve(
     () => {
      ipc.server.on(
        'message',
        function (data, socket) {
          ipc.log('got a message : '.debug, data);
          var statement = `INSERT INTO Readings (timestamp, reading) VALUES (strftime('%s','now'), '${data.toString().trim()}'); `;
          database.exec(statement);
        }
      );
      ipc.server.on(
        'socket.disconnected',
         (socket, destroyedSocketID) => {
          ipc.log('client ' + destroyedSocketID + ' has disconnected!');
        }
      );
    }
  );
  return ipc;
}

function setupDb() {
  let db = new sqlite3.Database('hystrix-db', (err) => {
    if (err) {
      return null;
    }
    db.exec("CREATE TABLE IF NOT EXISTS Readings(timestamp INTEGER PRIMARY KEY AUTOINCREMENT, reading TEXT);");

  });

  return db;

}
