const fs = require("fs");
const key = fs.readFileSync("./piirs-1d68b-firebase-adminsdk.json", "utf8");
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
