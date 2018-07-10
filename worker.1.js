const async = require('async');
const pgp = require('pg-promise')();
const dbUrl = require('url');
const exec = require('child-process-promise').exec;
const jsforce = require('jsforce');

const dbParams = dbUrl.parse(process.env.DATABASE_URL);
const auth = dbParams.auth.split(':');


var orgUsername = "kamlesh.patel@sparkle.devhub";
var orgPassword = "kam123456";
var conn = new jsforce.Connection({
    // you can change loginUrl to connect to sandbox or prerelease env.
    oauth2 : {
        clientId : '3MVG9zlTNB8o8BA1drFI_YDsprFa35rJye5SeJWP7X7taeXvchtdZtVKhSrVXq5EMbnpEXDhZ3ds7SHFjUChZ',
        clientSecret : '4172111670315471031',
        redirectUri : 'https://labappdeploy.herokuapp.com/oauth/callback'
      }
    
});


const config = {
  host: dbParams.hostname,
  port: dbParams.port,
  user: auth[0],
  ssl: true,
  password: auth[1],
  database: dbParams.pathname.split('/')[1],
  idleTimeoutMillis: 1000,
  max: 10
};

function pushNotificationToSfdc( step, guid, stage, complete, repo, scratchurl, errormessage, username){
  /*
conn.login(orgUsername, orgPassword, function(err, userInfo) {
  if (err) { 
      console.error("login exception");
      return console.error(err); 
  }
  // Now you can get the access token and instance URL information.
  // Save them to establish connection next time.
  console.log("Logged in=" + conn.accessToken);    

  if(step == "init"){
    conn.sobject("Lead").upsert({ 
      guid__c : guid,
      stage__c : stage,
      repo__c: repo,
      username__c: username,
      Company: username, 
      LastName: username
    }, 'guid__c', function(err, ret) {
      if (err || !ret.success) { return console.error(err, ret); }
      console.log('Upserted Successfully');
      // ...
    });
  } //if init end

  if(step == "status"){
    conn.sobject("Lead").upsert({ 
      guid__c : guid,
      complete__c: complete,
      stage__c : stage,
      scratchurl__c : scratchurl,
      errormessage__c: errormessage,
      username__c: username,
      Company: username, 
      LastName: username
    }, 'guid__c', function(err, ret) {
      if (err || !ret.success) { return console.error(err, ret); }
      console.log('Upserted Successfully');
      // ...
    });
  } //if status end
});
*/
}


const db = pgp(config);

function setNewStage(settings, stage) {
  settings.stage = stage;
  return settings;
}

function deploymentStage(settings, complete = false) {

  let scratchOrgUrlSql = '';
  if (complete) {
    scratchOrgUrlSql = `, scratch_url = '${settings.scratchOrgUrl}'`;
  }

  const updateQuery = `UPDATE deployments SET stage = '${settings.stage}', complete = ${complete}${scratchOrgUrlSql} WHERE guid = '${settings.guid}'`;
  db.any(updateQuery, [true]);
  return settings;
}

function deploymentSteps(settings) {

  const message = settings.message.replace("'", "''");
  const insertQuery = `INSERT INTO deployment_steps (guid, stage, message) VALUES ('${settings.guid}', '${settings.stage}', '${message}')`;
  db.any(insertQuery, [true]);
  return settings;
}

