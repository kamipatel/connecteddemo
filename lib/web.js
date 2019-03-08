const oauth2 = require('salesforce-oauth2');
const jsforce = require('jsforce');

const callbackUrl = process.env.CALLBACKURL;
const consumerKey = process.env.CONSUMERKEY;
const consumerSecret = process.env.CONSUMERSECRET;

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

    const uri = oauth2.getAuthorizationUrl({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      scope: 'id api openid',
      state: template,
      prompt: 'select_account'
    });

    return res.redirect(uri);
  });

  app.get('/oauth/callback', (req, res) => {
    const authorizationCode = req.param('code');
    const template = req.param('state');

    oauth2.authenticate({
      redirect_uri: callbackUrl,
      client_id: consumerKey,
      client_secret: consumerSecret,
      code: authorizationCode
    }, (error, payload) => {

      try {

        // console.log('payload.access_token=' + payload.access_token);
        console.log('payload.instance_url=' + payload.instance_url);

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

        conn.tooling.query("SELECT DurableId, SettingValue FROM OrganizationSettingsDetail", (devHubErr, result) => {
          console.log('Got OrganizationSettingsDetail');

          //console.log('Got result=', JSON.stringify(result));

          return res.redirect('/thanks');
        });

      });
    });
  });
};