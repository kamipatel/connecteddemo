const oauth2 = require('salesforce-oauth2');
const jsforce = require('jsforce');

const callbackUrl = process.env.CALLBACKURL;
const consumerKey = '3MVG9KsVczVNcM8yjOAKRP7DgVRORy3HxxQUO994DmnFt41u4yEyLfi4yRtC5ORT_oSl2OIVA6o5Oi3UmCHEY';
//const consumerKey = 'afaf';
//const consumerSecret = process.env.CONSUMERSECRET;
const consumerSecret = '51277D45F09BAE5F907B8E725FEB7B4C9591FCC6FAC6705CBD8E94E986FD0F6A';

module.exports = function (app) {

  app.get('*', (req, res, next) => {
    // console.debug('In root ejs');
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
      res.redirect(`https://deploy-to-sfdx.com${req.url}`);
    }

    return next();
  });

  app.get('/', (req, res) => {
    res.render('pages/index', {});
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