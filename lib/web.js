const oauth2 = require('salesforce-oauth2');
const jsforce = require('jsforce');
const AWS = require('aws-sdk');
const util = require('util');

const callbackUrl = process.env.CALLBACKURL;
const consumerKey = process.env.CONSUMERKEY;
const consumerSecret = process.env.CONSUMERSECRET;

const docClient = new AWS.DynamoDB.DocumentClient({
  region: process.env.AUTODYNE_AWS_DEFAULT_REGION,
  accessKeyId: process.env.AUTODYNE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AUTODYNE_AWS_SECRET_ACCESS_KEY
});

const awsTableName = process.env.AUTODYNE_TABLE_NAME;
const params = {
  TableName: process.env.AUTODYNE_TABLE_NAME
};

const hashKey = "id";
const rangeKey = null;


module.exports = function (app) {

  app.get('*', (req, res, next) => {
    // console.debug('In root ejs');
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      res.redirect(`https://deploy-to-sfdx.com${req.url}`);
    }

    return next();
  });


  app.get('/', (req, res) => {
    console.log("process.env.=" + JSON.stringify(process.env));
    console.debug("Get registeredusers, params=" + params + " process.env.AUTODYNE_TABLE_NAME=" + process.env.AUTODYNE_TABLE_NAME);
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


  app.get("/cleanup", (req, res) => {
    console.debug("cleanup called");
    deleteAllItems();
    res.render('pages/index', {
      users: {}
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

    console.debug("login consumerKey=" + consumerKey);
    console.debug("login callbackUrl=" + callbackUrl);


    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      scope: 'api openid full refresh_token'
    });

    return res.redirect(uri);
  });

  app.get('/oauth/callback', (req, res) => {
    const authorizationCode = req.param('code');
    const template = req.param('state');

    console.log('authrorization code=' + authorizationCode);

    var oauth2 = new jsforce.OAuth2({
      // you can change loginUrl to connect to sandbox or prerelease env.
      // loginUrl : 'https://test.salesforce.com',
      clientId: consumerKey,
      clientSecret: consumerSecret,
      redirectUri: callbackUrl
    });

    var conn = new jsforce.Connection({
      oauth2: oauth2
    });

    conn.authorize(authorizationCode, function (err, userInfo) {
      if (err) {
        return console.error(err);
      }
      // Now you can get the access token, refresh token, and instance URL information.
      // Save them to establish connection next time.
      //console.log(conn.accessToken);
      //console.log(conn.refreshToken);
      //console.log(conn.instanceUrl);
      console.log("userinfo=" + JSON.stringify(userInfo));
      //console.log("User ID: " + userInfo.id);
      //console.log("Org ID: " + userInfo.organizationId);

      conn.query("SELECT Id, Name, email, username FROM User where Id='" + userInfo.id + "'", (err, result) => {

        console.log('****Got user info');

        console.log('Got result=', JSON.stringify(result.records[0]));

        const insertParams = {
          TableName: params.TableName,
          Item: {
            id: userInfo.id,
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            instanceUrl: conn.instanceUrl,
            name: result.records[0].Name,
            email: result.records[0].Email,
            username: result.records[0].Username,
            prefUsername: result.records[0].Username,
            orgid: userInfo.organizationId
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

            return res.redirect('/');
          }
        });


      });

    });

    /*
        oauth2.authenticate({
          redirect_uri: callbackUrl,
          client_id: consumerKey,
          client_secret: consumerSecret,
          code: authorizationCode
        }, (error, payload) => {

          try {

            console.log('token payload=' + JSON.stringify(payload));

            //Get access token from refresh token
            var conn = new jsforce.Connection({
              oauth2: {
                clientId: consumerKey,
                clientSecret: ''
              },
              instanceUrl: payload.instance_url,
              accessToken: payload.access_token
            });

            conn.query("SELECT Id, Name FROM User limit 1", (err, result) => {

              console.log('****Got user info');

              console.log('Got result=', JSON.stringify(result));

              const insertParams = {
                TableName: params.TableName,
                Item: {
                  id: payload.id,
                  accessToken: payload.access_token,
                  refreshToken: payload.refresh_token,
                  instanceUrl: payload.instance_url,
                  name: payload.id,
                  email: 'DUMMY',
                  prefUsername: 'DUMMY',
                  orgid: 'DUMMY'
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

                  return res.redirect('/');
                }
              });


            });

          } catch (tokenErr) {
            console.error('payload.access_token undefined', tokenErr);

            return res.redirect('/error');
          }

        });
    */

  });


  function deleteAllItems() {
    docClient.scan(params, function (err, data) {
      if (err) console.log('Error deleting table items=' + err);

      else {
        data.Items.forEach(function (obj, i) {
          console.log(i);
          console.log(obj);
          var params = {
            TableName: awsTableName,
            Key: buildKey(obj),
            ReturnValues: 'NONE', // optional (NONE | ALL_OLD)
            ReturnConsumedCapacity: 'NONE', // optional (NONE | TOTAL | INDEXES)
            ReturnItemCollectionMetrics: 'NONE', // optional (NONE | SIZE)
          };

          docClient.delete(params, function (err, data) {
            if (err) console.log(err); // an error occurred
            else console.log(data); // successful response
          });

        });
      }
    });
  }

  function buildKey(obj) {
    var key = {};
    key[hashKey] = obj[hashKey]
    if (rangeKey) {
      key[rangeKey] = obj[rangeKey];
    }

    return key;
  }

};