const Sequelize = require('sequelize');
const config = require('./config');
const express = require('express');
const app = express();
const path = require('path');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const Distance = require('geo-distance');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname,'/static')));
app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({
    extended: true
}));
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { Expo } = require('expo-server-sdk');
let expo = new Expo();
const sequelize = new Sequelize(config.dbName, config.dbUser, config.dbPass, {
    host: config.dbHost,
    dialect: 'mysql',

    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    logging: false,
    // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
    operatorsAliases: false
});

const User = sequelize.define('user', {
    username: {type: Sequelize.STRING, allowNull: false},
    email: {type: Sequelize.STRING, allowNull: false},
    password: {type: Sequelize.STRING, allowNull: false},
    name: {type: Sequelize.STRING, allowNull: false},
    notificationKey: {type: Sequelize.STRING, allowNull: true}
}, {
    instanceMethods: {
        getPass: function () {
            return this.password;
        }
    }
});

const Alarm = sequelize.define('alarm', {
    uid: {type: Sequelize.STRING, allowNull: false},
    name: {type: Sequelize.STRING, allowNull: true},
    addressName: {type: Sequelize.STRING, allowNull: true},
    long: {type: Sequelize.DOUBLE, allowNull: true},
    lat: {type: Sequelize.DOUBLE, allowNull: true},
    status: {type: Sequelize.STRING, allowNull: true},
    comments: {type: Sequelize.STRING, allowNull: true},
    detectedAt: {type: 'TIMESTAMP', allowNull: true}
}, {
  instanceMethods: {
    getStatus: function () {
      return this.status;
    }
  }
});

const AlarmRegistration = sequelize.define('alarm_registration', {});


AlarmRegistration.belongsTo(User);
AlarmRegistration.belongsTo(Alarm);
Alarm.hasMany(AlarmRegistration);
User.hasMany(AlarmRegistration);

// User.hasOne(Alarm, {
//   foreignKey: 'user',
//   foreignKeyConstraint: true
// });

const EmergencyService = sequelize.define('emergency_service', {
   name: {type: Sequelize.STRING, allowNull: false},
    long: {type: Sequelize.DOUBLE, allowNull: false},
    lat: {type: Sequelize.DOUBLE, allowNull: false},
    email: {type: Sequelize.STRING, allowNull: false},
    password: {type: Sequelize.STRING, allowNull: false},
    maxDistance: {type: Sequelize.DOUBLE, allowNull: false}
});

// const AlarmRegs = sequelize.define('alarm_registrations', {
//     comments: {type: Sequelize.STRING, allowNull: false}
// })

// Alarm.belongsToMany(User, {through: AlarmRegs});

sequelize.sync()
    .then(function() {
            server.listen(config.port, '0.0.0.0', () => console.log(`Fire Alarm server listening on port ${config.port}`));
        }
    );

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/login', function (req, res) {
    console.log(`/login ${req.body}`);
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(function (usr) {
        console.log(JSON.stringify(usr));
        if (req.body.password === usr.password){
            console.log("Correct");
            res.setHeader('Content-Type', 'application/json');
            // res.statusText = JSON.stringify(usr);
            res.status(200).end(JSON.stringify({user: usr, message: "Correct"}));
        } else {
            res.status(400).end(JSON.stringify({message: "Incorrect"}));
        }
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
        res.status(400).end(JSON.stringify({message: "User doesn't exist"}));
    });
});

app.post('/signup', function (req, res) {
    if (!(req.body.username && req.body.email && req.body.password && req.body.password && req.body.name))
    {
        res.status(400).send("Missing options");
    }
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(usr => {
      if (!usr) {
        User.create({username: req.body.username, email: req.body.email, password: req.body.password, name: req.body.name})
            .then(function (user) {
                res.status(200).send(JSON.stringify({user: user, message: "Correct"}));
            })
            .catch(function () {
                res.status(500).send("Something went wrong");
            });
        }  else {
          res.status(400).send(JSON.stringify({message: "User already exists"}));
        }
    });
});

