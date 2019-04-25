const oauth2 = require("salesforce-oauth2");
const jsforce = require("jsforce");
const jwtflow = require("./jwt");
const fs = require("fs");

const callbackUrl = process.env.CALLBACKURL;
const consumerKey = process.env.CONSUMERKEY;
const consumerSecret = process.env.CONSUMERSECRET;

module.exports = function (app) {
  app.get("*", (req, res, next) => {
    // console.debug('In root ejs');
    if (
      process.env.NODE_ENV === "production" &&
      req.headers["x-forwarded-proto"] !== "https"
    ) {
      res.redirect(`https://deploy-to-sfdx.com${req.url}`);
    }

    return next();
  });

  app.get("/", (req, res) => {
    res.render("pages/admin", {});
  });

  app.post("/SendDataByJwtNow", (req, res) => {

    var privateKey = fs.readFileSync(__dirname + "/server.key", "utf8");

    try {
      jwtflow.getToken(consumerKey, privateKey, req.body.username, function (
        err,
        jwtdata
      ) {

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
        conn.sobject("Account").create({
            Name: "My Account #" + Math.floor(Math.random() * Math.floor(100))
          },
          function (err, ret) {
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
      }); //jwtflow.getToken() end
    } catch (e) {
      res.send({
        status: false,
        message: "Failure"
      });
    }

  }); //SendDataByJwtNow() end

  app.get("/error", (req, res) => {
    res.render("pages/error");
  });

  app.get("/thanks", (req, res) => {
    res.render("pages/thanks", {});
  });

  app.get("/login", (req, res) => {
    const template = req.query.template;

    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      scope: "api openid full"
    });

    return res.redirect(uri);
  });

  app.get("/oauth/callback", (req, res) => {
    const authorizationCode = req.param("code");
    const template = req.param("state");

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

      conn.query(
        "SELECT Id, Name, email, username FROM User",
        (err, result) => {

          const userlist = result.records;

          res.render("pages/users", {
            users: result.records,
            coninfo: conn
          });

        }); //end of conn.query

    }); //end of authorize

  }); //end of ()

  app.get("/CreditScore", async (req, res) => {

    const conn = await logintoOrgAndSendEvents();
    //console.log("login complete called, conn=" + JSON.stringify(conn));

    res.send({
      status: true,
      message: "Credit score check complete!"
    });

    console.log("Credit status complete!");

  }); //CreditScore() end

  async function logintoOrgAndSendEvents() {

    console.log("logintoOrgAndSendEvents called");

    var username = 'test-1jqb9kev9fqf@example.com';
    var password = 'RMe]w%0c67';

    var conn = new jsforce.Connection({
      loginUrl: 'https://test.salesforce.com'
    });

    await conn.login(username, password);
    await sleep(8000);
    await SendStatusEvent(conn, 'Checking Experian')
    await sleep(2000);
    await SendStatusEvent(conn, 'Equifax')
    await sleep(2000);
    await SendStatusEvent(conn, 'TransUnion')
    await sleep(3000);

    console.log("logintoOrg Complete");

    return conn;

  }

  async function SendStatusEvent(conn, msg) {
    console.log("SendStatusEvent called!");
    await conn.sobject("CreditStatus__e").create({
      message__c: msg
    }, function (err, ret) {
      if (err || !ret.success) {
        return console.error(err, ret);
      }
      console.log("SendStatusEvent complete");
    })
  };

  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    })
  }

};