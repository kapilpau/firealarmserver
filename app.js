const Sequelize = require('sequelize');
const config = require('./config');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({
    extended: true
}));

const sequelize = new Sequelize(config.dbName, config.dbUser, config.dbPass, {
    host: config.dbHost,
    dialect: 'mysql',

    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },

    // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
    operatorsAliases: false
});

const User = sequelize.define('user', {
    username: {type: Sequelize.STRING, allowNull: false},
    email: {type: Sequelize.STRING, allowNull: false},
    password: {type: Sequelize.STRING, allowNull: false},
    name: {type: Sequelize.STRING, allowNull: false}
}, {
    instanceMethods: {
        getPass: function () {
            return this.password;
        }
    }
});

const Alarm = sequelize.define('alarm', {
    long: {type: Sequelize.DOUBLE, allowNull: false},
    lat: {type: Sequelize.DOUBLE, allowNull: false},
    status: {type: Sequelize.STRING, allowNull: false},
    comments: {type: Sequelize.STRING, allowNull: false}
});

const Device = sequelize.define('device');

Alarm.belongsToMany(User, {through: 'alarm_registrations'});

sequelize.sync()
    .then(function() {
            app.listen(config.port, () => console.log(`Fire Alarm server listening on port ${config.port}`));
        }
    );


app.post('/login', function (req, res) {
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(function (usr) {
        console.log(JSON.stringify(usr));
        if (req.body.password === usr.password){
            console.log("Correct");
            res.setHeader('Content-Type', 'application/json');
            res.statusText = JSON.stringify(usr);
            res.status(200).end();
        } else {
            res.statusText = "Incorrect";
            res.status(400).send("Incorrect");
        }
    })
    .catch(function (error) {
        console.log(JSON.stringify(error));
        res.status(500).end();
    });
});

app.post('/signup', function (req, res) {
    console.log(req.body);
    if (!(req.body.username && req.body.email && req.body.password && req.body.password && req.body.name))
    {
        res.status(400).send("Missing options");
    }
    User.create({username: req.body.username, email: req.body.email, password: req.body.password, name: req.body.name})
        .then(function () {
            res.status(200).send("Done");
        })
        .catch(function () {
            res.status(500).send("Something went wrong");
        });
});