app.post('/registerDevice', function(req, res) {
    let body = req.body;
    console.log(body);
    if (!(body.loc.lng && body.loc.lat && body.uid))
    {
      res.status(400).send(JSON.stringify({message: "Missing options"}));
      return;
    }
    Alarm.update({
      name: body.name,
      addressName: body.addressName,
      long: body.loc.lng,
      lat: body.loc.lat,
      status: 'connected',
      comments: body.comments !== "" ? body.comments : ""
    }, {
        where: {
            uid: body.uid
        }
    }).then(alarm => {
      // User.findOne({where:{id: body.user}}).then((user) => {
        // alarm.setUser(user);
        res.status(200).send(JSON.stringify({message: "Created successfully", alarm: alarm}));
        return;
      // });
    }).catch(err => {
        console.log(`Error: ${err}`);
      res.status(500).send(JSON.stringify({message: "Catch", err: err}));
      return;
    }).error(err => {
      console.log(`Error: ${err}`);
      res.status(500).send(JSON.stringify({message: "Error", err: err}));
      return;
    });
});

app.post('/assignDevice', function (req, res) {
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(user => {
        Alarm.findOne({
            where: {
                uid: req.body.uid
            }
        }).then((alarm) => {
            // console.log(user);
                if (alarm){
                    console.log("Exists");
                    AlarmRegistration.findOne({
                        where: {
                            alarmId: alarm.dataValues.uid,
                            userId: user.dataValues.id
                        }
                    }).then((reg) => {
                        console.log(reg);
                        if (!reg){
                            AlarmRegistration.create({
                                alarmId: alarm.id,
                                userId: user.id
                            }).then(() => res.status(200).send({message: "exists", alarm: alarm}));
                        } else {
                            res.status(200).send({message: "alreadyAssigned", alarm: alarm})
                        }
                    });
                } else {
                    console.log("Doesn't");
                    Alarm.create({
                        uid: req.body.uid
                    }).then(alarm => {
                            AlarmRegistration.create({
                                alarmId: alarm.id,
                                userId: user.id
                            }).then(() => res.status(200).send({message: "created", alarm: alarm}));


                    })
                }
            })
    })
});

app.get('/google428a6707452891c1.html', function(req, res) {
  res.sendFile(path.join(__dirname,'./views/verification.html'));
});

app.get('/getDevices/:user', function(req, res){
  User.findOne({
    where: {
      id: req.params.user
    },
      include: [ {
        model: AlarmRegistration,
        include: [ Alarm ]
      } ]
  }).then((user) => {
      let alarms = [];
      user.dataValues.alarm_registrations.forEach(alarm =>{
          alarms.push(alarm.dataValues.alarm.dataValues);
      });
    if (alarms.length === 0){
      res.status(200).send(JSON.stringify({message: "No alarms"}));
    } else {
      res.status(200).send(JSON.stringify({message: "Found", alarms: alarms}))
    }
  });
});


app.post('/triggerAlarm', function (req, res) {
    Alarm.update({status: "triggered", detectedAt: sequelize.fn('NOW')}, {
      where: {
        id: req.body.alarm
      }
    })
      .then(alarm => {
        Alarm.findOne({
          where: {
            id: req.body.alarm
          },
            include: [
                {
                    model: AlarmRegistration,
                    include: [ User ]
                }
            ]
        }).then(alarm => {
            console.log("Users: ");
            alarm.dataValues.alarm_registrations.forEach(user => {
                console.log(user.user.dataValues.id);
                io.sockets.in(user.user.dataValues.id).emit('trigger', JSON.stringify(alarm));
            });
          updateStations(alarm).then(res.end());
        })
      });
});

app.post('/fire/dispatchCrew', function (req, res) {
    console.log("Dispatch");
    Alarm.update({status: "dispatched"}, {
        where: {
            id: req.body.alarm
        }
    })
        .then(alarm => {
            Alarm.findOne({
                where: {
                    id: req.body.alarm
                }
            }).then(alarm => {
                console.log(alarm);
                // io.sockets.in(alarm.user).emit('message', JSON.stringify(alarm));
                updateStations(alarm).then(
                    res.status(200).send(JSON.stringify({message: "success", res: alarm}))
                );

            })
        })
});

