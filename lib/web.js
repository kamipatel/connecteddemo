const oauth2 = require('salesforce-oauth2');
const jsforce = require('jsforce');
const AWS = require('aws-sdk');
const util = require('util');

const callbackUrl = process.env.CALLBACKURL;

const consumerKey = '3MVG9KsVczVNcM8yjOAKRP7DgVcC7O3V5KVSOg0qC7Tl6dxiFIiebDqEFUblA7di9tcfIB3Wdw7uE.TycvaBX';
//const consumerSecret = '87BC76D484F36BC9481D799AE3B7DF8772990B84A226B22E8B01DC8D6440180C';

const docClient = new AWS.DynamoDB.DocumentClient({
  region: "us-east-1",
  accessKeyId: "AKIAJW7OLSJEBAY66USA",
  secretAccessKey: "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"
});
const awsTableName = 'autodyne-transparent-85048';
const params = {
  TableName: awsTableName
};

module.exports = function (app) {

  app.get('*', (req, res, next) => {
    // console.debug('In root ejs');
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      res.redirect(`https://deploy-to-sfdx.com${req.url}`);
    }

    return next();
  });

  app.get('/', (req, res) => {

    console.debug("Get registeredusers");
    docClient.scan(params, function (err, data) {
      if (err) {
        console.debug("Get registeredusers err=" + err);

        res.render('pages/error', {});

      } else {
        console.debug("Get registeredusers success, data=" + JSON.stringify(data));

        res.render('pages/index', {
          users: data.Items
        });

      }

    });

  });

  app.post("/SendData", (req, res) => {
    console.debug("SendData called, req=" + JSON.stringify(req.body));

    const qparams = {
      TableName: awsTableName,
      KeyConditionExpression: 'id = :keyid',
      ExpressionAttributeValues: {
        ':keyid': req.body.id
      }
    };
    docClient.query(qparams, function (err, data) {
      if (err) {
        console.debug("SendData dynamodb query error=" + err);
        res.send({
          success: false,
          message: 'Error: aws dynamodb read error'
        });

      } else {
        console.debug("SendData dynamodb query success, data=" + data);
        console.log('data', data);
        var o = data.Items[0];

        //Get access token from refresh token
        var conn = new jsforce.Connection({
          oauth2: {
            clientId: consumerKey,
            clientSecret: ''
          },
          instanceUrl: o.instanceUrl,
          refreshToken: o.refreshToken
        });

        conn.on("refresh", function (accessToken, res) {
          // Refresh event will be fired when renewed access token
          // to store it in your storage for next request
          console.debug("Refresh token called with accessToken=" + accessToken);
        });

        //Insert a record in client org
        conn.sobject("Account").create({
          Name: 'My Account #' + Math.floor(Math.random() * Math.floor(100))
        }, function (err, ret) {
          if (err || !ret.success) {
            console.log('Account insert error=' + err);
          } else {
            console.log("Created Account with record id : " + ret.id);
          }

          // ...
          res.send({
            status: true,
            message: 'Sent data'
          });

        });

      }
    });



  });

  app.post("/registeruser", (req, res) => {
    console.debug("registeruser called req" + JSON.stringify(req.body));
    //console.log(util.inspect(req, {
    // depth: null
    //}));
    //console.debug("registeruser called req JSON" + JSON.parse(req));
    console.debug("registeruser called req.accessToken=" + req.body.accessToken);
    console.debug("registeruser called req.refreshToken=" + req.body.refreshToken);
    console.debug("registeruser called req.instance_url=" + req.body.instanceUrl);

    const insertParams = {
      TableName: params.TableName,
      Item: {
        id: req.body.id,
        accessToken: req.body.accessToken,
        refreshToken: req.body.refreshToken,
        instanceUrl: req.body.instanceUrl,
        name: req.body.name,
        email: req.body.email,
        prefUsername: req.body.prefUsername,
        orgid: req.body.orgid
      }
    };

    docClient.put(insertParams, function (err, data) {
      if (err) {
        console.log('Table insert error=', err);
        res.send({
          success: false,
          message: 'Error: Server error'
        });
      } else {
        console.log('success inserting data=', data);
        const {
          Items
        } = data;
        res.send({
          status: true,
          message: 'Added data'
        });
      }

    });

    //console.debug("registeruser called, req=" + JSON.stringify(req));
  });

  app.get('/registeredusers', (req, res) => {
    console.debug("Get registeredusers called");

    console.debug("Get registeredusers before scan");
    docClient.scan(params, function (err, data) {
      if (err) {
        console.debug("Get registeredusers err=" + err);
        res.send({
          success: false,
          message: 'Error: Server error'
        });
      } else {
        console.debug("Get registeredusers success=");
        const {
          Items
        } = data;
        res.send({
          success: true,
          message: 'Loaded users',
          users: Items
        });
      }
    });

  });

  app.get('/error', (req, res) => {
    res.render('pages/error');
  });


  app.get('/thanks', (req, res) => {

    res.render('pages/thanks', {});
  });

  app.get('/login', (req, res) => {
    const template = req.query.template;

    console.debug("consumerKey=" + consumerKey);

    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      scope: 'api openid full refresh_token',
      state: template,
      prompt: 'select_account'
    });

    return res.redirect(uri);
  });

  app.get('/oauth/callback', (req, res) => {
    const authorizationCode = req.param('code');
    const template = req.param('state');

    console.log('authrorization code=' + authorizationCode);

    oauth2.authenticate({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      client_secret: consumerSecret,
      code: authorizationCode
    }, (error, payload) => {

      try {

        // console.log('payload.access_token=' + payload.access_token);
        console.log('token payload=' + JSON.stringify(payload));

      } catch (tokenErr) {
        console.error('payload.access_token undefined', tokenErr);

        return res.redirect('/error');
      }

      const conn = new jsforce.Connection({
        instanceUrl: payload.instance_url,
        accessToken: payload.access_token
      });

      conn.identity((err, identity) => {
        if (err) {
          return console.error(err);
        }

        conn.query("SELECT Id, Name FROM Account limit 1", (err, result) => {

          console.log('Got OrganizationSettingsDetail err=' + err);

          console.log('Got result=', JSON.stringify(result));

          return res.redirect('/thanks');
        });

      });
    });
  });
};