function deploymentError(guid, message) {

  message = message.replace(/'/g, "''");

  const insertQuery = `INSERT INTO deployment_steps (guid, stage, message) VALUES ('${guid}', 'error', '${message}')`;
  db.any(insertQuery, [true]);

  const updateQuery = `UPDATE deployments SET stage = 'error', error_message ='${message}', complete = false WHERE guid = '${guid}'`;
  db.any(updateQuery, [true]);
}

function formatMessage(settings) {

  let message = '';

  if (settings.stderr) {

    message = `Error: ${settings.stderr}.`;

    if (settings.stderr.indexOf('Flag --permsetname expects a value') > -1) {
      message = 'No permset specified.';
    } else {
      throw new Error(`GUID: ${settings.guid} ${settings.stderr}`);
    }

  } else {
    message = `${settings.stdout}.`;

    if (settings.stage === 'clone') {
      message = `Successfully cloned ${settings.githubRepo}.`;
    }
    if (settings.stage === 'instanceUrl') {
      message = `Set instance url to ${settings.instance_url}.`;
    }
    if (settings.stage === 'push') {
      message = `Pushed ${settings.stdout} source files.`;
    }
    if (settings.stage === 'permset') {
      if (!settings.assignPermset) {
        message = 'No permset specified.';
      } else {
        message = `Permset '${settings.permsetName}' assigned.`;
      }
    }
    if (settings.stage === 'test') {
      if (settings.stdout !== '') {
        message = `Apex tests: ${settings.stdout}.`;
      } else {
        message = 'No Apex tests.';
      }
    }
    if (settings.stage === 'dataplans') {
      if (settings.dataPlans.length > 0) {
        message = 'Data import successful.';
      } else {
        message = 'No data plan specified.';
      }
    }
    if (settings.stage === 'url') {
      settings.scratchOrgUrl = settings.stdout;
      message = `Scratch org URL: ${settings.scratchOrgUrl}.`;
    }
    if (settings.stage === 'yaml') {
      console.log('yaml', settings.yamlExists);
      if (!settings.yamlExists) {
        message = 'No .salesforcedx.yaml found in repository. Using defaults.';
      } else {
        message = 'Using .salesforcedx.yaml found in repository.';
      }
    }
  }

  settings.stderr = '';

  console.log('message', settings.stage, message);
  settings.message = message;
  return settings;
}

function executeScript(settings, script) {
  return new Promise((resolve) => {
    exec(script, (error, stdout, stderr) => {

      if (stderr && error) {
        settings.stderr = stderr.replace(/\r?\n|\r/, '').trim();
      }
      settings.stdout = stdout.replace(/\r?\n|\r/, '').trim();

      resolve(settings);
    });
  });
}

// check for anything at init
async.whilst(
  () => true,
  (callback) => {

    const selectQuery = "SELECT guid, username, repo, settings FROM deployments WHERE stage = 'init' AND complete = false LIMIT 1";
    let guid = '';
    let odata = null;

    console.log('Got task..');

    db.any(selectQuery, [true])
      .then((data) => {

        odata = data;

        console.log('Got data=' + data);

        // throw if no data to skip the subsequent promises
        if (data.length === 0) {
          throw new Error('norecords');
        }

        console.log('settings=', data[0].settings);

        const settings = JSON.parse(data[0].settings);
        
        settings.guid = data[0].guid;

        guid = settings.guid;

        console.log('found job', guid);
       
        
        settings.tokenName = settings.access_token.replace(/\W/g, '');
        settings.startingDirectory = process.env.STARTINGDIRECTORY;
        settings.directory = `${settings.tokenName}-${settings.guid}`;

        settings.cloneScript = `${settings.startingDirectory}rm -rf ${settings.directory};mkdir ${settings.directory};cd ${settings.directory};git clone ${settings.githubRepo} .`;
        settings.instanceUrlScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:config:set instanceUrl=${settings.instance_url};`;
        

        if(settings.sco != null && settings.sco == "false"){
          console.log('Source  push for Non-SCO');
          
          console.log('token start');
          console.log(settings.access_token);
          console.log('token end');

          console.log('directory start');
          console.log(settings.directory);
          console.log('directory end');
          

          settings.pushScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:config:set instanceUrl='${settings.instance_url}';sfdx force:source:convert -d mdapioutput --json;sfdx force:mdapi:deploy --verbose -d mdapioutput/ --targetusername '${settings.access_token}' | jq '.result.pushedSource | length'`;
          console.log('pushScript=', settings.pushScript);
        }else {
          console.log('Source  push for SCO');
          settings.createScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:org:create -v '${settings.access_token}' -s -f ${settings.scratchOrgDef}`;
          settings.pushScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:source:push --json | jq '.result.pushedSource | length'`;
   
        }
        
        settings.permSetScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:user:permset:assign -n ${settings.permsetName}`;

        settings.dataPlanScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;`;

        for (let i = 0, len = settings.dataPlans.length; i < len; i++) {
          settings.dataPlanScript += `sfdx force:data:tree:import --plan ${settings.dataPlans[i]};`;
        }

        settings.testScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:apex:test:run -r human --json | jq -r .result | jq -r .summary | jq -r .outcome`;
        settings.urlScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;echo $(sfdx force:org:display --json | jq -r .result.instanceUrl)"/secur/frontdoor.jsp?sid="$(sfdx force:org:display --json | jq -r .result.accessToken)`;
        // add path if specified in yaml
        if (settings.openPath) {
          
          settings.urlScript += `"&retURL="${encodeURIComponent(settings.openPath)}`;
        }
        settings.scratchOrgUrl = '';
        settings.stderr = '';
        settings.stdout = '';

        //pushNotificationToSfdc( "init", guid, "init", false, settings.githubRepo, "", "", data[0].username);

        return settings;
      })
      .then(settings => setNewStage(settings, 'yaml'))
      .then(settings => deploymentStage(settings))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // clone
      .then(settings => setNewStage(settings, 'clone'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.cloneScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // instanceUrl
      .then(settings => setNewStage(settings, 'instanceUrl'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.instanceUrlScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // push
      .then(settings => setNewStage(settings, 'push'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.pushScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // permset
      .then(settings => setNewStage(settings, 'permset'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.permSetScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // dataplans
      .then(settings => setNewStage(settings, 'dataplans'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.dataPlanScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // test
      .then(settings => setNewStage(settings, 'test'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.testScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // url
      .then(settings => setNewStage(settings, 'url'))
      .then(settings => deploymentStage(settings))
      .then(settings => executeScript(settings, settings.urlScript))
      .then(settings => formatMessage(settings))
      .then(settings => deploymentSteps(settings))
      // completed
      .then(settings => setNewStage(settings, 'complete'))
      .then(settings => deploymentStage(settings, true))
      .then((settings) => {
        console.log('finished job', settings.guid);
        pushNotificationToSfdc( "status", guid, "complete", true, "", "","", odata[0].username);
        //
      })
      .catch((error) => {
        // handles cases where there are no records
        if (error.message !== 'norecords') {
          console.error('guid', guid);
          console.error('error', error);

          //pushNotificationToSfdc( "status", guid, "fail", false, "", "", error.message, data[0].username);

          deploymentError(guid, error.message);
        }
      });

    setTimeout(() => {
      callback(null, true);
    }, 30000);
  },
  (err) => {
    console.error(`err: ${err}`);
  }
);