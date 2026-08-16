'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.ELECTRON_IS_DEV === '1';

let logEnabled = false;
let logStream = null;

function getLogPath() {
  return isDev
    ? path.join(app.getAppPath(), 'mentat.log')
    : path.join(path.dirname(process.execPath), 'mentat.log');
}

function log(level, ...args) {
  if (!logEnabled) return;
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  if (!logStream) logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
  logStream.write(line + '\n');
}

function setLoggingEnabled(enabled) {
  logEnabled = !!enabled;
  if (!enabled && logStream) { logStream.end(); logStream = null; }
  if (enabled) log('INFO', 'Logging enabled. Path:', getLogPath());
}

function closeLogStream() {
  if (logStream) { logStream.end(); logStream = null; }
}

module.exports = { getLogPath, log, setLoggingEnabled, closeLogStream };
