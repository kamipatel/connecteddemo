const oauth2 = require("salesforce-oauth2");
const jsforce = require("jsforce");
const jwtflow = require("./jwt");
const fs = require("fs");
const AWS = require("aws-sdk");

//For oAuth2 only
const callbackUrl = process.env.CALLBACKURL;
const consumerKey = process.env.CONSUMERKEY;
const consumerSecret = process.env.CONSUMERSECRET;

//For JWT only
const jwtappcallbackUrl = process.env.JWTAPPCALLBACKURL;
const jwtappconsumerKey = process.env.JWTAPPCONSUMERKEY;
const jwtappconsumerSecret = process.env.JWTAPPCONSUMERSECRET;

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

module.exports = function(app) {
  app.get("/", (req, res) => {
    res.render("pages/admin", {});
  });

  app.get("/jwtinitiallogin", (req, res) => {
    const template = req.query.template;

    console.debug("jwtappcallbackUrl=" + jwtappcallbackUrl);
    console.debug("jwtappconsumerKey=" + jwtappconsumerKey);

    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: jwtappcallbackUrl,
      client_id: jwtappconsumerKey,
      scope: "api openid full"
    });

    return res.redirect(uri);
  });

  app.get("/jwtinitialoauth/callback", (req, res) => {
    const authorizationCode = req.param("code");
    const template = req.param("state");

    var oauth2 = new jsforce.OAuth2({
      // you can change loginUrl to connect to sandbox or prerelease env.
      // loginUrl : 'https://test.salesforce.com',
      clientId: jwtappconsumerKey,
      clientSecret: jwtappconsumerSecret,
      redirectUri: jwtappcallbackUrl
    });

    var conn = new jsforce.Connection({
      oauth2: oauth2
    });

    conn.authorize(authorizationCode, function(err, userInfo) {
      if (err) {
        return console.error(err);
      }

      conn.query(
        "SELECT Id, Name, email, username FROM User",
        (err, result) => {
          const userlist = result.records;

          res.render("pages/jwtusers", {
            users: result.records,
            coninfo: conn
          });
        }
      ); //end of conn.query
    }); //end of authorize
  }); //end of ()

  //For JWT only
  app.post("/SendDataByJwtNow", (req, res) => {
    var privateKey = fs.readFileSync(__dirname + "/server.key", "utf8");

    try {
      jwtflow.getToken(
        jwtappconsumerKey,
        privateKey,
        req.body.username,
        function(err, jwtdata) {
          if (jwtdata == null || jwtdata == undefined) {
            res.send({
              status: false,
              message: "Failure"
            });

            return;
          }

          var conn = new jsforce.Connection();

          conn.initialize({
            instanceUrl: req.body.instanceUrl,
            accessToken: jwtdata.access_token
          });

          //Insert a record in client org
          conn.sobject("Account").create(
            {
              Name: "My Account #" + Math.floor(Math.random() * Math.floor(100))
            },
            function(err, ret) {
              if (err || !ret.success) {
                console.log("Account insert error=" + err);
              } else {
                console.log("Created Account with record id : " + ret.id);
              }

              // ...
              res.send({
                status: true,
                message: "Successfully inserted account record in client org!"
              });
            }
          ); //account create end
        }
      ); //jwtflow.getToken() end
    } catch (e) {
      res.send({
        status: false,
        message: "Failure"
      });
    }
  }); //SendDataByJwtNow() end

  app.get("/sessiontest", (req, res) => {
    //test

    var sid =
      "00DB0000000Tl8O!ARYAQKyscH7mj6dt5EVZt4x7r2Pu71vumC923UXy91TZDl17Z1iB9R8PJFKr.lXk5oxlVUCUUbceHhmJD5bpWGS2SPvV7epI";

    var conn = new jsforce.Connection({
      serverUrl: "https://GS0.salesforce.com",
      sessionId: sid
    });

    conn.query("SELECT Id, Name FROM Account limit 2", (err, result) => {
      console.log("err=" + err);
      console.log("Got results=" + result);
      const userlist = result.records;
      console.log("Got results after");
      console.log("result.records=" + JSON.stringify(result.records));

      res.send({
        status: true,
        message: "Successfully called!"
      });
    }); //end of conn.query
  }); //sessiontest() end

  /////////////////////////////////////////////
  ///////For oAuth2 only////////////////////
  app.get("/login", (req, res) => {
    const template = req.query.template;

    console.debug("consumerKey=" + consumerKey);

    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      scope: "api full refresh_token",
      state: template,
      prompt: "select_account"
    });

    return res.redirect(uri);
  });

  app.get("/oauth/callback", (req, res) => {
    const authorizationCode = req.param("code");
    const template = req.param("state");

    console.log("authrorization code=" + authorizationCode);

    oauth2.authenticate(
      {
        redirect_uri: callbackUrl,
        client_id: consumerKey,
        client_secret: consumerSecret,
        code: authorizationCode
      },
      (error, payload) => {
        try {
          // console.log('payload.access_token=' + payload.access_token);
          console.log("token payload=" + JSON.stringify(payload));
        } catch (tokenErr) {
          console.error("payload.access_token undefined", tokenErr);

          return res.redirect("/error");
        }

        //console.debug("registeruser called req.accessToken=" + req.body.access_token);
        //console.debug("registeruser called req.refreshToken=" + req.body.refresh_token);
        //console.debug("registeruser called req.instance_url=" + req.body.instance_url);

        const conn = new jsforce.Connection({
          instanceUrl: payload.instance_url,
          accessToken: payload.access_token
        });

        conn.identity((err, identity) => {
          if (err) {
            return console.error(err);
          }

          console.debug(
            "registeruser called req.instance_url=" + JSON.stringify(identity)
          );

          //return res.redirect('/registeredOauthUsers');

          const insertParams = {
            TableName: params.TableName,
            Item: {
              id: identity.user_id,
              accessToken: payload.access_token,
              refreshToken: payload.refresh_token,
              instanceUrl: payload.instance_url,
              name: identity.display_name,
              email: identity.email,
              prefUsername: identity.username,
              orgid: identity.organization_id
            }
          };

          docClient.put(insertParams, function(err, data) {
            if (err) {
              console.log("Table insert error=", err);
              res.send({
                success: false,
                message: "Error: Server error"
              });
            } else {
              console.log("success inserting data=", data);
              const { Items } = data;
            }
          });

          return res.redirect("/registeredOauthUsers");
        });
      }
    ); //end oauth2.authenticate()
  });

  app.get("/registeredOauthUsers", (req, res) => {
    console.debug("Get registeredOauthUsers called");

    console.debug("Get registeredusers before scan");
    docClient.scan(params, function(err, data) {
      if (err) {
        console.debug("Get registeredusers err=" + err);
        res.send({
          success: false,
          message: "Error: Server error"
        });
      } else {
        console.debug("Get registeredusers success=");
        const { Items } = data;

        res.render("pages/oauthusers", {
          users: data.Items
        });
      }
    });
  });

  app.post("/SendData", (req, res) => {
    console.debug("SendData called, req=" + JSON.stringify(req.body));

    const qparams = {
      TableName: awsTableName,
      KeyConditionExpression: "id = :keyid",
      ExpressionAttributeValues: {
        ":keyid": req.body.id
      }
    };
    docClient.query(qparams, function(err, data) {
      if (err) {
        console.debug("SendData dynamodb query error=" + err);
        res.send({
          success: false,
          message: "Error: aws dynamodb read error"
        });
      } else {
        console.debug("SendData dynamodb query success, data=" + data);
        console.log("data", data);
        var o = data.Items[0];

        //Get access token from refresh token
        var conn = new jsforce.Connection({
          oauth2: {
            clientId: consumerKey,
            clientSecret: consumerSecret
          },
          instanceUrl: o.instanceUrl,
          refreshToken: o.refreshToken
        });

        conn.on("refresh", function(accessToken, res) {
          // Refresh event will be fired when renewed access token
          // to store it in your storage for next request
          console.debug("Refresh token called with accessToken=" + accessToken);
        });

        //Insert a record in client org
        conn.sobject("Account").create(
          {
            Name: "My Account #" + Math.floor(Math.random() * Math.floor(100))
          },
          function(err, ret) {
            if (err || !ret.success) {
              console.log("Account insert error=" + err);
            } else {
              console.log("Created Account with record id : " + ret.id);
            }

            // ...
            res.send({
              status: true,
              message: "Sent data"
            });
          }
        );
      }
    });
  }); //End of SendData()
};
