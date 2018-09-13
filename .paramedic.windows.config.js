module.exports = {
    "plugins": [ "." ],
    "platform": "windows@6.0.0",
    "action": "run",
    "args": "--archs=x64 -- --appx=uap",
    "verbose": true,
    "cleanUpAfterRun": true,
    "logMins": 5
}