io.on('connection', function(client) {
    client.on('join', function(id) {
        console.log(`App ${id} joined`);
      client.join(id);
    });
    client.on('leave', function(id) {
      client.leave(id);
    });
    client.on('fireJoin', function (id) {
        console.log(`Fire ${id} joined`);
        client.join(`fire${id}`)
    })
});

app.post('/addPushToken', function(req, res) {
  User.update({notificationKey: req.body.value}, {
    where: {
      id: req.body.id
    }
  }).then(() => res.end());
});

app.post('*/cancelAlarm', function(req, res) {
  Alarm.update({status: 'connected'}, {
    where: {
      id: req.body.id
    }
  }).then((ret) => {
      Alarm.findOne({
          where: {
              id: req.body.id
          },
          include: [
              {
                  model: AlarmRegistration,
                  include: [ User ]
              }
          ]
      }).then(alarm => {
          alarm.dataValues.alarm_registrations.forEach(user => {
              io.sockets.in(user.user.dataValues.id).emit('cancel', JSON.stringify(alarm));
          });
        updateStations(alarm).then(res.status(200).send(JSON.stringify({message: "successful", res: alarm})));
      });

  });
});

app.post('/fire/login', function (req, res) {
    EmergencyService.findOne({
        where: {
            email: req.body.email
        }
    }).then(serv => {
        if (serv.password === req.body.password){
            res.status(200).send(JSON.stringify({message: "correct", user: serv}));
        } else {
            res.status(400).send(JSON.stringify({message: "incorrect"}))
        }
    });
});

app.post('/fire/signup', function (req, res) {
    EmergencyService.create({
        name: req.body.name,
        long: req.body.loc.lng,
        lat: req.body.loc.lat,
        email: req.body.email,
        password: req.body.password,
        maxDistance: req.body.maxDistance
    })
        .then(serv => {
            res.status(200).send(JSON.stringify({message: "success", user: serv}));
        })
        .catch(err => {
            res.status(500).send(JSON.stringify({message: "Catch", err: err}))
        }).error(err => {
        res.status(500).send(JSON.stringify({message: "Error", err: err}))
        });
});


app.use(express.static(path.join(__dirname, '..', 'firealarmclient', 'client', 'build')));


app.post('/fire/list', function (req, res) {
    // let alarms =
    listFires(req.body.id).then(alarms => {
        res.status(200).send(JSON.stringify({alarms: alarms}));

    });
});

app.get('/app*', function(req, res) {
    res.sendFile(path.join(__dirname, '..', 'firealarmclient', 'client', 'build', 'index.html'));
});

async function listFires(id) {

    return new Promise(function(resolve, reject) {
        Alarm.findAll({
            where:  Sequelize.or(
                    {status: 'triggered'},
                    {status: 'dispatched'}
            )

        }).then(alarms => {
            EmergencyService.findOne({
                where: {
                    id: id
                }
            }).then(serv => {
                let resAlarms = [];
                for (let i = 0; i < alarms.length; i++) {
                    let alarm = alarms[i];
                    if (Distance.between({lat: alarm.lat, lon: alarm.long}, {
                            lat: serv.lat,
                            lon: serv.long
                        }) <= Distance(`${serv.maxDistance} km`)) {
                        resAlarms.push(alarm);

                    }
                }
                resolve(resAlarms);
            });
        });
    });
}

async function updateStations(alarm) {
    return new Promise(function (resolve, reject) {
        let servs = [];
       EmergencyService.findAll()
           .then(servs => {
                servs.forEach((serv) => {
                    listFires(serv.id).then((alarms) => {
                        io.sockets.in(`fire${serv.id}`).emit('alarmUpdate', JSON.stringify({alarms: alarms}))
                    });
                })
           })
    });
}