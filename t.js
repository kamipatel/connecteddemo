      const jsforce = require('jsforce');


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