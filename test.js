const jsforce = require('jsforce');

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


function pushNotificationToSfdc(guid, stage, complete, repo, scratchurl, errormessage, username){
    
conn.login(orgUsername, orgPassword, function(err, userInfo) {
  if (err) { 
      console.error("login exception");
      return console.error(err); 
  }
  // Now you can get the access token and instance URL information.
  // Save them to establish connection next time.
  console.log("Logged in=" + conn.accessToken);    

  conn.sobject("Lead").upsert({ 
    guid__c : guid,
    complete__c: complete,
    stage__c : stage,
    scratchurl__c : scratchurl,
    repo__c: repo,
    errormessage__c: errormessage,
    username__c: username,
    Company: username, 
    LastName: username
  }, 'guid__c', function(err, ret) {
    if (err || !ret.success) { return console.error(err, ret); }
    console.log('Upserted Successfully');
    // ...
  });

});
}

pushNotificationToSfdc("2325", "init", false, "some", "sdsg", "", "kamipa@gm");