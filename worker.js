const async = require('async');
const pgp = require('pg-promise')();
const dbUrl = require('url');
const exec = require('child-process-promise').exec;

const dbParams = dbUrl.parse(process.env.DATABASE_URL);
const auth = dbParams.auth.split(':');

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

async function doIt() {
  const w = "SELECT guid, username, repo, settings FROM deployments WHERE stage = 'init' AND complete = false LIMIT 1";
  //const w = "SELECT guid, username, repo, settings FROM deployments";

  const data = await db.any(w, [true]);
  console.debug("funca data=" + data);

  for(record of data){

    try{
      console.debug("doIt record=" + record);

      var settings = JSON.parse(record.settings);

      settings.guid = data[0].guid;
      guid = settings.guid;

      console.log('found job', guid);

      settings.tokenName = settings.access_token.replace(/\W/g, '');
      settings.startingDirectory = process.env.STARTINGDIRECTORY;
      settings.directory = `${settings.tokenName}-${settings.guid}`;

      settings.cloneScript = `${settings.startingDirectory}rm -rf ${settings.directory};mkdir ${settings.directory};cd ${settings.directory};git clone ${settings.githubRepo} .`;
      settings.instanceUrlScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:config:set instanceUrl=${settings.instance_url};`;

      var isSCO = true;

      if (settings.sco != null && settings.sco === 'false'){
        isSCO = false;
      }

      if (!isSCO){
        console.log('*****Source  push for Non-SCO******');
       
        settings.pushScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:config:set instanceUrl='${settings.instance_url}'; sfdx force:source:convert -d mdapioutput --json; sfdx force:mdapi:deploy --verbose -d mdapioutput/ --targetusername '${settings.access_token}'`;
        //console.log('****pushScript=', settings.pushScript);
      } 
      else {
        settings.pushScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:source:push --json | jq '.result.pushedSource | length'`;
      }

      settings.createScript = `${settings.startingDirectory}cd ${settings.directory};export FORCE_SHOW_SPINNER=;sfdx force:org:create -v '${settings.access_token}' -s -f ${settings.scratchOrgDef}`;
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

      console.log('yaml step');
      settings = await setNewStage(settings, 'yaml');
      settings = await deploymentStage(settings); 
      settings = await  formatMessage(settings); 
      settings = await deploymentSteps(settings); 

      console.log('clone step');
      settings = await setNewStage(settings, 'clone'); 
      settings = await deploymentStage(settings); 
      settings = await executeScript(settings, settings.cloneScript); 
      settings = await formatMessage(settings); 
      settings = await deploymentSteps(settings); 

      console.log('instanceUrl step');
      settings = await setNewStage(settings, 'instanceUrl'); 
      settings = await deploymentStage(settings); 
      settings = await executeScript(settings, settings.instanceUrlScript); 
      settings = await formatMessage(settings); 
      settings = await deploymentSteps(settings); 
  
      if (isSCO){
        console.log('Create scratch org step');
        settings = await setNewStage(settings, 'create'); 
        settings = await deploymentStage(settings); 
        settings = await executeScript(settings, settings.createScript); 
        settings = await formatMessage(settings); 
        settings = await deploymentSteps(settings); 
      }
      
      settings = await setNewStage(settings, 'push step'); 
      settings = await deploymentStage(settings); 
      settings = await executeScript(settings, settings.pushScript); 
      settings = await formatMessage(settings); 
      settings = await deploymentSteps(settings); 
  
      if (isSCO){
        console.log('Create scratch org step');
        settings = await setNewStage(settings, 'permset'); 
        settings = await deploymentStage(settings); 
        settings = await executeScript(settings, settings.permSetScript); 
        settings = await formatMessage(settings); 
        settings = await deploymentSteps(settings); 

        console.log('dataplans step');
        settings = await setNewStage(settings, 'dataplans'); 
        settings = await deploymentStage(settings); 
        settings = await executeScript(settings, settings.dataPlanScript); 
        settings = await formatMessage(settings); 
        settings = await deploymentSteps(settings); 

        console.log('test step');
        settings = await setNewStage(settings, 'test'); 
        settings = await deploymentStage(settings); 
        settings = await executeScript(settings, settings.testScript); 
        settings = await formatMessage(settings); 
        settings = await deploymentSteps(settings); 

        console.log('url step');
        settings = await setNewStage(settings, 'url'); 
        settings = await deploymentStage(settings); 
        settings = await executeScript(settings, settings.urlScript); 
        settings = await formatMessage(settings); 
        settings = await deploymentSteps(settings); 
      }

      console.log('complete step');
      settings = await setNewStage(settings, 'complete'); 
      settings = await deploymentStage(settings, true); 
    
      console.debug("Record processed with guid=" + settings.guid);
      
    }catch(error){

      if (error.message !== 'norecords') {
        console.error('guid', guid);
        console.error('error', error);
        deploymentError(guid, error.message);
      }
    }

  };

  setTimeout(doIt, 15000);

}

doIt();
