const {
  exec
} = require('child_process');

exports.run = (command, commandScript) => {

  console.debug("*** command run called, command=" + command + ", commandScript=" + commandScript);

  return new Promise((resolve) => {

    exec(commandScript, (err, stdout, stderr) => {

      console.debug("*** inside command run exec, command=" + command + ", commandScript=" + commandScript);
  
      if (stderr && err) {
        console.error('run:err', command, commandScript, stdout);
        resolve(null, stderr.replace(/\r?\n|\r/, '').trim());
      }

      
      resolve(stdout.replace(/\r?\n|\r/, '').trim(), null);

      console.debug("*** inside command run exec, after resolve stdout=" + stdout);
      
    });
  });
};