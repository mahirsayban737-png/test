const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`Test is running. Time: ${new Date().toLocaleTimeString()}`);
});

app.listen(port, () => {
  console.log('--- TEST SCRIPT STARTED ---');
  console.log('If you see this, Railway is working correctly.');
  console.log('I will print a heartbeat message every 15 seconds.');

  setInterval(() => {
    console.log(`Heartbeat: I am still alive. ${new Date().toLocaleTimeString()}`);
  }, 15000);
});
